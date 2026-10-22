import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { BuildingState, JammerState } from '../../types'
import type { RadioChannel } from '../../lib/runIni'
import { fieldContext, liveJammers } from '../../lib/jammerField'
import { jammerPositionAt } from '../../lib/jammers'
import type { VolumeGrid } from '../../lib/jammerField'
import type { FieldRequest, FieldResponse } from '../../lib/jammerField.worker'
import { JAMMER_FIELD_BANDS } from '../../styles/tokens'
import { simToThree } from './utils/coordinates'

interface Props {
  jammers: JammerState[]
  channel: RadioChannel
  buildings: BuildingState[]
  carrierHz: number
  volume: VolumeGrid
  timeS: number
  nextTimeS: number | null
  alphaRef: MutableRefObject<number>
  posScale: number
}

/** Buildings the shader can stop rays at; the nearest to the volume are kept */
const MAX_BOXES = 128

/** Shell levels (dB over noise) and the band colour each one wears */
const SHELLS = [0, 10, 20, 30]
const shellColor = (db: number) =>
  new THREE.Color(JAMMER_FIELD_BANDS.find((b) => b.fromDb === db)?.color ?? '#e11d48')

const VERTEX = /* glsl */ `
uniform vec3 cameraWorld;
varying vec3 vOrigin;
varying vec3 vDirection;
varying vec3 vDirectionWorld;
void main() {
  vOrigin = (inverse(modelMatrix) * vec4(cameraWorld, 1.0)).xyz;
  vDirection = position - vOrigin;
  vDirectionWorld = (modelMatrix * vec4(vDirection, 0.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Ray-march the unit box. The 3-D texture holds R = jammer power over noise (dB) and
// G = how far inside a jammer's range/beam the cell is (above 0.5 = counted). Each time the
// ray crosses a shell level, or the range edge, it adds a lit, rim-brightened glass layer;
// between shells a faint glow grows with the jamming.
const FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D field;
uniform vec3 shellColors[${SHELLS.length}];
uniform float shellLevels[${SHELLS.length}];
uniform vec3 edgeColor;
uniform vec3 size;
uniform vec3 texel;
uniform vec3 cameraWorld;
uniform vec3 boxMin[${MAX_BOXES}];
uniform vec3 boxMax[${MAX_BOXES}];
uniform int boxCount;
varying vec3 vOrigin;
varying vec3 vDirection;
varying vec3 vDirectionWorld;

vec2 hitBox(vec3 o, vec3 d) {
  vec3 inv = 1.0 / d;
  vec3 a = (vec3(-0.5) - o) * inv;
  vec3 b = (vec3(0.5) - o) * inv;
  vec3 lo = min(a, b);
  vec3 hi = max(a, b);
  return vec2(max(lo.x, max(lo.y, lo.z)), min(hi.x, min(hi.y, hi.z)));
}

// The nearest building the ray hits, in the same ray parameter as the box-local march, so
// the volume stops at walls the way the depth buffer would stop an opaque surface
float nearestBuilding(vec3 dirWorld) {
  float best = 1e20;
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= boxCount) break;
    vec3 inv = 1.0 / dirWorld;
    vec3 a = (boxMin[i] - cameraWorld) * inv;
    vec3 b = (boxMax[i] - cameraWorld) * inv;
    vec3 lo = min(a, b);
    vec3 hi = max(a, b);
    float t0 = max(lo.x, max(lo.y, lo.z));
    float t1 = min(hi.x, min(hi.y, hi.z));
    if (t1 >= max(t0, 0.0)) best = min(best, max(t0, 0.0));
  }
  return best;
}

// box-local (x, altitude, sim y) to texture (sim x, sim y, altitude)
vec3 uvw(vec3 p) { return vec3(p.x, p.z, p.y) + 0.5; }
vec2 sampleField(vec3 p) { return texture(field, uvw(p)).rg; }

// gradient of one channel, in metres, as a box-local direction
vec3 gradientAt(vec3 p, int ch) {
  vec3 t = uvw(p);
  vec3 g;
  g.x = texture(field, t + vec3(texel.x, 0, 0))[ch] - texture(field, t - vec3(texel.x, 0, 0))[ch];
  g.z = texture(field, t + vec3(0, texel.y, 0))[ch] - texture(field, t - vec3(0, texel.y, 0))[ch];
  g.y = texture(field, t + vec3(0, 0, texel.z))[ch] - texture(field, t - vec3(0, 0, texel.z))[ch];
  return g / (2.0 * texel.xzy * size);
}

vec4 shell(vec3 color, vec3 normal, vec3 view, float strength) {
  float len = length(normal);
  // a flat spot has no direction; face the viewer rather than return NaN
  vec3 n = len > 1e-6 ? normal / len : view;
  float facing = abs(dot(n, view));
  float rim = pow(1.0 - facing, 2.0);
  float light = 0.62 + 0.38 * max(dot(n, normalize(vec3(0.35, 1.0, 0.25))), 0.0);
  return vec4(color * light + rim * 0.18, strength * (0.10 + 0.55 * rim));
}

void main() {
  vec3 dir = normalize(vDirection);
  vec2 span = hitBox(vOrigin, dir);
  if (span.x > span.y) discard;
  span.x = max(span.x, 0.0);
  span.y = min(span.y, nearestBuilding(vDirectionWorld / length(vDirection)));
  if (span.x > span.y) discard;
  vec3 view = normalize(-dir * size);

  // about four steps per cell along the ray
  float stepLocal = 0.25 * min(texel.x, min(texel.y, texel.z));
  float metresPerLocal = length(dir * size);
  vec4 acc = vec4(0.0);
  // jitter each pixel's start by up to one step, so the sampling never shows as ripples
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  span.x += jitter * stepLocal;
  vec3 p = vOrigin + span.x * dir;
  vec2 prev = sampleField(p);
  // Which side of each level the ray is on. A side only flips once the field is clearly
  // past the level, so a ray skimming along a shell (where storage rounding wiggles the
  // field around the level) draws it once instead of as scattered grain.
  float side[${SHELLS.length}];
  for (int k = 0; k < ${SHELLS.length}; k++) side[k] = sign(prev.r - shellLevels[k] + 1e-4);
  float gateSide = sign(prev.g - 0.5 + 1e-4);
  for (int i = 0; i < 1536; i++) {
    float t = span.x + float(i + 1) * stepLocal;
    if (t > span.y || acc.a > 0.97) break;
    p = vOrigin + t * dir;
    vec2 s = sampleField(p);
    float db = s.r;
    bool inside = s.g > 0.5;

    vec4 add = vec4(0.0);
    // the simulator's range/beam edge: the outer glass of the dome
    float gateNow = s.g > 0.53 ? 1.0 : (s.g < 0.47 ? -1.0 : gateSide);
    if (gateNow != gateSide) {
      gateSide = gateNow;
      // measure the surface where the ray actually crossed it, not a step later
      vec3 at = p - dir * stepLocal * clamp((s.g - 0.5) / (s.g - prev.g), 0.0, 1.0);
      add = shell(edgeColor, gradientAt(at, 1), view, 0.38);
    } else if (inside) {
      for (int k = 0; k < ${SHELLS.length}; k++) {
        float level = shellLevels[k];
        float now = db > level + 0.25 ? 1.0 : (db < level - 0.25 ? -1.0 : side[k]);
        if (now != side[k]) {
          side[k] = now;
          vec3 at = p - dir * stepLocal * clamp((db - level) / (db - prev.r), 0.0, 1.0);
          vec4 c = shell(shellColors[k], gradientAt(at, 0), view, 0.85);
          add.rgb += c.rgb * c.a;
          add.a += c.a;
        }
      }
      if (add.a > 0.0) add.rgb /= add.a;
      // glow between shells, stronger where the jamming is
      float glow = 0.0035 * smoothstep(0.0, 35.0, db) * stepLocal * metresPerLocal;
      vec3 band = shellColors[int(clamp(floor(db / 10.0), 0.0, 3.0))];
      add.rgb = mix(band, add.rgb, step(0.001, add.a));
      add.a = clamp(add.a + glow, 0.0, 1.0);
    } else {
      // outside the dome the levels still track, so re-entering never fakes a crossing
      for (int k = 0; k < ${SHELLS.length}; k++) side[k] = sign(db - shellLevels[k] + 1e-4);
    }
    acc.rgb += (1.0 - acc.a) * add.rgb * add.a;
    acc.a += (1.0 - acc.a) * add.a;
    prev = s;
  }
  if (acc.a < 0.01) discard;
  gl_FragColor = vec4(acc.rgb / acc.a, acc.a);
  #include <colorspace_fragment>
}
`

const workerCount = () =>
  Math.max(
    1,
    Math.min(4, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1
  )

/**
 * The jamming field as a 3-D volume: nested glass shells at 0, 10, 20 and 30 dB over the
 * noise floor inside each jammer's range dome, carved by building shadows. Computed in a
 * small worker pool from the same model as the slice.
 */
export function JammerVolumeLayer({
  jammers,
  channel,
  buildings,
  carrierHz,
  volume,
  timeS,
  nextTimeS,
  alphaRef,
  posScale,
}: Props) {
  const ctx = useMemo(
    () => fieldContext(channel, carrierHz, buildings),
    [channel, carrierHz, buildings]
  )
  const { plan, heights, cellZ, follow } = volume
  const nz = heights.length

  const { texture, texels } = useMemo(() => {
    const texels = new Uint16Array(plan.nx * plan.ny * nz * 2)
    const t = new THREE.Data3DTexture(texels, plan.nx, plan.ny, nz)
    t.format = THREE.RGFormat
    t.type = THREE.HalfFloatType
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.unpackAlignment = 1
    t.needsUpdate = true
    return { texture: t, texels }
  }, [plan, nz])
  useEffect(() => () => texture.dispose(), [texture])

  const size = useMemo(
    () =>
      new THREE.Vector3(plan.nx * plan.cell, nz * cellZ, plan.ny * plan.cell).multiplyScalar(
        posScale
      ),
    [plan, nz, cellZ, posScale]
  )

  const boxUniforms = useMemo(() => {
    const pad = (v: THREE.Vector3[]) => {
      while (v.length < MAX_BOXES) v.push(new THREE.Vector3())
      return v
    }
    // only matters past MAX_BOXES buildings: keep those nearest where the jammers start
    const home = jammers.length ? jammerPositionAt(jammers[0], 0) : { x: 0, y: 0 }
    const near = [...buildings]
      .sort(
        (a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y)
      )
      .slice(0, MAX_BOXES)
    const corner = (b: BuildingState, sx: number, sy: number, top: boolean) =>
      new THREE.Vector3(
        ...simToThree(
          b.x + (sx * b.width) / 2,
          b.y + (sy * b.depth) / 2,
          top ? b.z + b.height : b.z,
          3,
          posScale
        )
      )
    return {
      min: pad(near.map((b) => corner(b, -1, -1, false))),
      max: pad(near.map((b) => corner(b, 1, 1, true))),
      count: near.length,
    }
  }, [buildings, jammers, posScale])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          field: { value: texture },
          shellColors: { value: SHELLS.map(shellColor) },
          shellLevels: { value: SHELLS },
          edgeColor: { value: new THREE.Color('#fb7185') },
          size: { value: size },
          texel: { value: new THREE.Vector3(1 / plan.nx, 1 / plan.ny, 1 / nz) },
          cameraWorld: { value: new THREE.Vector3() },
          boxMin: { value: boxUniforms.min },
          boxMax: { value: boxUniforms.max },
          boxCount: { value: boxUniforms.count },
        },
        transparent: true,
        // rays stop at buildings in the shader instead, so walls inside the box don't punch holes
        depthTest: false,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    [texture, size, plan, nz, boxUniforms]
  )
  useEffect(() => () => material.dispose(), [material])

  // grid centre relative to its origin (the jammer when following, else the sim origin)
  const centre = {
    x: plan.x0 + ((plan.nx - 1) * plan.cell) / 2,
    y: plan.y0 + ((plan.ny - 1) * plan.cell) / 2,
  }
  const meshRef = useRef<THREE.Mesh>(null)
  const poolRef = useRef<Worker[]>([])
  const pendingRef = useRef(0)
  const sentKeyRef = useRef('')
  const generationRef = useRef(0)
  const hasFieldRef = useRef(false)
  /** sim x, y the grid's offsets were taken from, for the last request and the shown field */
  const requestOriginRef = useRef({ x: 0, y: 0 })
  const shownOriginRef = useRef({ x: 0, y: 0 })

  // Each worker takes an interleaved share of the layers and writes them straight in
  useEffect(() => {
    const layer = plan.nx * plan.ny
    const pool = Array.from({ length: workerCount() }, (_, w) => {
      const worker = new Worker(new URL('../../lib/jammerField.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.onmessage = (event: MessageEvent<FieldResponse>) => {
        pendingRef.current -= 1
        if (event.data.id !== generationRef.current) return
        const { overNoiseDb, counted } = event.data
        for (let j = 0, k = w; k < nz; j++, k += pool.length) {
          for (let c = 0; c < layer; c++) {
            const src = j * layer + c
            const dst = (k * layer + c) * 2
            texels[dst] = THREE.DataUtils.toHalfFloat(Math.max(-60, Math.min(80, overNoiseDb[src])))
            texels[dst + 1] = THREE.DataUtils.toHalfFloat(counted[src])
          }
        }
        if (pendingRef.current === 0) {
          texture.needsUpdate = true
          hasFieldRef.current = true
          shownOriginRef.current = requestOriginRef.current
        }
      }
      return worker
    })
    poolRef.current = pool
    return () => {
      pool.forEach((worker) => worker.terminate())
      poolRef.current = []
      pendingRef.current = 0
    }
  }, [texture, texels, plan, nz])

  useEffect(() => {
    generationRef.current += 1
    sentKeyRef.current = ''
    hasFieldRef.current = false
  }, [volume, ctx])

  useFrame(({ camera }) => {
    const mesh = meshRef.current
    if (!mesh) return
    ;(mesh.material as THREE.ShaderMaterial).uniforms.cameraWorld.value.copy(camera.position)
    const o = shownOriginRef.current
    const [mx, , mz] = simToThree(o.x + centre.x, o.y + centre.y, 0, 3, posScale)
    mesh.position.set(mx, size.y / 2, mz)
    const t = nextTimeS === null ? timeS : timeS + (nextTimeS - timeS) * alphaRef.current
    const live = liveJammers(jammers, t, carrierHz)
    mesh.visible = live.length > 0 && hasFieldRef.current
    const pool = poolRef.current
    if (!live.length || pendingRef.current > 0 || !pool.length) return
    const key = live
      .map(
        ({ jammer, position: p }) =>
          `${jammer.id}@${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`
      )
      .join('|')
    if (key === sentKeyRef.current) return
    sentKeyRef.current = key
    pendingRef.current = pool.length
    const origin = follow ? { x: live[0].position.x, y: live[0].position.y } : { x: 0, y: 0 }
    requestOriginRef.current = origin
    const grid = { ...plan, x0: plan.x0 + origin.x, y0: plan.y0 + origin.y }
    pool.forEach((worker, w) => {
      const request: FieldRequest = {
        id: generationRef.current,
        live,
        ctx,
        grid,
        heights: heights.filter((_, k) => k % pool.length === w),
      }
      worker.postMessage(request)
    })
  })

  return (
    <mesh ref={meshRef} scale={size} material={material} visible={false} renderOrder={3}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  )
}

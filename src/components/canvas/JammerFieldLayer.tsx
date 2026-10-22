import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { BuildingState, JammerState } from '../../types'
import type { RadioChannel } from '../../lib/runIni'
import { fieldContext, liveJammers } from '../../lib/jammerField'
import type { FieldGrid, VolumeGrid } from '../../lib/jammerField'
import type { FieldRequest, FieldResponse } from '../../lib/jammerField.worker'
import { JAMMER_FIELD_BANDS, JAMMER_FIELD_STEP_DB } from '../../styles/tokens'
import { simToThree } from './utils/coordinates'

/** What the scene needs to draw the jamming map */
export interface JammerMap {
  channel: RadioChannel
  /** 'volume': the 3-D field in the range dome; 'slice': one sheet at `heightM` */
  mode: 'volume' | 'slice'
  grid: FieldGrid
  volume: VolumeGrid
  /** receiver height the slice is drawn for (sim metres) */
  heightM: number
}

interface Props {
  jammers: JammerState[]
  channel: RadioChannel
  buildings: BuildingState[]
  carrierHz: number
  grid: FieldGrid
  /** receiver height the map is drawn for (sim metres) */
  heightM: number
  timeS: number
  nextTimeS: number | null
  alphaRef: MutableRefObject<number>
  dim: 2 | 3
  posScale: number
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// R: jammer power over noise (dB). G: 1 where the simulator counts the jamming (inside a
// jammer's range and beam, outside buildings). Bands are 5 dB, with a faint contour between
// them and a solid line where the range or beam stops counting.
const FRAGMENT = /* glsl */ `
uniform sampler2D field;
uniform vec3 bands[${JAMMER_FIELD_BANDS.length}];
uniform vec3 edgeColor;
uniform float opacity;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(field, vec2(vUv.x, 1.0 - vUv.y));
  float db = s.r;
  float counted = s.g;
  float edgeW = max(fwidth(counted), 1e-4);
  float edge = 1.0 - smoothstep(0.0, edgeW * 1.2, abs(counted - 0.5));
  float inside = smoothstep(0.5 - edgeW * 0.5, 0.5 + edgeW * 0.5, counted);

  float x = db / ${JAMMER_FIELD_STEP_DB.toFixed(1)};
  // band 0 is everything under the noise floor, then one band per step
  float band = db < 0.0 ? 0.0 : clamp(floor(x) + 1.0, 1.0, ${(JAMMER_FIELD_BANDS.length - 1).toFixed(1)});
  vec3 color = bands[int(band)];
  float f = fract(x);
  float contour = 1.0 - smoothstep(0.0, fwidth(x) * 1.2, min(f, 1.0 - f));
  color = mix(color, edgeColor, 0.35 * contour * step(0.0, db));

  float fill = db < -10.0 ? 0.0 : (db < 0.0 ? 0.35 : 1.0);
  float a = opacity * fill * inside;
  vec4 outColor = vec4(color, a);
  outColor = mix(outColor, vec4(edgeColor, 0.9), edge);
  if (outColor.a < 0.01) discard;
  gl_FragColor = outColor;
  #include <colorspace_fragment>
}
`

/**
 * The jamming a receiver at one height would see, as a sheet over the scene. Computed in a
 * worker from the same gates and 3GPP path loss as the simulator, without shadow fading.
 */
export function JammerFieldLayer({
  jammers,
  channel,
  buildings,
  carrierHz,
  grid,
  heightM,
  timeS,
  nextTimeS,
  alphaRef,
  dim,
  posScale,
}: Props) {
  const ctx = useMemo(
    () => fieldContext(channel, carrierHz, buildings),
    [channel, carrierHz, buildings]
  )

  const { texture, texels } = useMemo(() => {
    const texels = new Uint16Array(grid.nx * grid.ny * 4)
    const t = new THREE.DataTexture(texels, grid.nx, grid.ny, THREE.RGBAFormat, THREE.HalfFloatType)
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.needsUpdate = true
    return { texture: t, texels }
  }, [grid])
  useEffect(() => () => texture.dispose(), [texture])

  // Rebuilt when the grid (texture) or view changes, both rare, so nothing mutates it
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          field: { value: texture },
          bands: { value: JAMMER_FIELD_BANDS.map((b) => new THREE.Color(b.color)) },
          edgeColor: { value: new THREE.Color('#881337') },
          opacity: { value: dim === 2 ? 0.72 : 0.6 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [texture, dim]
  )
  useEffect(() => () => material.dispose(), [material])

  // One request in flight at a time; the newest jammer state is sent when it returns
  const meshRef = useRef<THREE.Mesh>(null)
  const workerRef = useRef<Worker | null>(null)
  const busyRef = useRef(false)
  const sentKeyRef = useRef('')
  const generationRef = useRef(0)
  const hasFieldRef = useRef(false)

  useEffect(() => {
    const worker = new Worker(new URL('../../lib/jammerField.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<FieldResponse>) => {
      busyRef.current = false
      if (event.data.id !== generationRef.current) return
      const { overNoiseDb, counted } = event.data
      const data = texels
      for (let k = 0; k < counted.length; k++) {
        data[k * 4] = THREE.DataUtils.toHalfFloat(Math.max(-60, Math.min(80, overNoiseDb[k])))
        data[k * 4 + 1] = THREE.DataUtils.toHalfFloat(counted[k])
        data[k * 4 + 3] = THREE.DataUtils.toHalfFloat(1)
      }
      texture.needsUpdate = true
      hasFieldRef.current = true
    }
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
      busyRef.current = false
    }
  }, [texture, texels])

  // A new grid, height or channel starts over; stale answers are dropped
  useEffect(() => {
    generationRef.current += 1
    sentKeyRef.current = ''
    hasFieldRef.current = false
  }, [grid, heightM, ctx])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = nextTimeS === null ? timeS : timeS + (nextTimeS - timeS) * alphaRef.current
    const live = liveJammers(jammers, t, carrierHz)
    mesh.visible = live.length > 0 && hasFieldRef.current
    if (!live.length || busyRef.current || !workerRef.current) return
    const key = live
      .map(
        ({ jammer, position: p }) =>
          `${jammer.id}@${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`
      )
      .join('|')
    if (key === sentKeyRef.current) return
    sentKeyRef.current = key
    busyRef.current = true
    const request: FieldRequest = { id: generationRef.current, live, ctx, heights: [heightM], grid }
    workerRef.current.postMessage(request)
  })

  const cx = grid.x0 + ((grid.nx - 1) * grid.cell) / 2
  const cy = grid.y0 + ((grid.ny - 1) * grid.cell) / 2
  const [x, y, z] = simToThree(cx, cy, heightM, dim, posScale)
  return (
    <mesh
      ref={meshRef}
      position={[x, y + 0.05, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      visible={false}
      renderOrder={2}
    >
      <planeGeometry args={[grid.nx * grid.cell * posScale, grid.ny * grid.cell * posScale]} />
    </mesh>
  )
}

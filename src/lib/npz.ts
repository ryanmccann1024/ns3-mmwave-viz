// Minimal reader for NumPy .npz archives (a zip of .npy arrays), enough for the
// numeric arrays Stable-Baselines3's EvalCallback writes to evaluations.npz.

export interface NpyArray {
  shape: number[]
  data: number[]
}

const DTYPES: Record<
  string,
  { size: number; read: (v: DataView, o: number, le: boolean) => number }
> = {
  f8: { size: 8, read: (v, o, le) => v.getFloat64(o, le) },
  f4: { size: 4, read: (v, o, le) => v.getFloat32(o, le) },
  i8: { size: 8, read: (v, o, le) => Number(v.getBigInt64(o, le)) },
  i4: { size: 4, read: (v, o, le) => v.getInt32(o, le) },
  u8: { size: 8, read: (v, o, le) => Number(v.getBigUint64(o, le)) },
  u4: { size: 4, read: (v, o, le) => v.getUint32(o, le) },
}

/** Parse one .npy buffer (format versions 1-3, C order, numeric dtypes only). */
export function parseNpy(bytes: Uint8Array): NpyArray {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = String.fromCharCode(...bytes.subarray(1, 6))
  if (bytes[0] !== 0x93 || magic !== 'NUMPY') throw new Error('not a .npy array')
  const major = bytes[6]
  const headerLen = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true)
  const headerStart = major === 1 ? 10 : 12
  const header = new TextDecoder().decode(bytes.subarray(headerStart, headerStart + headerLen))
  const descr = header.match(/'descr':\s*'([<>|=]?)([a-z]\d+)'/)
  const fortran = /'fortran_order':\s*True/.test(header)
  const shapeText = header.match(/'shape':\s*\(([^)]*)\)/)
  if (!descr || !shapeText) throw new Error('unreadable .npy header')
  if (fortran) throw new Error('Fortran-ordered arrays are not supported')
  const dtype = DTYPES[descr[2]]
  if (!dtype) throw new Error(`unsupported dtype ${descr[2]}`)
  const shape = shapeText[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
  const count = shape.reduce((a, b) => a * b, 1)
  const littleEndian = descr[1] !== '>'
  const start = headerStart + headerLen
  const data: number[] = new Array(count)
  for (let i = 0; i < count; i++) data[i] = dtype.read(view, start + i * dtype.size, littleEndian)
  return { shape, data }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Every array in an .npz archive, keyed by name without the .npy suffix. */
export async function parseNpz(buffer: ArrayBuffer): Promise<Record<string, NpyArray>> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  // End of central directory: scan back from the end for its signature
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip archive')
  const entries = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const out: Record<string, NpyArray> = {}
  for (let n = 0; n < entries; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('corrupt zip directory')
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    offset += 46 + nameLen + extraLen + commentLen

    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const raw = bytes.subarray(dataStart, dataStart + compressedSize)
    let content: Uint8Array
    if (method === 0) content = raw
    else if (method === 8) content = await inflateRaw(raw)
    else throw new Error(`${name}: unsupported zip compression ${method}`)
    out[name.replace(/\.npy$/, '')] = parseNpy(content)
  }
  return out
}

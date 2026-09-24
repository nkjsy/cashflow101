// Packs a build folder into a portal-ready zip with index.html at the archive root.
// Usage: node scripts/zip-dist.mjs <build-dir> <output.zip>
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { deflateRawSync } from 'node:zlib'

const [sourceDir, outputFile] = process.argv.slice(2)
if (!sourceDir || !outputFile) {
  console.error('Usage: node scripts/zip-dist.mjs <build-dir> <output.zip>')
  process.exit(1)
}

// Fixed timestamp (2026-01-01) keeps archives reproducible and valid for strict unzip tools.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
const crc32 = (buffer) => {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const listFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? listFiles(path) : [path]
})

const files = listFiles(sourceDir).sort()
if (!files.some((file) => relative(sourceDir, file) === 'index.html')) {
  console.error(`${sourceDir} has no index.html; run the build first.`)
  process.exit(1)
}

const localParts = []
const centralParts = []
let offset = 0
for (const file of files) {
  const name = Buffer.from(relative(sourceDir, file).split(sep).join('/'))
  const data = readFileSync(file)
  const compressed = deflateRawSync(data, { level: 9 })
  const crc = crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6) // UTF-8 names
  local.writeUInt16LE(8, 8) // deflate
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  localParts.push(local, name, compressed)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(DOS_DATE, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(offset, 42)
  centralParts.push(central, name)

  offset += local.length + name.length + compressed.length
}

const centralDirectory = Buffer.concat(centralParts)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralDirectory.length, 12)
end.writeUInt32LE(offset, 16)

mkdirSync(dirname(outputFile), { recursive: true })
writeFileSync(outputFile, Buffer.concat([...localParts, centralDirectory, end]))
const size = statSync(outputFile).size
console.log(`${outputFile}: ${files.length} files, ${(size / 1024).toFixed(0)} KB`)

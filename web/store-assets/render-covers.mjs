// Renders the CrazyGames store covers (16:9, 2:3, 1:1) from one vector design.
// Usage (from web/): node store-assets/render-covers.mjs
// Needs network access once for the Lilita One title font (SIL Open Font License).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'covers')

const colors = {
  deep: '#0d3a2c',
  green: '#16664d',
  mid: '#1f7a5c',
  paper: '#fbfcf8',
  gold: '#f5cf73',
  goldDark: '#c99a2e',
  ink: '#0b2c22',
  tiles: ['#e2f0e9', '#fbfcf8', '#f7e6e2', '#fbfcf8', '#fff3d6', '#fbfcf8', '#e2f0e9', '#f7e6e2'],
  pawns: ['#39758d', '#d9784a', '#8c6bc8'],
}

const polar = (cx, cy, radius, degrees) => {
  const angle = (degrees - 90) * Math.PI / 180
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]
}

const sparkle = (x, y, size, fill) =>
  `<path d="M${x} ${y - size} Q${x + size * 0.18} ${y - size * 0.18} ${x + size} ${y} Q${x + size * 0.18} ${y + size * 0.18} ${x} ${y + size} Q${x - size * 0.18} ${y + size * 0.18} ${x - size} ${y} Q${x - size * 0.18} ${y - size * 0.18} ${x} ${y - size}Z" fill="${fill}"/>`

const pawn = (x, y, size, fill) => `
  <g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="${size * 0.95}" rx="${size * 0.9}" ry="${size * 0.28}" fill="${colors.ink}" opacity=".25"/>
    <path d="M${-size * 0.7} ${size * 0.85} Q0 ${-size * 0.25} ${size * 0.7} ${size * 0.85}Z" fill="${fill}" stroke="${colors.paper}" stroke-width="${size * 0.14}" stroke-linejoin="round"/>
    <circle cx="0" cy="${-size * 0.2}" r="${size * 0.42}" fill="${fill}" stroke="${colors.paper}" stroke-width="${size * 0.14}"/>
  </g>`

const coin = (x, y, radius) => `
  <g transform="translate(${x} ${y})">
    <circle r="${radius * 1.04}" cy="${radius * 0.1}" fill="${colors.goldDark}"/>
    <circle r="${radius}" fill="${colors.gold}"/>
    <circle r="${radius * 0.78}" fill="none" stroke="${colors.goldDark}" stroke-width="${radius * 0.07}"/>
    <path d="M${radius * 0.22} ${-radius * 0.3}h${-radius * 0.34}a${radius * 0.17} ${radius * 0.17} 0 0 0 0 ${radius * 0.34}h${radius * 0.2}a${radius * 0.17} ${radius * 0.17} 0 0 1 0 ${radius * 0.34}h${-radius * 0.38}M0 ${-radius * 0.5}v${radius * 0.2}M0 ${radius * 0.38}v${radius * 0.2}"
      fill="none" stroke="${colors.ink}" stroke-width="${radius * 0.13}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`

const coinStack = (x, y, width, count) => Array.from({ length: count }, (_, index) => `
  <ellipse cx="${x}" cy="${y - index * width * 0.16 + width * 0.06}" rx="${width / 2}" ry="${width * 0.2}" fill="${colors.goldDark}"/>
  <ellipse cx="${x}" cy="${y - index * width * 0.16}" rx="${width / 2}" ry="${width * 0.2}" fill="${colors.gold}" stroke="${colors.goldDark}" stroke-width="${width * 0.03}"/>`).join('')

// The loop board with an escape arrow breaking out toward the upper right.
const art = ({ cx, cy, r, escape }) => {
  const tileCount = 16
  const tileSize = r * 0.3
  const tiles = Array.from({ length: tileCount }, (_, index) => {
    const degrees = index * 360 / tileCount
    const [x, y] = polar(cx, cy, r, degrees)
    return `<rect x="${x - tileSize / 2}" y="${y - tileSize / 2}" width="${tileSize}" height="${tileSize}" rx="${tileSize * 0.2}"
      fill="${colors.tiles[index % colors.tiles.length]}" stroke="${colors.deep}" stroke-width="${r * 0.012}" transform="rotate(${degrees} ${x} ${y})"/>`
  }).join('')

  const startAngle = 185
  const endAngle = 330
  const arrowRadius = r * 1.3
  const [sx, sy] = polar(cx, cy, arrowRadius, startAngle)
  const [ex, ey] = polar(cx, cy, arrowRadius, endAngle)
  const tx = cx + escape[0] * r
  const ty = cy - escape[1] * r
  const tangent = (endAngle + 90 - 90) * Math.PI / 180
  const control = [ex + Math.cos(tangent) * r * 0.55, ey + Math.sin(tangent) * r * 0.55]
  const headAngle = Math.atan2(ty - control[1], tx - control[0])
  const head = (distance, spread) => [tx + Math.cos(headAngle + spread) * distance, ty + Math.sin(headAngle + spread) * distance]
  const [h1x, h1y] = head(-r * 0.34, -0.55)
  const [h2x, h2y] = head(-r * 0.34, 0.55)
  const arrowPath = `M${sx} ${sy} A${arrowRadius} ${arrowRadius} 0 0 1 ${ex} ${ey} Q${control[0]} ${control[1]} ${tx - Math.cos(headAngle) * r * 0.2} ${ty - Math.sin(headAngle) * r * 0.2}`

  const pawns = [[40, 0], [115, 1], [250, 2]].map(([degrees, colorIndex]) => {
    const [x, y] = polar(cx, cy, r, degrees)
    return pawn(x, y - r * 0.02, r * 0.11, colors.pawns[colorIndex])
  }).join('')
  const [runnerX, runnerY] = [ex + (control[0] - ex) * 0.55, ey + (control[1] - ey) * 0.55]

  return `
    <circle cx="${cx}" cy="${cy}" r="${r * 1.55}" fill="${colors.mid}" opacity=".35"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors.ink}" stroke-width="${r * 0.42}" opacity=".35"/>
    ${tiles}
    ${coinStack(cx - r * 0.3, cy + r * 0.42, r * 0.34, 4)}
    ${coinStack(cx + r * 0.32, cy + r * 0.46, r * 0.34, 3)}
    ${coin(cx, cy - r * 0.08, r * 0.42)}
    <path d="${arrowPath}" fill="none" stroke="${colors.ink}" stroke-width="${r * 0.2}" stroke-linecap="round" opacity=".35" transform="translate(${r * 0.03} ${r * 0.05})"/>
    <path d="${arrowPath}" fill="none" stroke="${colors.gold}" stroke-width="${r * 0.16}" stroke-linecap="round"/>
    <path d="M${tx} ${ty} L${h1x} ${h1y} L${h2x} ${h2y}Z" fill="${colors.gold}" stroke="${colors.gold}" stroke-width="${r * 0.08}" stroke-linejoin="round"/>
    ${pawns}
    ${pawn(runnerX, runnerY - r * 0.12, r * 0.14, colors.gold)}
    ${sparkle(tx + r * 0.2, ty - r * 0.35, r * 0.13, colors.paper)}
    ${sparkle(tx - r * 0.35, ty - r * 0.2, r * 0.08, colors.gold)}
    ${sparkle(tx + r * 0.35, ty + r * 0.15, r * 0.07, colors.gold)}`
}

const title = ({ x, y, size, anchor }) => `
  <text x="${x}" y="${y + size * 0.07}" font-family="Lilita One" font-size="${size}" text-anchor="${anchor}" fill="${colors.ink}" opacity=".45">Ratrace</text>
  <text x="${x}" y="${y}" font-family="Lilita One" font-size="${size}" text-anchor="${anchor}" fill="${colors.paper}" stroke="${colors.ink}" stroke-width="${size * 0.05}" paint-order="stroke">Rat<tspan fill="${colors.gold}">race</tspan></text>`

const background = (width, height, glow) => `
  <defs>
    <radialGradient id="bg" cx="${glow[0]}" cy="${glow[1]}" r="0.9">
      <stop offset="0" stop-color="${colors.mid}"/>
      <stop offset="0.55" stop-color="${colors.green}"/>
      <stop offset="1" stop-color="${colors.deep}"/>
    </radialGradient>
    <pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="2" fill="${colors.paper}" opacity=".07"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#dots)"/>`

const covers = [
  {
    name: 'cover-landscape-1920x1080.png',
    width: 1920,
    height: 1080,
    body: () => background(1920, 1080, [0.68, 0.5])
      + art({ cx: 1370, cy: 590, r: 275, escape: [1.5, 1.35] })
      + title({ x: 110, y: 610, size: 250, anchor: 'start' }),
  },
  {
    name: 'cover-portrait-800x1200.png',
    width: 800,
    height: 1200,
    body: () => background(800, 1200, [0.5, 0.62])
      + art({ cx: 380, cy: 760, r: 210, escape: [1.45, 1.45] })
      + title({ x: 400, y: 280, size: 185, anchor: 'middle' }),
  },
  {
    name: 'cover-square-800x800.png',
    width: 800,
    height: 800,
    body: () => background(800, 800, [0.5, 0.42])
      + art({ cx: 370, cy: 330, r: 175, escape: [1.7, 1.2] })
      + title({ x: 400, y: 710, size: 165, anchor: 'middle' }),
  },
]

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
for (const cover of covers) {
  const page = await browser.newPage({ viewport: { width: cover.width, height: cover.height } })
  await page.setContent(`<!doctype html><html><head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&display=block">
    <style>html,body{margin:0;background:${colors.deep}}svg{display:block}</style></head>
    <body><svg xmlns="http://www.w3.org/2000/svg" width="${cover.width}" height="${cover.height}" viewBox="0 0 ${cover.width} ${cover.height}">${cover.body()}</svg></body></html>`)
  await page.evaluate(() => document.fonts.load('100px "Lilita One"'))
  await page.evaluate(() => document.fonts.ready)
  const loaded = await page.evaluate(() => document.fonts.check('100px "Lilita One"'))
  if (!loaded) throw new Error('Title font failed to load; check network access to Google Fonts.')
  await page.screenshot({ path: join(outDir, cover.name) })
  console.log(`${cover.name} ${cover.width}x${cover.height}`)
  await page.close()
}
await browser.close()

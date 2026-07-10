// Generate the TradingMD Remote icon set from res/branding/logo.svg (square
// logo, ex trading-08.svg) and res/branding/wordmark.svg (ex trading-01.svg).
//
// Usage: npm install sharp png2icons && node res/branding/generate_icons.js
const sharp = require('sharp');
const png2icons = require('png2icons');
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const REPO = path.join(__dirname, '..', '..');

const iconSvg = fs.readFileSync(path.join(SRC, 'logo.svg'));
const wordmarkSvg = fs.readFileSync(path.join(SRC, 'wordmark.svg'));

// Glyph-only variants (T + dot, no background tile), cropped to the glyph
// bounding box. Used for tray template / notification icons.
const glyphBox = '140 101 280 324'; // padded bbox of the shapes below
const glyph = (fill) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${glyphBox}">
    <g fill="${fill}">
      <rect x="250.52" y="170.01" width="11.14" height="220.39"/>
      <rect x="160" y="121.61" width="192" height="11.14"/>
      <circle cx="364.78" cy="369.86" r="34.36"/>
    </g>
  </svg>`);

// Round launcher icon: dark circle + original glyph.
const roundSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <circle cx="256" cy="256" r="256" fill="#0B1018"/>
    <rect x="250.52" y="170.01" width="11.14" height="220.39" fill="#FFFFFF"/>
    <rect x="160" y="121.61" width="192" height="11.14" fill="#FFFFFF"/>
    <circle cx="364.78" cy="369.86" r="34.36" fill="#F2B31B"/>
  </svg>`);

const DENSITY = 2048; // rasterize svg large, then downscale

async function renderPng(svg, size, opts = {}) {
  let img = sharp(svg, { density: DENSITY / 8 });
  img = img.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (opts.flatten) img = img.flatten({ background: opts.flatten }).removeAlpha();
  return img.png().toBuffer();
}

// Render svg scaled to `scale` of the canvas, centered on transparent canvas.
async function renderPadded(svg, size, scale) {
  const inner = Math.round(size * scale);
  const buf = await renderPng(svg, inner);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: buf }]).png().toBuffer();
}

async function writePng(dest, buf) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  const meta = await sharp(buf).metadata();
  console.log(`${dest}  ${meta.width}x${meta.height}`);
}

async function main() {
  const p = (rel) => path.join(REPO, rel);

  // --- master 1024 renders ---
  const icon1024 = await renderPng(iconSvg, 1024);
  const iconMac1024 = await renderPadded(iconSvg, 1024, 0.84); // Apple-style margin

  // --- res/ pngs ---
  await writePng(p('res/icon.png'), icon1024);
  await writePng(p('res/mac-icon.png'), iconMac1024);
  for (const s of [32, 64, 128]) {
    await writePng(p(`res/${s}x${s}.png`), await renderPng(iconSvg, s));
  }
  await writePng(p('res/128x128@2x.png'), await renderPng(iconSvg, 256));

  // --- tray ---
  // macOS tray: template image, only alpha matters
  await writePng(p('res/mac-tray-dark-x2.png'), await renderPng(glyph('#000000'), 60));
  await writePng(p('res/mac-tray-light-x2.png'), await renderPng(glyph('#FFFFFF'), 48));

  // --- ICO files ---
  const icoMain = png2icons.createICO(icon1024, png2icons.BICUBIC, 0, false, true);
  fs.writeFileSync(p('res/icon.ico'), icoMain);
  console.log(`res/icon.ico  ${icoMain.length} bytes`);
  fs.writeFileSync(p('flutter/windows/runner/resources/app_icon.ico'), icoMain);
  console.log('flutter/windows/runner/resources/app_icon.ico written');
  const icoTray = png2icons.createICO(await renderPng(iconSvg, 256), png2icons.BICUBIC, 0, false, true);
  fs.writeFileSync(p('res/tray-icon.ico'), icoTray);
  console.log(`res/tray-icon.ico  ${icoTray.length} bytes`);

  // --- ICNS (macOS app icon) ---
  const icns = png2icons.createICNS(iconMac1024, png2icons.BICUBIC, 0);
  fs.writeFileSync(p('flutter/macos/Runner/AppIcon.icns'), icns);
  console.log(`flutter/macos/Runner/AppIcon.icns  ${icns.length} bytes`);

  // --- SVG copies ---
  fs.writeFileSync(p('res/scalable.svg'), iconSvg);
  fs.writeFileSync(p('res/logo.svg'), iconSvg);
  fs.writeFileSync(p('flutter/assets/icon.svg'), iconSvg);
  fs.writeFileSync(p('res/logo-header.svg'), wordmarkSvg);
  fs.writeFileSync(p('res/rustdesk-banner.svg'), wordmarkSvg);
  console.log('svg copies written');

  // --- Android mipmaps ---
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(densities)) {
    const dir = p(`flutter/android/app/src/main/res/mipmap-${d}`);
    await writePng(path.join(dir, 'ic_launcher.png'), await renderPng(iconSvg, 48 * k));
    await writePng(path.join(dir, 'ic_launcher_round.png'), await renderPng(roundSvg, 48 * k));
    await writePng(path.join(dir, 'ic_launcher_foreground.png'),
      await renderPadded(iconSvg, 108 * k, 0.6));
    await writePng(path.join(dir, 'ic_stat_logo.png'),
      await renderPng(glyph('#FFFFFF'), 24 * k));
  }

  // --- iOS AppIcon.appiconset ---
  const setDir = p('flutter/ios/Runner/Assets.xcassets/AppIcon.appiconset');
  const contents = JSON.parse(fs.readFileSync(path.join(setDir, 'Contents.json'), 'utf8'));
  for (const img of contents.images) {
    if (!img.filename) continue;
    const base = parseFloat(img.size.split('x')[0]);
    const scale = parseInt(img.scale);
    const px = Math.round(base * scale);
    // iOS icons must be opaque; the tile color fills the rounded-corner gap.
    await writePng(path.join(setDir, img.filename),
      await renderPng(iconSvg, px, { flatten: '#0B1018' }));
  }

  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });

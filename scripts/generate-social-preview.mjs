// Generate the 1280x640 GitHub social preview card used for link previews on
// GitHub, LinkedIn, and anywhere else the repository URL is unfurled. It renders
// the app's Swiss palette and self hosted fonts in headless Chromium, so the card
// matches the interface rather than the default GitHub octocat. Run:
//   node scripts/generate-social-preview.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = new URL('..', import.meta.url);
const font = (path) => readFileSync(fileURLToPath(new URL(path, root))).toString('base64');

const sans400 = font('node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-400-normal.woff2');
const sans800 = font('node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff2');
const mono400 = font('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2');

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  @font-face { font-family: 'HG'; font-weight: 400; src: url(data:font/woff2;base64,${sans400}) format('woff2'); }
  @font-face { font-family: 'HG'; font-weight: 800; src: url(data:font/woff2;base64,${sans800}) format('woff2'); }
  @font-face { font-family: 'JB'; font-weight: 400; src: url(data:font/woff2;base64,${mono400}) format('woff2'); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1280px; height: 640px; background: #faf9f6; font-family: 'HG', sans-serif; color: #15140f; overflow: hidden; }
  .accent { height: 10px; background: #e5391c; }
  .frame { padding: 62px 80px; display: flex; gap: 64px; height: calc(640px - 10px); }
  .left { width: 600px; flex-shrink: 0; }
  .wordmark { font-weight: 800; font-size: 66px; letter-spacing: -0.03em; text-transform: uppercase; line-height: 1; }
  .rule { height: 3px; background: #15140f; width: 96px; margin: 26px 0; }
  .tagline { font-size: 30px; line-height: 1.35; font-weight: 400; color: #15140f; }
  .sub { margin-top: 22px; font-size: 18px; line-height: 1.6; color: #6e6b62; max-width: 520px; }
  .badges { margin-top: 40px; display: flex; gap: 10px; flex-wrap: wrap; }
  .badge { font-family: 'JB', monospace; font-size: 12.5px; letter-spacing: 0.1em; text-transform: uppercase;
           border: 1px solid #c9c5b8; padding: 7px 11px; color: #15140f; }
  .card { flex: 1; background: #fff; border: 1px solid #e3e0d7; border-left: 4px solid #e5391c; padding: 22px 28px; }
  .eyebrow { font-family: 'JB', monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #9c988d; }
  .row { display: flex; align-items: baseline; gap: 12px; padding: 6.5px 0; border-bottom: 1px solid #e3e0d7; }
  .num { font-family: 'JB', monospace; font-size: 12px; color: #9c988d; width: 22px; }
  .title { font-size: 16.5px; font-weight: 600; }
  .cat { margin-left: auto; font-family: 'JB', monospace; font-size: 10.5px; letter-spacing: 0.12em;
         text-transform: uppercase; color: #6e6b62; }
  .rowSel { background: #f1efe9; margin: 0 -28px; padding-left: 24px; padding-right: 28px; border-left: 4px solid #e5391c; }
  .eyebrow { display: block; margin-bottom: 6px; }
</style></head><body>
  <div class="accent"></div>
  <div class="frame">
    <div class="left">
      <div class="wordmark">Prompt<br />Bank</div>
      <div class="rule"></div>
      <div class="tagline">Reusable prompts,<br />composed locally,<br />pasted anywhere.</div>
      <div class="sub">Keep your prompts as local Markdown. Declare the parts that change as variables and optional sections, fill them in, then paste the composed text into whichever AI tool you use.</div>
      <div class="badges">
        <span class="badge">Variables</span>
        <span class="badge">Focus toggles</span>
        <span class="badge">Local files</span>
        <span class="badge">MIT</span>
      </div>
    </div>
    <div class="card">
      <div class="eyebrow">Index &mdash; 12 prompts</div>
      <div class="row rowSel"><span class="num">01</span><span class="title">Review a Pull Request</span><span class="cat">Review</span></div>
      <div class="row"><span class="num">02</span><span class="title">Review Working Tree Changes</span><span class="cat">Review</span></div>
      <div class="row"><span class="num">03</span><span class="title">Implementation Plan</span><span class="cat">Planning</span></div>
      <div class="row"><span class="num">04</span><span class="title">Investigate a Topic</span><span class="cat">Exploration</span></div>
      <div class="row"><span class="num">05</span><span class="title">Find the Root Cause</span><span class="cat">Debugging</span></div>
      <div class="row"><span class="num">06</span><span class="title">Explain a Codebase Area</span><span class="cat">Code</span></div>
      <div class="row"><span class="num">07</span><span class="title">Refactor Code</span><span class="cat">Code</span></div>
      <div class="row"><span class="num">08</span><span class="title">Compare Approaches</span><span class="cat">Analysis</span></div>
      <div class="row"><span class="num">09</span><span class="title">Rewrite for Clarity</span><span class="cat">Writing</span></div>
      <div class="row"><span class="num">10</span><span class="title">Summarize a Source</span><span class="cat">Writing</span></div>
      <div class="row"><span class="num">11</span><span class="title">New Worktree</span><span class="cat">CLI</span></div>
      <div class="row" style="border-bottom:none"><span class="num">12</span><span class="title">Summarize Branch Diff</span><span class="cat">CLI</span></div>
    </div>
  </div>
</body></html>`;

const tempPath = fileURLToPath(new URL('docs/.social-preview.html', root));
const outputPath = fileURLToPath(new URL('docs/social-preview.png', root));

writeFileSync(tempPath, html);
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await page.goto(`file://${tempPath.replace(/\\/g, '/')}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outputPath });
} finally {
  // Chromium may fail to launch when browsers are not installed, so the scratch
  // file has to be cleaned up even though it was written before that point.
  await browser?.close();
  try {
    unlinkSync(tempPath);
  } catch {
    // already gone
  }
}
console.log(`Wrote docs/social-preview.png (1280x640)`);

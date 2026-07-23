import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression guard for the packaged desktop app rendering completely unstyled.
//
// The UI relies on Fluent UI's makeStyles (Griffel), which injects its CSS into
// the document at runtime. Those injected style rules have no build time hash,
// so the Content Security Policy must keep 'unsafe-inline' effective for
// style-src. Tauri, by default, rewrites style-src by adding a hash for the
// inline <style> block in index.html, and per the CSP spec the presence of a
// hash (or nonce) makes the browser ignore 'unsafe-inline'. That silently
// blocks every Griffel rule, so the packaged app renders as raw, unstyled HTML
// even though it looks correct under `vite dev` (which enforces no CSP).
//
// Setting dangerousDisableAssetCspModification to include "style-src" tells
// Tauri to leave style-src untouched, so 'unsafe-inline' keeps working and the
// runtime styles apply. script-src stays hardened. If this invariant is ever
// removed, the desktop app breaks visually, so fail loudly here.

type TauriConfig = {
  app: {
    security: {
      csp: string;
      devCsp: string;
      dangerousDisableAssetCspModification?: boolean | string[];
    };
  };
};

const configUrl = new URL('../../src-tauri/tauri.conf.json', import.meta.url);
const config = JSON.parse(readFileSync(fileURLToPath(configUrl), 'utf8')) as TauriConfig;
const security = config.app.security;

function styleSrc(csp: string): string {
  const directive = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('style-src'));
  return directive ?? '';
}

describe('desktop CSP keeps Griffel runtime styles working', () => {
  it('disables Tauri style-src modification so unsafe-inline is not nullified', () => {
    const flag = security.dangerousDisableAssetCspModification;
    const disabled = flag === true || (Array.isArray(flag) && flag.includes('style-src'));
    expect(disabled).toBe(true);
  });

  it("keeps 'unsafe-inline' in the production style-src", () => {
    expect(styleSrc(security.csp)).toContain("'unsafe-inline'");
  });

  it("keeps 'unsafe-inline' in the dev style-src", () => {
    expect(styleSrc(security.devCsp)).toContain("'unsafe-inline'");
  });
});

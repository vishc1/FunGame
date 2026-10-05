import { chromium } from 'playwright-core';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function launchArtBrowser() {
  const cache=join(homedir(),'Library/Caches/ms-playwright');
  const builds=existsSync(cache)?readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort():[];
  const shell=builds.length?join(cache,builds.at(-1),'chrome-headless-shell-mac-arm64/chrome-headless-shell'):null;
  const executablePath=process.env.CHROMIUM_PATH || (shell&&existsSync(shell)?shell:undefined);
  return chromium.launch({ executablePath, headless:true, args:process.platform==='darwin'?['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']:[] });
}

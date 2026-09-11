import { BrowserWindow } from 'electron';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const W = 960, H = 600;

/**
 * Load demo/index.html in a hidden window, walk window.__yoink.states,
 * and capture one PNG per state into demo-screenshots/.
 */
export async function screenshotDemo(
  demoIndex: string,
  outDir: string,
  log: (m: string) => void,
): Promise<string[]> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: W, height: H, show: false, frame: false,
    webPreferences: { offscreen: false, backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  const shots: string[] = [];
  try {
    await win.loadURL(`yoink://local${encodeURI(demoIndex)}`);
    await wait(600);
    const names: string[] = await win.webContents.executeJavaScript(
      'Object.keys((window.__yoink && window.__yoink.states) || {})',
    );
    const states = names.length ? names : ['initial'];
    if (!names.length) log('demo 没有定义 window.__yoink.states，只截初始状态');
    let i = 1;
    for (const name of states) {
      log(`截图状态 ${name}…`);
      try {
        await win.webContents.executeJavaScript(
          `(async () => { const s = window.__yoink && window.__yoink.states; if (s && s[${JSON.stringify(name)}]) await s[${JSON.stringify(name)}](); })()`,
          true,
        );
      } catch (e: any) { log(`状态 ${name} 执行出错：${e?.message ?? e}`); }
      await wait(400);
      const img = await win.webContents.capturePage();
      const file = path.join(outDir, `state-${String(i).padStart(2, '0')}-${name}.png`);
      await writeFile(file, img.toPNG());
      shots.push(file);
      i++;
    }
  } finally {
    win.destroy();
  }
  return shots;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

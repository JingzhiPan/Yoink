import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PatternMeta, PatternDetail, Settings, JobEvent, InputMethod, DemoVariant, JudgmentItem } from '../shared/types.js';

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setInputMethod: (m: InputMethod): Promise<Settings> => ipcRenderer.invoke('settings:setInputMethod', m),
  setOpenAIKey: (k: string): Promise<Settings> => ipcRenderer.invoke('settings:setOpenAIKey', k),

  listPatterns: (): Promise<PatternMeta[]> => ipcRenderer.invoke('library:list'),
  getPattern: (id: string): Promise<PatternDetail> => ipcRenderer.invoke('pattern:get', id),
  updateMeta: (id: string, patch: Partial<PatternMeta>): Promise<PatternMeta> => ipcRenderer.invoke('pattern:updateMeta', id, patch),
  deletePattern: (id: string): Promise<void> => ipcRenderer.invoke('pattern:delete', id),
  saveVariant: (id: string, name: string, note?: string): Promise<DemoVariant[]> => ipcRenderer.invoke('variant:save', id, name, note),
  restoreVariant: (id: string, slug: string): Promise<void> => ipcRenderer.invoke('variant:restore', id, slug),
  deleteVariant: (id: string, slug: string): Promise<void> => ipcRenderer.invoke('variant:delete', id, slug),
  forkPattern: (id: string, name: string, fromVariant?: string): Promise<PatternMeta> => ipcRenderer.invoke('pattern:fork', id, name, fromVariant),
  refreshCover: (id: string): Promise<PatternDetail> => ipcRenderer.invoke('pattern:refreshCover', id),
  renamePattern: (id: string, newId: string): Promise<string> => ipcRenderer.invoke('pattern:rename', id, newId),
  saveSpec: (id: string, md: string): Promise<PatternMeta> => ipcRenderer.invoke('pattern:saveSpec', id, md),
  saveSkillMd: (id: string, md: string): Promise<PatternMeta> => ipcRenderer.invoke('pattern:saveSkillMd', id, md),
  readFile: (p: string): Promise<string> => ipcRenderer.invoke('pattern:readFile', p),

  importVideo: (jobId: string, videoPath: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:import', jobId, videoPath),
  storeRaw: (id: string, text: string, method: InputMethod): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:storeRaw', id, text, method),
  parseAuto: (jobId: string, id: string, method: InputMethod): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:parseAuto', jobId, id, method),
  verify: (jobId: string, id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:verify', jobId, id),
  generateDemo: (jobId: string, id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:demo', jobId, id),
  screenshotDemo: (jobId: string, id: string, compare: boolean): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:screenshot', jobId, id, compare),
  sendFeedback: (jobId: string, id: string, fb: string, variant?: string, crop?: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:feedback', jobId, id, fb, variant, crop),
  material: (jobId: string, id: string, picks?: { frame: string; rect: { x: number; y: number; w: number; h: number } }[]): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:material', jobId, id, picks),
  saveJudgment: (id: string, items: JudgmentItem[]): Promise<void> => ipcRenderer.invoke('judgment:save', id, items),
  cropFrame: (id: string, frame: string, r: { x: number; y: number; w: number; h: number }): Promise<string> => ipcRenderer.invoke('frame:crop', id, frame, r),
  retag: (jobId: string, id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:retag', jobId, id),
  updateVariant: (id: string, slug: string, patch: Record<string, unknown>): Promise<void> => ipcRenderer.invoke('variant:update', id, slug, patch),
  confirmDemo: (jobId: string, id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:confirmDemo', jobId, id),
  extractTweaks: (jobId: string, id: string, focus?: string, variant?: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:tweaks', jobId, id, focus, variant),
  applyTweaks: (id: string, values: Record<string, string>, variant?: string): Promise<void> => ipcRenderer.invoke('demo:applyTweaks', id, values, variant),
  generateSkill: (jobId: string, id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:skill', jobId, id),
  packSkill: (id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:packSkill', id),
  cancelJob: (jobId: string): Promise<void> => ipcRenderer.invoke('pipeline:cancel', jobId),
  onJobEvent: (cb: (ev: JobEvent) => void): (() => void) => {
    const h = (_e: unknown, ev: JobEvent) => cb(ev);
    ipcRenderer.on('job:event', h);
    return () => ipcRenderer.off('job:event', h);
  },

  selectVideos: (): Promise<string[]> => ipcRenderer.invoke('files:selectVideos'),
  onOpenFiles: (cb: (paths: string[]) => void): (() => void) => {
    const h = (_e: unknown, paths: string[]) => cb(paths);
    ipcRenderer.on('open:files', h);
    return () => ipcRenderer.off('open:files', h);
  },
  showInFinder: (p: string): Promise<void> => ipcRenderer.invoke('shell:showInFinder', p),
  openExternal: (u: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', u),
  mcpInfo: (): Promise<{ serverPath: string; libraryRoot: string; nodePath: string }> => ipcRenderer.invoke('mcp:info'),
  getPathForFile: (f: File): string => webUtils.getPathForFile(f),
  fileUrl: (p: string): string => `yoink://local${encodeURI(p)}`,
};

contextBridge.exposeInMainWorld('yoink', api);
export type YoinkAPI = typeof api;

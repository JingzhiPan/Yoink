import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PatternMeta, PatternDetail, Settings, JobEvent, InputMethod } from '../shared/types.js';

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setInputMethod: (m: InputMethod): Promise<Settings> => ipcRenderer.invoke('settings:setInputMethod', m),
  setOpenAIKey: (k: string): Promise<Settings> => ipcRenderer.invoke('settings:setOpenAIKey', k),

  listPatterns: (): Promise<PatternMeta[]> => ipcRenderer.invoke('library:list'),
  getPattern: (id: string): Promise<PatternDetail> => ipcRenderer.invoke('pattern:get', id),
  updateMeta: (id: string, patch: Partial<PatternMeta>): Promise<PatternMeta> => ipcRenderer.invoke('pattern:updateMeta', id, patch),
  deletePattern: (id: string): Promise<void> => ipcRenderer.invoke('pattern:delete', id),
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
  sendFeedback: (jobId: string, id: string, fb: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:feedback', jobId, id, fb),
  confirmDemo: (id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:confirmDemo', id),
  generateSkill: (jobId: string, id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:skill', jobId, id),
  packSkill: (id: string): Promise<PatternMeta> => ipcRenderer.invoke('pipeline:packSkill', id),
  cancelJob: (jobId: string): Promise<void> => ipcRenderer.invoke('pipeline:cancel', jobId),
  onJobEvent: (cb: (ev: JobEvent) => void): (() => void) => {
    const h = (_e: unknown, ev: JobEvent) => cb(ev);
    ipcRenderer.on('job:event', h);
    return () => ipcRenderer.off('job:event', h);
  },

  selectVideos: (): Promise<string[]> => ipcRenderer.invoke('files:selectVideos'),
  showInFinder: (p: string): Promise<void> => ipcRenderer.invoke('shell:showInFinder', p),
  openExternal: (u: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', u),
  mcpInfo: (): Promise<{ serverPath: string; libraryRoot: string; nodePath: string }> => ipcRenderer.invoke('mcp:info'),
  getPathForFile: (f: File): string => webUtils.getPathForFile(f),
  fileUrl: (p: string): string => `yoink://local${encodeURI(p)}`,
};

contextBridge.exposeInMainWorld('yoink', api);
export type YoinkAPI = typeof api;

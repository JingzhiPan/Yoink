import { create } from 'zustand';
import type { PatternMeta, PatternDetail, Settings, JobEvent, JobKind, InputMethod } from '../shared/types';
import { api, newJobId } from './api';

export interface Job { jobId: string; patternId: string; kind: JobKind; logs: string[]; status: 'running' | 'done' | 'error'; error?: string; startedAt: number }

interface State {
  settings: Settings | null;
  patterns: PatternMeta[];
  current: PatternDetail | null;
  jobs: Record<string, Job>;
  view: { kind: 'home' } | { kind: 'pattern'; id: string };
  showMethodPicker: boolean;

  init(): Promise<void>;
  refreshList(): Promise<void>;
  open(id: string): Promise<void>;
  goHome(): void;
  reloadCurrent(): Promise<void>;
  handleJobEvent(ev: JobEvent): void;
  setInputMethod(m: InputMethod, openaiKey?: string): Promise<void>;

  importVideos(paths: string[]): Promise<void>;
  storeRaw(id: string, text: string): Promise<void>;
  verify(id: string): Promise<void>;
  generateDemo(id: string): Promise<void>;
  screenshot(id: string, compare: boolean): Promise<void>;
  feedback(id: string, text: string): Promise<void>;
  confirmDemo(id: string): Promise<void>;
  generateSkill(id: string): Promise<void>;
  packSkill(id: string): Promise<void>;
  updateMeta(id: string, patch: Partial<PatternMeta>): Promise<void>;
  saveSpec(id: string, md: string): Promise<void>;
  saveSkillMd(id: string, md: string): Promise<void>;
  deletePattern(id: string): Promise<void>;
}

export const useStore = create<State>((set, get) => {
  const startJob = (patternId: string, kind: JobKind): string => {
    const jobId = newJobId();
    set((s) => ({ jobs: { ...s.jobs, [jobId]: { jobId, patternId, kind, logs: [], status: 'running', startedAt: Date.now() } } }));
    return jobId;
  };
  const afterStep = async (id: string) => { await get().refreshList(); if (get().current?.meta.id === id) await get().reloadCurrent(); };
  const wrap = async (id: string, kind: JobKind, fn: (jobId: string) => Promise<unknown>) => {
    const jobId = startJob(id, kind);
    try { await fn(jobId); } catch { /* error already reflected via job event */ }
    await afterStep(id);
  };

  return {
    settings: null, patterns: [], current: null, jobs: {}, view: { kind: 'home' }, showMethodPicker: false,

    async init() {
      const settings = await api.getSettings();
      set({ settings });
      await get().refreshList();
      api.onJobEvent((ev) => get().handleJobEvent(ev));
    },
    async refreshList() { set({ patterns: await api.listPatterns() }); },
    async open(id) { set({ current: await api.getPattern(id), view: { kind: 'pattern', id } }); },
    goHome() { set({ view: { kind: 'home' }, current: null }); },
    async reloadCurrent() { const c = get().current; if (c) set({ current: await api.getPattern(c.meta.id) }); },
    handleJobEvent(ev) {
      set((s) => {
        const j = s.jobs[ev.jobId];
        if (!j) return {};
        const nj: Job = { ...j, logs: ev.type === 'log' && ev.message && j.logs[j.logs.length - 1] !== ev.message ? [...j.logs, ev.message] : j.logs };
        if (ev.type === 'done') nj.status = 'done';
        if (ev.type === 'error') { nj.status = 'error'; nj.error = ev.message; nj.logs = [...nj.logs, `✗ ${ev.message}`]; }
        return { jobs: { ...s.jobs, [ev.jobId]: nj } };
      });
    },
    async setInputMethod(m, key) {
      if (key !== undefined) await api.setOpenAIKey(key);
      set({ settings: await api.setInputMethod(m), showMethodPicker: false });
    },

    async importVideos(paths) {
      const st = get().settings;
      if (!st?.inputMethod) { set({ showMethodPicker: true }); }
      for (const p of paths) {
        const jobId = startJob('(new)', 'extract');
        let meta: PatternMeta;
        try { meta = await api.importVideo(jobId, p); } catch { continue; }
        set((s) => ({ jobs: { ...s.jobs, [jobId]: { ...s.jobs[jobId], patternId: meta.id } } }));
        await get().refreshList();
        const method = get().settings?.inputMethod;
        if (method === 'api' || method === 'computer_use') {
          await wrap(meta.id, 'parse', (j) => api.parseAuto(j, meta.id, method));
          const m2 = get().patterns.find((x) => x.id === meta.id);
          if (m2?.status === 'raw_spec') await get().verify(meta.id);
        }
        if (paths.length === 1) await get().open(meta.id);
      }
    },
    async storeRaw(id, text) { await api.storeRaw(id, text, 'manual'); await afterStep(id); },
    verify: (id) => wrap(id, 'verify', (j) => api.verify(j, id)),
    generateDemo: (id) => wrap(id, 'demo', (j) => api.generateDemo(j, id)),
    screenshot: (id, compare) => wrap(id, 'screenshot', (j) => api.screenshotDemo(j, id, compare)),
    feedback: (id, text) => wrap(id, 'feedback', (j) => api.sendFeedback(j, id, text)),
    confirmDemo: (id) => wrap(id, 'consolidate', (j) => api.confirmDemo(j, id)),
    generateSkill: (id) => wrap(id, 'skill', (j) => api.generateSkill(j, id)),
    async packSkill(id) { await api.packSkill(id); await afterStep(id); },
    async updateMeta(id, patch) { await api.updateMeta(id, patch); await afterStep(id); },
    async saveSpec(id, md) { await api.saveSpec(id, md); await afterStep(id); },
    async saveSkillMd(id, md) { await api.saveSkillMd(id, md); await afterStep(id); },
    async deletePattern(id) { await api.deletePattern(id); get().goHome(); await get().refreshList(); },
  };
});

export const runningJobsFor = (jobs: Record<string, Job>, id: string) =>
  Object.values(jobs).filter((j) => j.patternId === id && j.status === 'running');
export const latestJobFor = (jobs: Record<string, Job>, id: string) =>
  Object.values(jobs).filter((j) => j.patternId === id).sort((a, b) => b.startedAt - a.startedAt)[0];

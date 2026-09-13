import { create } from 'zustand';
import type { PatternMeta, PatternDetail, Settings, JobEvent, JobKind, InputMethod, PatternStatus, Category, JudgmentItem } from '../shared/types';
import { api, newJobId } from './api';

export interface Job { jobId: string; patternId: string; variant?: string; kind: JobKind; logs: string[]; status: 'running' | 'done' | 'error'; error?: string; startedAt: number }

interface State {
  settings: Settings | null;
  patterns: PatternMeta[];
  current: PatternDetail | null;
  selected: PatternDetail | null;      // browse-mode read-only panel
  previewVariant: string | null;       // variant index.html shown in the workspace instead of demo
  jobs: Record<string, Job>;
  view: { kind: 'home' } | { kind: 'pattern'; id: string };
  showMethodPicker: boolean;
  filters: { status: PatternStatus | ''; cat: Category | ''; tag: string };
  setFilters(p: Partial<State['filters']>): void;

  init(): Promise<void>;
  refreshList(): Promise<void>;
  open(id: string): Promise<void>;
  select(id: string | null): Promise<void>;
  setPreviewVariant(index: string | null): void;
  goHome(): void;
  reloadCurrent(): Promise<void>;
  handleJobEvent(ev: JobEvent): void;
  setInputMethod(m: InputMethod, openaiKey?: string): Promise<void>;

  importVideos(paths: string[]): Promise<void>;
  addRefs(id: string, paths: string[]): Promise<void>;
  storeRaw(id: string, text: string): Promise<void>;
  verify(id: string): Promise<void>;
  generateDemo(id: string): Promise<void>;
  screenshot(id: string, compare: boolean): Promise<void>;
  feedback(id: string, text: string, variant?: string, crop?: string): Promise<void>;
  material(id: string, picks?: { frame: string; rect: { x: number; y: number; w: number; h: number } }[]): Promise<void>;
  saveJudgment(id: string, items: JudgmentItem[]): Promise<void>;
  retag(id: string): Promise<void>;
  updateVariant(id: string, slug: string, patch: Record<string, unknown>): Promise<void>;
  confirmDemo(id: string): Promise<void>;
  extractTweaks(id: string, focus?: string, variant?: string): Promise<void>;
  applyTweaks(id: string, values: Record<string, string>, variant?: string): Promise<void>;
  generateSkill(id: string): Promise<void>;
  packSkill(id: string): Promise<void>;
  updateMeta(id: string, patch: Partial<PatternMeta>): Promise<void>;
  saveSpec(id: string, md: string): Promise<void>;
  saveSkillMd(id: string, md: string): Promise<void>;
  deletePattern(id: string): Promise<void>;
  refreshCover(id: string): Promise<void>;
  saveVariant(id: string, name: string): Promise<void>;
  restoreVariant(id: string, slug: string): Promise<void>;
  deleteVariant(id: string, slug: string): Promise<void>;
  forkPattern(id: string, name: string, fromVariant?: string, deviation?: string): Promise<void>;
  outline(id: string, brief: string): Promise<void>;
  traits(id: string): Promise<void>;
  adapt(id: string, opts: { name: string; stack: string; tokens: string; notes: string }): Promise<void>;
  distill(id: string): Promise<void>;
  materialize(id: string): Promise<void>;
}

export const useStore = create<State>((set, get) => {
  const startJob = (patternId: string, kind: JobKind, variant?: string): string => {
    const jobId = newJobId();
    set((s) => ({ jobs: { ...s.jobs, [jobId]: { jobId, patternId, variant, kind, logs: [], status: 'running', startedAt: Date.now() } } }));
    return jobId;
  };
  const afterStep = async (id: string) => { await get().refreshList(); if (get().current?.meta.id === id) await get().reloadCurrent(); };
  const wrap = async (id: string, kind: JobKind, fn: (jobId: string) => Promise<unknown>, variant?: string) => {
    const jobId = startJob(id, kind, variant);
    try { await fn(jobId); } catch { /* error already reflected via job event */ }
    await afterStep(id);
  };

  return {
    settings: null, patterns: [], current: null, selected: null, previewVariant: null, jobs: {}, view: { kind: 'home' }, showMethodPicker: false,
    filters: { status: '', cat: '', tag: '' },
    setFilters(p) { set((s) => ({ filters: { ...s.filters, ...p } })); },

    async init() {
      const settings = await api.getSettings();
      set({ settings });
      await get().refreshList();
      api.onJobEvent((ev) => get().handleJobEvent(ev));
      api.onOpenFiles((paths) => get().importVideos(paths));
    },
    async refreshList() { set({ patterns: await api.listPatterns() }); },
    async open(id) { const cur = get().current; set({ current: await api.getPattern(id), selected: null, view: { kind: 'pattern', id }, previewVariant: cur?.meta.id === id ? get().previewVariant : null }); },
    async select(id) { set({ selected: id ? await api.getPattern(id) : null }); },
    setPreviewVariant(index) { set({ previewVariant: index }); },
    goHome() { set({ view: { kind: 'home' }, current: null, previewVariant: null }); },
    async reloadCurrent() { const c = get().current; if (c) set({ current: await api.getPattern(c.meta.id) }); const sel = get().selected; if (sel) set({ selected: await api.getPattern(sel.meta.id) }); },
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

    async addRefs(id, paths) { await api.addRefs(id, paths); await afterStep(id); },
    async importVideos(all) {
      const st = get().settings;
      const images = all.filter((p) => /\.(png|jpe?g|webp)$/i.test(p));
      const paths = all.filter((p) => !/\.(png|jpe?g|webp)$/i.test(p));
      if (images.length) {
        // all dropped images become one reference-photo pattern; spec is written by hand, no parse step
        const jobId = startJob('(new)', 'extract');
        try {
          const meta = await api.importImages(jobId, images);
          set((s) => ({ jobs: { ...s.jobs, [jobId]: { ...s.jobs[jobId], patternId: meta.id } } }));
          await get().refreshList();
          if (!paths.length) await get().open(meta.id);
        } catch { /* shown in log */ }
      }
      if (paths.length && !st?.inputMethod) { set({ showMethodPicker: true }); }
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
    async verify(id) {
      await wrap(id, 'verify', (j) => api.verify(j, id));
      // the material pass is part of verification: layer stack + the questions only a human can answer
      if (get().patterns.find((x) => x.id === id)?.status === 'verified') await get().material(id);
    },
    generateDemo: (id) => wrap(id, 'demo', (j) => api.generateDemo(j, id)),
    screenshot: (id, compare) => wrap(id, 'screenshot', (j) => api.screenshotDemo(j, id, compare)),
    feedback: (id, text, variant, crop) => wrap(id, 'feedback', (j) => api.sendFeedback(j, id, text, variant, crop), variant),
    material: (id, picks) => wrap(id, 'material', (j) => api.material(j, id, picks)),
    async saveJudgment(id, items) { await api.saveJudgment(id, items); await afterStep(id); },
    retag: (id) => wrap(id, 'retag', (j) => api.retag(j, id)),
    async updateVariant(id, slug, patch) { await api.updateVariant(id, slug, patch); await afterStep(id); },
    confirmDemo: (id) => wrap(id, 'consolidate', (j) => api.confirmDemo(j, id)),
    extractTweaks: (id, focus, variant) => wrap(id, 'tweaks', (j) => api.extractTweaks(j, id, focus, variant), variant),
    async applyTweaks(id, values, variant) { await api.applyTweaks(id, values, variant); await afterStep(id); },
    generateSkill: (id) => wrap(id, 'skill', (j) => api.generateSkill(j, id)),
    async packSkill(id) { await api.packSkill(id); await afterStep(id); },
    async updateMeta(id, patch) { await api.updateMeta(id, patch); await afterStep(id); },
    async saveSpec(id, md) { await api.saveSpec(id, md); await afterStep(id); },
    async saveSkillMd(id, md) { await api.saveSkillMd(id, md); await afterStep(id); },
    async saveVariant(id, name) { await api.saveVariant(id, name); await afterStep(id); },
    async restoreVariant(id, slug) { await api.restoreVariant(id, slug); set({ previewVariant: null }); await afterStep(id); },
    async deleteVariant(id, slug) { await api.deleteVariant(id, slug); set({ previewVariant: null }); await afterStep(id); },
    async forkPattern(id, name, fromVariant, deviation) { const m = await api.forkPattern(id, name, fromVariant, deviation); await get().refreshList(); await get().open(m.id); },
    outline: (id, brief) => wrap(id, 'outline', (j) => api.outline(j, id, brief)),
    traits: (id) => wrap(id, 'traits', (j) => api.traits(j, id)),
    adapt: (id, opts) => wrap(id, 'adapt', (j) => api.adapt(j, id, opts)),
    distill: (id) => wrap(id, 'distill', (j) => api.distill(j, id)),
    materialize: (id) => wrap(id, 'materialize', (j) => api.materialize(j, id)),
    async refreshCover(id) { await api.refreshCover(id); await afterStep(id); },
    async deletePattern(id) { await api.deletePattern(id); if (get().current?.meta.id === id) get().goHome(); if (get().selected?.meta.id === id) set({ selected: null }); await get().refreshList(); },
  };
});

/** All jobs of a pattern, or — when `target` is given — only those on that exact target (null = main demo, slug = that variant). */
const onTarget = (j: Job, target?: string | null) => target === undefined || (j.variant ?? null) === target;
export const runningJobsFor = (jobs: Record<string, Job>, id: string, target?: string | null) =>
  Object.values(jobs).filter((j) => j.patternId === id && j.status === 'running' && onTarget(j, target));
export const latestJobFor = (jobs: Record<string, Job>, id: string, target?: string | null) =>
  Object.values(jobs).filter((j) => j.patternId === id && onTarget(j, target)).sort((a, b) => b.startedAt - a.startedAt)[0];

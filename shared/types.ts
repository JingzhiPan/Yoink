export type PatternStatus =
  | 'frames_extracted' | 'raw_spec' | 'verified' | 'demo_wip' | 'demo_done' | 'skill_ready';

export type Category =
  | 'micro-interaction' | 'transition' | 'layout' | 'data-viz'
  | 'navigation' | 'form' | 'feedback' | 'creative';

export type Complexity = 'low' | 'medium' | 'high';
export type InputMethod = 'api' | 'computer_use' | 'manual';

export const STATUS_ORDER: PatternStatus[] = [
  'frames_extracted', 'raw_spec', 'verified', 'demo_wip', 'demo_done', 'skill_ready',
];
export const CATEGORIES: Category[] = [
  'micro-interaction', 'transition', 'layout', 'data-viz', 'navigation', 'form', 'feedback', 'creative',
];
export const COMPLEXITIES: Complexity[] = ['low', 'medium', 'high'];

export interface PatternMeta {
  id: string;
  name: string;
  status: PatternStatus;
  tags: string[];
  category: Category;
  tech_hints: string[];
  complexity: Complexity;
  source_url: string;
  source_author: string;
  video_duration_sec: number;
  frame_count: number;
  demo_screenshot_count: number;
  input_method: InputMethod | '';
  created: string;
  notes: string;
  favorite?: boolean;
  hidden_tweaks?: string[];   // tweak keys the user hid from the panel
  tag_facets?: TagFacets;     // the same tags, keyed by facet
  self_check?: boolean;       // after each feedback edit, screenshot and let Claude compare against refs/frames itself
}

/** One tag per facet (feels_like optional). Tech goes to tech_hints, not tags. */
export interface TagFacets { what?: string; look?: string; ux?: string; feels_like?: string; for?: string }
export const TAG_FACET_LABEL: Record<keyof TagFacets, string> = { what: '是什么', look: '审美', ux: 'UX 方向', feels_like: '像什么', for: '干嘛用' };

/** Everything the renderer needs to show a pattern. */
export interface PatternDetail {
  meta: PatternMeta;
  dir: string;
  videoPath: string | null;
  cover: string | null;         // cover.png if generated
  frames: string[];            // absolute paths
  refs: string[];              // refs/: reference photos (no video needed)
  demoScreenshots: string[];   // absolute paths
  rawSpec: string | null;
  spec: string | null;
  specVerified: string | null; // long verified version kept after consolidation
  demoIndex: string | null;    // absolute path to demo/index.html
  demoCompare: string | null;  // demo-compare.md
  judgment: JudgmentItem[] | null;   // judgment.json: things only a human can decide
  materialCrops: string[];           // material/*.png zoomed crops used by the material pass
  consolidateDiff: string | null;    // consolidate-diff.md: what the demo rounds changed vs the verified spec
  handoff: string | null;            // handoff.md: facts / decisions / open / tweaks, built from the files above
  tweakList: TweakInfo[];            // parsed from demo/index.html manifest
  comparePairs: ComparePair[] | null; // demo-compare.json: which original frame each demo shot corresponds to
  skillMd: string | null;
  skillFiles: string[];        // relative paths inside skill/
  feedbackLog: string | null;  // demo-feedback.md
  variants: DemoVariant[];     // saved demo snapshots under variants/
}

export type JudgmentKind = 'aesthetic' | 'shape' | 'mechanism' | 'ownership' | 'physics';
export const JUDGMENT_KIND_LABEL: Record<JudgmentKind, string> = { aesthetic: '审美意图', shape: '形状', mechanism: '机制二选一', ownership: '归属', physics: '物理 vs 照片' };
/** One thing the frames can't settle; the designer answers it before/after the demo. */
export interface JudgmentItem { id: string; kind: JudgmentKind; q: string; options: string[]; frame: string; where: string; verify: string; answer: string }
export interface TweakInfo { key: string; label: string; type: string; unit?: string }

export interface ComparePair { shot: string; frame: string | null; note: string }

export interface DemoVariant { slug: string; name: string; created: string; note: string; index: string; feedbackLog: string | null; hidden_tweaks: string[] }

export interface Settings {
  inputMethod: InputMethod | null;
  libraryRoot: string;
  hasOpenAIKey: boolean;
  claudePath: string | null;
  ffmpegPath: string | null;
}

export type JobKind = 'extract' | 'parse' | 'verify' | 'demo' | 'screenshot' | 'feedback' | 'consolidate' | 'tweaks' | 'skill' | 'retag' | 'material';

export interface JobEvent {
  jobId: string;
  patternId: string;
  kind: JobKind;
  type: 'log' | 'progress' | 'done' | 'error';
  message?: string;
  progress?: number; // 0..1
}

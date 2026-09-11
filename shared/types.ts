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
}

/** Everything the renderer needs to show a pattern. */
export interface PatternDetail {
  meta: PatternMeta;
  dir: string;
  videoPath: string | null;
  cover: string | null;         // cover.png if generated
  frames: string[];            // absolute paths
  demoScreenshots: string[];   // absolute paths
  rawSpec: string | null;
  spec: string | null;
  specVerified: string | null; // long verified version kept after consolidation
  demoIndex: string | null;    // absolute path to demo/index.html
  demoCompare: string | null;  // demo-compare.md
  skillMd: string | null;
  skillFiles: string[];        // relative paths inside skill/
  feedbackLog: string | null;  // demo-feedback.md
}

export interface Settings {
  inputMethod: InputMethod | null;
  libraryRoot: string;
  hasOpenAIKey: boolean;
  claudePath: string | null;
  ffmpegPath: string | null;
}

export type JobKind = 'extract' | 'parse' | 'verify' | 'demo' | 'screenshot' | 'feedback' | 'consolidate' | 'skill';

export interface JobEvent {
  jobId: string;
  patternId: string;
  kind: JobKind;
  type: 'log' | 'progress' | 'done' | 'error';
  message?: string;
  progress?: number; // 0..1
}

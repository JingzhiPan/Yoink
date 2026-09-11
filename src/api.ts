import type { YoinkAPI } from '../electron/preload';
declare global { interface Window { yoink: YoinkAPI } }
export const api = window.yoink;
export const newJobId = () => Math.random().toString(36).slice(2, 10);

import { readFile } from 'node:fs/promises';
import { VIDEO_PROMPT } from './prompts.js';

/**
 * "API mode": send the extracted key frames to OpenAI's vision-capable chat endpoint
 * and get back a raw spec. Frames are sent in order with timestamps described.
 */
export async function parseWithOpenAI(apiKey: string, frames: string[], durationSec: number, log: (m: string) => void): Promise<string> {
  const picked = frames.length > 16 ? frames.filter((_, i) => i % Math.ceil(frames.length / 16) === 0) : frames;
  log(`发送 ${picked.length} 帧给 OpenAI…`);
  const images = await Promise.all(picked.map(async (f) => ({
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${(await readFile(f)).toString('base64')}`, detail: 'low' },
  })));
  const body = {
    model: process.env.YOINK_OPENAI_MODEL ?? 'gpt-4.1',
    messages: [
      { role: 'system', content: 'You are a senior UI motion engineer. You reverse-engineer UI interaction demos into precise implementation specs.' },
      { role: 'user', content: [
        { type: 'text', text: `These are ${picked.length} key frames, in order, from a ${durationSec.toFixed(1)}s UI interaction demo video.\n\n${VIDEO_PROMPT}` },
        ...images,
      ] },
    ],
    max_tokens: 2500,
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json: any = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI 没有返回内容');
  return text;
}

import type {
  MessageContent,
  MessageContentText,
  MessageContentImage,
} from '@kbn/inference-common';

/**
 * Multimodal screen-keyframe support for SOP synthesis.
 *
 * This file is intentionally self-contained (it does NOT import from
 * synthesis.ts) so the multimodal/vision additions can evolve independently of
 * the agent-tool-mapping / voice-transcript / provenance work happening in
 * synthesis.ts. The synthesize route composes the sibling-built text prompt
 * with the frame manifest + image content parts produced here.
 *
 * POC SCOPE: only the Anthropic Claude (chat_completion) connector is targeted.
 * Claude accepts images natively; the inference plugin's OpenAI-compatible
 * adapter forwards each {type:'image'} content part as an image_url whose url
 * is the JPEG data URL.
 */

/**
 * A screen keyframe ready to be turned into a Claude image content part.
 * `dataUrl` is a full "data:image/jpeg;base64,..." string. `timestampMs` is the
 * offset from the start of the recording (shared origin with voice offsets).
 */
export interface SynthesisFrame {
  id: string;
  timestampMs: number;
  dataUrl: string;
}

/** Format a ms offset as a compact clock label, e.g. 45000 -> "0:45". */
export function frameClock(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A short text block appended to the synthesis prompt that lists the screen
 * keyframes attached to the same message as images. Listing them (with stable
 * [F#] ids + offsets, in the same order the images appear) lets the model
 * correlate "the Nth image" with an id and cite it in step provenance. Returns
 * '' when there are no frames so the base prompt is unchanged.
 */
export function buildFramePromptSection(frames: SynthesisFrame[]): string {
  if (!frames.length) return '';
  const manifest = frames
    .map((f) => `  [${f.id}] (frame) screen frame @${frameClock(f.timestampMs)}`)
    .join('\n');
  return `

SCREEN FRAMES (attached to THIS message as images, in this exact order; each labeled with its offset from the start of the recording):
${manifest}

IMPORTANT — this SUPERSEDES any earlier instruction that said screen recordings are not provided: while the raw screen *video* is not attached, the periodic screenshots listed above ARE attached to this message as real images. They are genuine screenshots of the analyst's screen during the recorded session. Use them as PRIMARY VISUAL EVIDENCE of what was on screen (which alert was opened, which query was run, which entity was inspected, what the result tables showed). When the visual content of an image justifies or clarifies a step, add a provenance entry of type "frame" citing the matching [F#] id with a "screen frame @<offset>" label. Only cite frame ids listed above; never invent one.`;
}

/**
 * Build the multimodal user-message content for chatComplete: the (already
 * fully-built) text prompt followed by one image content part per keyframe. The
 * Anthropic Claude chat_completion adapter maps each {type:'image'} part to an
 * OpenAI-compatible image_url whose url is the data URL. Returns the plain
 * prompt string (unchanged behavior) when there are no frames.
 */
export function buildMultimodalContent(prompt: string, frames: SynthesisFrame[]): MessageContent {
  if (!frames.length) return prompt;
  const textPart: MessageContentText = { type: 'text', text: prompt };
  const imageParts: MessageContentImage[] = frames.map((f) => ({
    type: 'image',
    // `data` carries the full data URL; the OpenAI-compatible adapter forwards
    // it verbatim as image_url.url. `mimeType` is preserved for adapters that
    // need the image type split out separately.
    source: { data: f.dataUrl, mimeType: 'image/jpeg' },
  }));
  return [textPart, ...imageParts];
}

/**
 * Evenly sample at most `max` frames from a (timestamp-ordered) list, always
 * keeping the first and last. Caps the image payload sent to Claude so a long
 * session with many keyframes can't blow past token/size limits, while still
 * covering the whole session timeline.
 */
export function capFrames<T>(frames: T[], max: number): T[] {
  if (frames.length <= max) return frames;
  if (max <= 1) return frames.slice(0, Math.max(0, max));
  const out: T[] = [];
  const step = (frames.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(frames[Math.round(i * step)]);
  }
  // Round() can collide on adjacent picks for tight ratios; dedupe by identity.
  return out.filter((f, i) => out.indexOf(f) === i);
}

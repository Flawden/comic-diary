import { existsSync } from 'node:fs';
import path from 'node:path';
export const BETA_FRAME_URL = '/avatar-frames/beta-dragon-2026.webp';
// Only a reviewed, clean release asset belongs here. Screenshots/mockups stay in .qa.
export function betaFrameReady() {
  return existsSync(path.join(process.cwd(), 'public', BETA_FRAME_URL));
}

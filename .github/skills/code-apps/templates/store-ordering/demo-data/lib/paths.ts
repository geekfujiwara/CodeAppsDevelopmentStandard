import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** demo-data/ フォルダ（scenarios/・store.db・export/ の置き場所） */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

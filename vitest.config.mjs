import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: { alias: { '@': path.join(root, 'src') } },
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
};

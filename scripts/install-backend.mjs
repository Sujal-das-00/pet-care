// Runs after `npm install` / `yarn install` at the repo root. On a host (Render sets RENDER=true) it installs the
// backend's production dependencies, so the default commands (`yarn install` then `yarn start`) just work.
// On your own machine it does nothing, so it can never remove the backend's dev dependencies (test tools).
import { spawnSync } from 'node:child_process';

const onHost = Boolean(process.env.RENDER) || process.env.NODE_ENV === 'production' || process.env.INSTALL_BACKEND === '1';
if (!onHost) {
  console.log('[install-backend] skipped (not a hosted build). Run `npm install` inside backend/ for local work.');
  process.exit(0);
}
console.log('[install-backend] installing backend production dependencies...');
const r = spawnSync('npm', ['--prefix', 'backend', 'ci', '--omit=dev'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);

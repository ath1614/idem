import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
process.chdir(root);

await rm('deploy', { recursive: true, force: true });
await mkdir('deploy/public', { recursive: true });
await cp('dist', 'deploy/public', { recursive: true });

const worker = `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
`;

await writeFile('deploy/index.js', worker);

const manifest = {
  entrypoint: 'index.js',
  compatibilityDate: '2026-10-01',
  modules: [{ name: 'index.js', type: 'esm', path: './index.js' }],
  assetsDirectory: './public',
  spa: true,
};

await writeFile('deploy/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log('deploy/ ready');

import { build, context } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// The SDK ships a browser UMD wrapper even for its pure manifest validator.
globalThis.self = globalThis;
const { parseManifest } = require('@remnote/plugin-sdk');
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const validation = parseManifest(manifest);
if (!validation.success) throw new Error(JSON.stringify(validation.errors));
// Schema validity alone does not authorize the kb namespace used by practice.
if (!manifest.requiredScopes.some(scope => scope.type === 'KnowledgeBaseInfo' && scope.level === 'Read')) {
  throw new Error('Selected-card practice requires KnowledgeBaseInfo / Read in the release manifest.');
}
await mkdir('dist', { recursive: true });
await copyFile('public/manifest.json', 'dist/manifest.json');
await writeFile('dist/README.md', (await readFile('README.md', 'utf8')).replaceAll('./public/logo.png', './logo.png'));
await copyFile('public/logo.png', 'dist/logo.png');
await writeFile('dist/index.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>
const name = new URLSearchParams(location.search).get('widgetName');
if (['index', 'paste', 'directions-dialog', 'practice-selected'].includes(name)) {
  const script = document.createElement('script'); script.src = name + '-sandbox.js'; document.body.appendChild(script);
} else document.body.textContent = 'RR Tools: load this plugin through RemNote.';
</script></body></html>`);
const options = {
  entryPoints: { 'index-sandbox': 'src/widgets/index.tsx', 'paste-sandbox': 'src/widgets/paste.tsx', 'directions-dialog-sandbox': 'src/widgets/directions.tsx', 'practice-selected-sandbox': 'src/widgets/practice.tsx' },
  outdir: 'dist', bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  define: { 'process.env.NODE_ENV': '"production"' }, minify: true,
};
const nativeOptions = { ...options, entryPoints: { index: 'src/widgets/index.tsx', paste: 'src/widgets/paste.tsx', 'directions-dialog': 'src/widgets/directions.tsx', 'practice-selected': 'src/widgets/practice.tsx' }, format: 'esm', banner: { js: 'const IMPORT_META = import.meta;' } };
if (process.argv.includes('--serve')) {
  const sandboxContext = await context(options);
  const nativeContext = await context(nativeOptions);
  await Promise.all([sandboxContext.watch(), nativeContext.watch()]);
  await sandboxContext.serve({ servedir: 'dist', host: '127.0.0.1', port: 8080, cors: { origin: '*' } });
  console.log('RemNote development URL: http://localhost:8080 (sandbox and native entries both watched)');
} else {
  await build(options);
  await build(nativeOptions);
  const files = {};
  // Package only current entry points, never leftover bundles from older builds.
  const names = ['manifest.json', 'README.md', 'logo.png', 'index.html', ...Object.keys(options.entryPoints).map(name => name + '.js'), ...Object.keys(nativeOptions.entryPoints).map(name => name + '.js')];
  for (const name of names) files[name] = new Uint8Array(await readFile(`dist/${name}`));
  await writeFile('PluginZip.zip', zipSync(files));
  console.log('Manifest validated; built dist/ and PluginZip.zip.');
}

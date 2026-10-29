import { mkdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const output = new URL('../mobile/www/', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await mkdir(output, { recursive: true });
const html = (await readFile(new URL('../index.html', import.meta.url), 'utf8'))
  .replace('initial-scale=1.0', 'initial-scale=1.0, viewport-fit=cover')
  .replace('<body>', '<body class="android-app">')
  .replace(/\s*<button class="nav-item" data-view="player">.*?<\/button>/, '')
  .replace(/<section class="player-view"[\s\S]*?(?=<section class="quests-view")/, '')
  .replace('<script src="renderer.js"></script>', '<script src="mobile.js"></script><script src="renderer.js"></script>')
  .replace('</head>', '<link rel="stylesheet" href="mobile.css"></head>');
await writeFile(new URL('index.html', output), html);
for (const file of ['styles.css', 'renderer.js', 'quest-graph.js', 'game-model.js', 'map-ui.js', 'map-ui.css', 'book-ui.js', 'book-ui.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'PRIVACY.md']) await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, output));
await copyFile(new URL('../mobile/mobile.css', import.meta.url), new URL('mobile.css', output));
await cp(new URL('../assets/data/', import.meta.url), new URL('assets/data/', output), { recursive: true });
await cp(new URL('../assets/maps/', import.meta.url), new URL('assets/maps/', output), { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('../mobile/platform.js', import.meta.url))], bundle: true, outfile: fileURLToPath(new URL('mobile.js', output)), format: 'iife', target: 'chrome100', define: { __APP_VERSION__: JSON.stringify(metadata.version) } });
console.log('Android assets prepared (shared UI and quest catalog).');

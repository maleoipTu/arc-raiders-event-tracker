import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Только локальная проверка готовых пакетов. Контрольные суммы записываются
// после успешной проверки; исходники, пакеты и данные пользователя не меняются.
const root = fileURLToPath(new URL('../', import.meta.url));
const expectedVersion = '0.6.0';
const require = createRequire(import.meta.url);
const hash = (data, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(data).digest(encoding);
const local = relative => path.join(root, ...relative.split('/'));
const normalize = value => value.replaceAll('\\', '/').replace(/^\/+/, '');

async function bundledDependency(name, prefix) {
  try { return require(name); } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  const store = local('node_modules/.pnpm');
  const candidates = (await readdir(store)).filter(name => name.startsWith(prefix)).sort();
  assert.ok(candidates.length, `Не найдена локальная зависимость ${name}`);
  return require(path.join(store, candidates.at(-1), 'node_modules', ...name.split('/')));
}

async function filesUnder(relative) {
  const files = [];
  for (const entry of await readdir(local(relative), { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else {
      assert.ok(entry.isFile(), `Неожиданный тип файла: ${child}`);
      files.push(child);
    }
  }
  return files.sort();
}

async function apkEntries(filename, wanted) {
  const yauzl = await bundledDependency('yauzl', 'yauzl@');
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zip) => {
      if (error) { reject(error); return; }
      const names = new Set();
      const contents = new Map();
      let failed = false;
      const fail = reason => { if (!failed) { failed = true; zip.close(); reject(reason); } };
      zip.on('error', fail);
      zip.on('end', () => { if (!failed) resolve({ names, contents }); });
      zip.on('entry', entry => {
        const name = normalize(entry.fileName);
        if (names.has(name)) { fail(new Error(`Повтор файла в APK: ${name}`)); return; }
        names.add(name);
        if (!wanted.has(name)) { zip.readEntry(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) { fail(streamError); return; }
          const chunks = [];
          stream.on('error', fail);
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', () => {
            if (failed) return;
            contents.set(name, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

const metadata = JSON.parse(await readFile(local('package.json'), 'utf8'));
assert.equal(metadata.version, expectedVersion, 'Версия исходников не соответствует проверяемому выпуску');
const version = metadata.version;
const installer = `dist/ARC-Event-Tracker-Setup-${version}.exe`;
const apkFile = `dist/ARC-Event-Tracker-Android-${version}.apk`;
const archive = local(process.env.ARC_VERIFY_ASAR || 'dist/win-unpacked/resources/app.asar');
const asar = await bundledDependency('@electron/asar', '@electron+asar@');
const archivePaths = new Map(asar.listPackage(archive).map(name => [normalize(name), normalize(name).split('/').join(path.sep)]));
const shared = [
  'styles.css', 'renderer.js', 'quest-graph.js', 'game-model.js',
  'map-ui.js', 'map-ui.css', 'book-ui.js', 'book-ui.css',
  'LICENSE', 'THIRD_PARTY_NOTICES.md', 'PRIVACY.md',
  ...await filesUnder('assets/data'), ...await filesUnder('assets/maps'),
];
const desktop = ['main.js', 'preload.js', 'index.html', ...shared];
const mobile = new Map([
  ...shared.map(file => [file, file]),
  ['index.html', 'mobile/www/index.html'],
  ['mobile.js', 'mobile/www/mobile.js'],
  ['mobile.css', 'mobile/mobile.css'],
]);

function compare(data, expected, label) {
  assert.ok(data, `Отсутствует файл: ${label}`);
  assert.equal(hash(data), hash(expected), `Содержимое не совпадает с текущими исходниками: ${label}`);
}
for (const file of desktop) {
  assert.ok(archivePaths.has(file), `Отсутствует файл в ASAR: ${file}`);
  compare(asar.extractFile(archive, archivePaths.get(file)), await readFile(local(file)), `ASAR/${file}`);
}
const packagedMetadata = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
assert.equal(packagedMetadata.version, version, 'Версия package.json в ASAR');
assert.equal(packagedMetadata.name, metadata.name, 'Имя приложения в ASAR');

const wanted = new Set([...mobile.keys()].map(file => `assets/public/${file}`));
const apk = await apkEntries(local(apkFile), wanted);
for (const [file, expected] of mobile) {
  compare(apk.contents.get(`assets/public/${file}`), await readFile(local(expected)), `APK/${file}`);
}
const mobileHtml = apk.contents.get('assets/public/index.html').toString('utf8');
assert.doesNotMatch(mobileHtml, /\bdata-view\s*=\s*["']player["']|\bid\s*=\s*["']playerView["']|\bclass\s*=\s*["'][^"']*\bplayer-view\b/, 'В Android остался интерфейс статистики игрока');
assert.match(mobileHtml, /\bandroid-app\b/, 'В APK отсутствует мобильная версия интерфейса');

// Лишние старые файлы базы тоже считаются ошибкой упаковки.
for (const prefix of ['assets/data/', 'assets/maps/']) {
  const expected = shared.filter(file => file.startsWith(prefix)).sort();
  const desktopActual = [...archivePaths.keys()].filter(file => file.startsWith(prefix) && !file.endsWith('/') && !asar.statFile(archive, archivePaths.get(file)).files).sort();
  const mobileActual = [...apk.names].filter(file => file.startsWith(`assets/public/${prefix}`) && !file.endsWith('/')).map(file => file.slice('assets/public/'.length)).sort();
  assert.deepEqual(desktopActual, expected, `Состав ${prefix} в ASAR`);
  assert.deepEqual(mobileActual, expected, `Состав ${prefix} в APK`);
}

const latestFile = 'dist/latest.yml';
const latest = await readFile(local(latestFile), 'utf8');
const field = (name, expression) => {
  const match = latest.match(expression);
  assert.ok(match, `В latest.yml отсутствует ${name}`);
  return match[1].trim();
};
const installerName = path.basename(installer);
assert.equal(field('version', /^version:\s*(.+)$/m), version, 'Версия latest.yml');
assert.equal(field('path', /^path:\s*(.+)$/m), installerName, 'Путь latest.yml');
assert.equal(field('files.url', /^\s+- url:\s*(.+)$/m), installerName, 'URL latest.yml');
const exe = await readFile(local(installer));
assert.ok(exe.length > 0, 'Пустой установщик Windows');
assert.equal(Number(field('files.size', /^\s+size:\s*(\d+)$/m)), (await stat(local(installer))).size, 'Размер EXE в latest.yml');
const exeSha512 = hash(exe, 'sha512', 'base64');
assert.equal(field('files.sha512', /^\s+sha512:\s*(.+)$/m), exeSha512, 'SHA512 EXE в files latest.yml');
assert.equal(field('sha512', /^sha512:\s*(.+)$/m), exeSha512, 'SHA512 EXE в latest.yml');

const releaseFiles = [installer, apkFile, `${installer}.blockmap`, latestFile];
const checksumLines = [];
for (const file of releaseFiles) {
  const data = await readFile(local(file));
  assert.ok(data.length > 0, `Пустой файл выпуска: ${file}`);
  checksumLines.push(`${hash(data)}  ${path.basename(file)}`);
}
const sums = `dist/SHA256SUMS-${version}.txt`;
await writeFile(local(sums), `${checksumLines.join('\n')}\n`, 'utf8');
console.log(`Проверка ${version}: ASAR ${desktop.length} файлов, APK ${mobile.size} файлов — PASS.`);
console.log(`Версии, отсутствие статистики в Android, состав базы, лицензии и latest.yml — PASS.`);
console.log(`Контрольные суммы: ${sums}`);

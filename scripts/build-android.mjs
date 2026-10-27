import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || fileURLToPath(new URL('../.android-sdk', import.meta.url));
if (!existsSync(sdk)) throw new Error('Android SDK не найден. Укажите ANDROID_HOME. См. mobile/README.md.');
const signing = {};
const localSigning = new URL('../.android-keys/signing.json', import.meta.url);
if (!process.env.ARC_ANDROID_KEYSTORE && existsSync(localSigning)) {
  const secret = JSON.parse(await readFile(localSigning, 'utf8'));
  signing.ARC_ANDROID_KEYSTORE = fileURLToPath(new URL('../.android-keys/arc-tracker.jks', import.meta.url));
  signing.ARC_ANDROID_STORE_PASSWORD = secret.storePassword;
  signing.ARC_ANDROID_KEY_ALIAS = secret.keyAlias;
}
const release = Boolean(process.env.ARC_ANDROID_KEYSTORE || signing.ARC_ANDROID_KEYSTORE);
const task = release ? 'assembleRelease' : 'assembleDebug';
const win = process.platform === 'win32';
const localGradle = fileURLToPath(new URL(`../.android-tools/gradle-8.14.3/bin/gradle${win ? '.bat' : ''}`, import.meta.url));
const gradle = existsSync(localGradle) ? localGradle : (win ? 'gradlew.bat' : './gradlew');
const result = spawnSync(win ? 'cmd.exe' : gradle, win ? ['/d', '/c', gradle, task, ':app:lintRelease', '--no-daemon'] : [task, ':app:lintRelease', '--no-daemon'], {
  cwd: new URL('../android/', import.meta.url), stdio: 'inherit', env: { ...process.env, ...signing, ANDROID_HOME: sdk, GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || `${root}.gradle-cache` }
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const kind = release ? 'release' : 'debug';
const filename = `ARC-Event-Tracker-Android-${metadata.version}${release ? '' : '-debug'}.apk`;
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await copyFile(new URL(`../android/app/build/outputs/apk/${kind}/app-${kind}.apk`, import.meta.url), new URL(`../dist/${filename}`, import.meta.url));
console.log(`APK: dist/${filename}`);

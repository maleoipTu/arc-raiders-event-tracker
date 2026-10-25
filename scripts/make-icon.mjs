import { readFile, writeFile } from 'node:fs/promises';
import pngToIco from 'png-to-ico';

const source = new URL('../assets/app-icon.png', import.meta.url);
const destination = new URL('../assets/app-icon.ico', import.meta.url);
const png = await readFile(source);
const ico = await pngToIco(png);
await writeFile(destination, ico);
console.log(`Created ${destination.pathname} (${ico.length} bytes)`);

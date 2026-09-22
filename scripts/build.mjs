import { cp, lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const source = path.join(root, 'public');
const output = path.join(root, 'dist');
const allowedExtensions = new Set([
  '.html', '.css', '.js', '.jpg', '.jpeg', '.png', '.webp', '.avif',
  '.gif', '.svg', '.ico', '.mp4', '.webm', '.woff', '.woff2', '.txt', '.xml',
]);

async function validate(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) {
      throw new Error(`Hidden files and symbolic links cannot be published: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      count += await validate(entryPath);
    } else if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      count++;
    } else {
      throw new Error(`Unexpected public file: ${entryPath}`);
    }
  }
  return count;
}

if ((await lstat(source)).isSymbolicLink()) throw new Error('public must not be a symbolic link');
const fileCount = await validate(source);

// Refuse links/junctions before removing the fixed output directory.
const outputStat = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (outputStat && (!outputStat.isDirectory() || outputStat.isSymbolicLink())) {
  throw new Error('dist must be a regular directory');
}
if (outputStat && await realpath(output) !== output) throw new Error('Unexpected dist target');
if (path.dirname(output) !== root) throw new Error('Output must remain inside the project');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true, dereference: false });
console.log(`Built ${fileCount} public files into dist/. Functions and private sources are excluded.`);

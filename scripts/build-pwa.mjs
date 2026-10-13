import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const directory = resolve(process.argv[2] ?? "dist");
async function list(base, prefix = "") {
  const result = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory())
      result.push(...(await list(join(base, entry.name), name + "/")));
    else if (name !== "sw.js") result.push(name);
  }
  return result.sort();
}
const files = await list(directory);
const hash = createHash("sha256");
for (const file of files)
  hash.update(file).update(await readFile(join(directory, file)));
const version = hash.digest("hex").slice(0, 16);
const worker = `
const SCOPE = self.registration.scope;
const PREFIX = 'court-clock:' + new URL(SCOPE).pathname + ':';
const CACHE = PREFIX + ${JSON.stringify(version)};
const INDEX = new URL('index.html', SCOPE).href;
const FILES = ${JSON.stringify(files)}.map(file => new URL(file, SCOPE).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES.map(url => new Request(url, {cache:'reload'})));
    } catch(error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== new URL(SCOPE).origin || !url.href.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        // Keep the installed index immutable. A newly fetched HTML page may
        // reference bundles that are not available until a complete update installs.
        return response;
      } catch {
        return (await cache.match(INDEX, {ignoreVary:true})) ?? new Response('Offline', {status:503});
      }
    })());
  } else if (FILES.includes(url.href) || url.pathname.startsWith(new URL('assets/',SCOPE).pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // Our same-origin, static build files do not vary with request headers.
      // Module loads carry Origin; precache fetches may not, even on the same origin.
      const cached = await cache.match(request, {ignoreVary:true});
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
`;
await writeFile(join(directory, "sw.js"), worker.trimStart());
console.log(`PWA: precached ${files.length} files, version ${version}`);

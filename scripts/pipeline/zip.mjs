// Cross-platform zip extraction (no system `unzip` needed).
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

// Extract `archive` into `destination`. `keep(name)` filters entries by their
// path inside the archive.
export function extractZip(archive, destination, keep = () => true) {
  const files = unzipSync(fs.readFileSync(archive), {
    filter: (file) => !file.name.endsWith("/") && keep(file.name),
  });
  let count = 0;
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.resolve(destination, ...name.split("/"));
    if (!target.startsWith(path.resolve(destination) + path.sep)) continue; // zip-slip
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    count += 1;
  }
  return count;
}

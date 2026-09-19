import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(projectRoot, "assets/asset-manifest.json"), "utf8"));

function inspectGlb(buffer) {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "glTF") {
    throw new Error("missing glTF 2 binary header");
  }
  if (buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error("invalid glTF version or declared length");
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || 20 + jsonLength > buffer.length) {
    throw new Error("first GLB chunk is not JSON");
  }
  const document = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).trim());
  if (document.asset?.version !== "2.0") throw new Error("asset.version must be 2.0");
  const triangleCount = (document.meshes ?? []).reduce((sum, mesh) => sum + (mesh.primitives ?? []).reduce((meshSum, primitive) => {
    const accessor = document.accessors?.[primitive.indices];
    const positions = document.accessors?.[primitive.attributes?.POSITION];
    const count = accessor?.count ?? positions?.count ?? 0;
    return meshSum + ((primitive.mode ?? 4) === 4 ? Math.floor(count / 3) : 0);
  }, 0), 0);
  return { bytes: buffer.length, meshes: document.meshes?.length ?? 0, triangleCount };
}

const reports = [];
for (const asset of manifest.assets) {
  if (!asset.provenance?.trim()) throw new Error(`${asset.id}: provenance is required`);
  const buffer = await readFile(resolve(projectRoot, asset.path));
  const report = inspectGlb(buffer);
  if (report.bytes > asset.maxBytes) throw new Error(`${asset.id}: ${report.bytes} bytes exceeds ${asset.maxBytes}`);
  if (report.triangleCount > asset.maxTriangles) {
    throw new Error(`${asset.id}: ${report.triangleCount} triangles exceeds ${asset.maxTriangles}`);
  }
  reports.push({ id: asset.id, ...report, maxBytes: asset.maxBytes, maxTriangles: asset.maxTriangles });
}

console.log(JSON.stringify({
  schemaVersion: manifest.schemaVersion,
  frameBudgetMs: manifest.frameBudgetMs,
  assets: reports,
}, null, 2));

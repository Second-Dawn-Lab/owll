// Prints triangle count, animations, skins and textures of GLB/glTF files: node scripts/glb-stats.mjs file...
import { NodeIO } from "@gltf-transform/core";
const io = new NodeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  let tris = 0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    tris += idx ? idx.getCount() / 3 : (prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
  }
  console.log(JSON.stringify({ file: f.split(/[\/]/).pop(), triangles: Math.round(tris), animations: root.listAnimations().map((a) => a.getName()), skins: root.listSkins().length, textures: root.listTextures().length }));
}

// Renders a 5 s turntable per candidate model (list in scripts/owl-candidates.json) into E:\SecondDawn\media\out\v2\owl-candidates\.
// Models are read from the public dir outside the repository. Props go through a JSON file (quoting JSON on a Windows command line is fragile).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const out = "../../../media/out/v2/owl-candidates";
const tmp = "E:/SecondDawn/media/work/v2/props";
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });
const list = JSON.parse(readFileSync("scripts/owl-candidates.json", "utf8"));
const only = process.argv.slice(2);
for (const c of list) {
  if (only.length && !only.includes(c.id)) continue;
  const f = `${tmp}/${c.id}.json`;
  writeFileSync(f, JSON.stringify(c.props));
  execFileSync("npx", ["remotion", "render", "src/index.ts", "OwlCandidate", `${out}/${c.id}.mp4`, `--props=${f}`, "--gl=angle", "--public-dir=E:/SecondDawn/media/work/v2/public"], { stdio: "inherit", shell: true });
}

// Renders one still per scene (Style1..Style9) into E:\SecondDawn\media\out\v2\style-frames\. Assets (frames of the recorded clips) come
// from E:\SecondDawn\media\work\v2\public through --public-dir, so nothing generated lives in the repository.
import { execFileSync } from "node:child_process";
const out = "../../../media/out/v2/style-frames";
for (let i = 1; i <= 9; i++) {
  execFileSync("npx", ["remotion", "still", "src/index.ts", `Style${i}`, `${out}/scene-${i}.png`, "--frame=20", "--gl=angle", "--public-dir=E:/SecondDawn/media/work/v2/public"], { stdio: "inherit", shell: true });
}

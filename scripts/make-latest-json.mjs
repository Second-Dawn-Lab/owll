// Writes latest.json for the Tauri updater (static JSON format) and the release notes.
//
//   node scripts/make-latest-json.mjs <tag> <installer.exe> <installer.exe.sig> <out-dir>
//
// Notes come from the matching "## [x.y.z]" section of CHANGELOG.md. Used by the release workflow;
// see docs/releasing.md.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

export function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const escaped = version.replace(/\./g, "\\.");
  // "## [0.1.1](compare-link) (date)" as release-please writes it, or "## [0.1.1] - date" / "## 0.1.1".
  const heading = new RegExp("^##\\s*\\[?v?" + escaped + "\\]?(\\s|\\(|$)");
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return "";
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

/**
 * The notes as plain text for the in-app update notice, which shows its first lines: release-please writes
 * Markdown with links ("([abc1234](https://...))"), bold scopes and "### Features" headings.
 */
export function plainNotes(markdown) {
  return markdown
    .replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*(.+)$/gm, "$1:")
    .replace(/^[*-]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function latestJson({ tag, installerName, signature, notes, now = new Date(), repo = "Second-Dawn-Lab/owll" }) {
  const version = tag.replace(/^v/, "");
  return {
    version,
    notes,
    pub_date: now.toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: signature.trim(),
        url: `https://github.com/${repo}/releases/download/${tag}/${installerName}`,
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, installer, sigFile, outDir] = process.argv.slice(2);
  if (!tag || !installer || !sigFile || !outDir) {
    console.error("usage: node scripts/make-latest-json.mjs <tag> <installer.exe> <installer.exe.sig> <out-dir>");
    process.exit(2);
  }
  const version = tag.replace(/^v/, "");
  const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version);
  if (!notes) {
    console.error(`CHANGELOG.md has no section for ${version}.`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const json = latestJson({ tag, installerName: basename(installer), signature: readFileSync(sigFile, "utf8"), notes: plainNotes(notes) });
  writeFileSync(`${outDir}/latest.json`, `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(`${outDir}/release-notes.md`, `${notes}\n`);
  console.log(`wrote ${outDir}/latest.json for ${tag}`);
}

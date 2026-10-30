# Releasing Owl-L

Releases are automated with [release-please](https://github.com/googleapis/release-please). You never edit version numbers, the changelog or tags by hand. You write commit messages with a short prefix, merge a pull request when you want a release, test a draft, and click Publish.

Owl-L reaches the network in exactly two ways: **language pack downloads** (Hugging Face, on request) and the **update check** (`latest.json` on the latest GitHub release, at most once a day and when the user clicks "Check for updates"). No other code may open a connection. See "Network access" at the end.

## 1. How it works

```text
you commit "fix: ..." / "feat: ..." to main
        |
        v
release-please opens (and keeps updating) a "Release PR":  chore: release 0.1.1
   - bumps the version in package.json, Cargo.toml and Cargo.lock
   - adds the new section to CHANGELOG.md
        |   you merge it when you want a release
        v
release-please creates the tag v0.1.1 and a DRAFT GitHub Release (notes = the changelog section)
        |   same workflow run, next job
        v
the build job builds the installer, signs the updater files, uploads
   Owl-L_0.1.1_x64-setup.exe, ...setup.exe.sig and latest.json to the draft
        |
        v
you test the installer from the draft, then click "Publish release"
        |
        v
installed copies find latest.json and offer the update
```

**One version source.** `package.json` holds the version. `src-tauri/tauri.conf.json` reads it (`"version": "../package.json"`). release-please keeps `Cargo.toml` (`[workspace.package] version`) and the `owll` entry in `Cargo.lock` in step, so CI (which uses the lockfile) never sees a drift. The release build still checks that all of them match the tag.

**Why the build is a job of the same workflow.** A tag or release created with the default `GITHUB_TOKEN` does not start other workflows (a GitHub rule against loops). A separate "on tag push" workflow would therefore never run for a tag release-please made. So `.github/workflows/release.yml` has two jobs: `release-please` (opens the PR, creates the draft and the tag) and `build` (runs only when the first job created a release, and uploads to that draft).

**Why a draft, and the tag.** The draft keeps your review step: nothing reaches users until you publish. GitHub only creates a draft's tag when it is published, so the config sets `"force-tag-creation": true`: release-please creates the tag `v0.1.1` right away. Without it, the next run would not see the release and could open a duplicate Release PR.

**If the build fails** (for example a missing secret): fix the cause, then open Actions, Release, "Run workflow", and enter the tag (for example `v0.1.1`). It rebuilds and uploads to the existing draft; no new release is created.

## 2. One-time setup

### GitHub settings (both `owll` and `dawn-core`)

1. Settings, Actions, General, **Workflow permissions**: choose "Read and write permissions" and tick **"Allow GitHub Actions to create and approve pull requests"**. Without this release-please cannot open the Release PR.
2. The default branch must be `main` and must allow the Actions bot to push the release branch and tags (no rule that blocks it; if you protect `main`, the Release PR is merged like any other PR).
3. Labels: release-please creates `autorelease: pending` and `autorelease: tagged` itself the first time. Do not remove or rename them (they are how it knows a Release PR was already released).
4. Optional: **CI on the Release PR.** Pull requests made with the default token do not run CI. If you want CI checks on the Release PR, create a fine-grained personal access token (Contents and Pull requests: read and write, only for these two repositories) and add it as the repository secret `RELEASE_PLEASE_TOKEN`; the workflows use it automatically when present. Never put a token in a file or in a chat.

### The updater signing key (`owll` only)

The updater only installs updates signed with your key. **Never create the private key in this repository, never commit it, and never paste it into a chat or an issue.** Do these steps on your own machine:

1. Generate a key pair (choose a strong password when asked):

   ```bash
   pnpm tauri signer generate -w ~/.tauri/owll-updater.key
   ```

   This writes the private key to `~/.tauri/owll-updater.key` (outside any repository) and prints the public key. A matching `owll-updater.key.pub` file is written next to it.

2. Put the **public** key into `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The release workflow refuses to run while the placeholder `REPLACE_WITH_...` is still there.

3. Add two **GitHub Actions secrets** to the `owll` repository (Settings, Secrets and variables, Actions):

   | Secret | Value |
   |---|---|
   | `TAURI_SIGNING_PRIVATE_KEY` | the full content of `~/.tauri/owll-updater.key` |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you chose |

4. Back up the private key and password somewhere safe (a password manager). **If you lose the key, installed copies of Owl-L can never update themselves again.** If it leaks, generate a new pair, release a version that carries the new public key signed with the old key, and rotate the secrets.

If a secret is missing when a release is built, the `build` job stops immediately with an error that names it. It never uploads unsigned updater files. The job also refuses to run when `dawn-core.ref` is `main` (put a dawn-core tag or commit SHA there first).

## 3. Commit messages (what you type in GitHub Desktop)

release-please reads your commit messages, so the first line of each commit must start with a **prefix**. In GitHub Desktop that first line is the **Summary** box at the bottom left (the "Description" box below it is optional and is not used for the version). Format: `prefix: short description`, all lowercase prefix, a colon and a space.

| Prefix | Use it for | Example Summary | Version while below 1.0 | In the changelog |
|---|---|---|---|---|
| `fix:` | a bug fix | `fix: sort onboarding languages by name` | patch (0.1.1 to 0.1.2) | Bug Fixes |
| `feat:` | something users can now do | `feat: show capture results in the main window` | patch too (we configured it so; see below) | Features |
| `perf:` | faster, same behavior | `perf: start translating before the model is warm` | patch | Performance |
| `feat!:` or `fix!:` (or a `BREAKING CHANGE:` line in the Description) | a change that breaks settings, data or shortcuts | `feat!: rename the settings file` | **minor** (0.1.x to 0.2.0) | Features, marked as breaking |
| `docs:` | documentation only | `docs: explain pack mirrors` | none | hidden |
| `chore:` | maintenance, dependencies | `chore: update vitest` | none | hidden |
| `ci:` | workflows | `ci: pin the release action` | none | hidden |
| `test:` / `refactor:` / `style:` / `build:` | no visible change | `refactor: split the updater module` | none | hidden |

Optional scope in brackets: `fix(updater): say "no update information" when there is no release`.

Rules of thumb:

- One commit, one purpose. Several `fix:` and `feat:` commits since the last release collapse into **one** version bump: the biggest one wins (`feat!` over `feat`/`fix`).
- **While the version is below 1.0** we use `bump-minor-pre-major` and `bump-patch-for-minor-pre-major`: `fix` and `feat` both give a patch (0.1.0 to 0.1.1), only a breaking change gives a minor (0.2.0), and 1.0.0 is a release you choose on purpose by adding a commit whose Description contains the line `Release-As: 1.0.0`.
- Commits without a prefix, or with `docs:`/`chore:`/`ci:`/..., never make a release by themselves and are not listed.
- A pushed commit message cannot be changed in GitHub Desktop without rewriting history, so add a correct follow-up commit instead. If a wrong prefix would give the wrong version, add a commit whose Description contains the line `Release-As: x.y.z` for the version you want (editing the Release PR's title does not change it).
- If you merge pull requests with "Squash and merge", the **PR title** is the commit message, so it needs the prefix. With "Create a merge commit", the individual commits count.

`dawn-core` works the same way (its tags are what you put into `dawn-core.ref`), but it uses the standard rule: `feat:` bumps the minor (0.1.1 to 0.2.0), `fix:` the patch. Its manifest starts at `0.1.1`, the tag `dawn-core.ref` points at today; if that is not dawn-core's newest tag, set the manifest to the newest one before merging the first Release PR.

## 4. Releasing Owl-L, step by step

1. **Commit** your changes with prefixed Summaries (section 3) and **push** to `main` in GitHub Desktop (Push origin).
2. CI runs. A minute later, in the `owll` repository on GitHub, a pull request **"chore: release 0.1.1"** appears (Pull requests tab). Each further push to `main` updates it. Open it to see the new version and the changelog it will write. If nothing appears, no `fix:`/`feat:`/`perf:` commit has landed since the last release.
3. If `dawn-core.ref` still says `main`, change it to a dawn-core tag first (see section 6) and push that as `chore: pin dawn-core v0.1.0`.
4. **Merge the Release PR** when you want to release (Merge pull request, then Confirm).
5. Open the Actions tab: the **Release** run now has two jobs. `release-please` creates the tag and a **draft release**; `build` (about 20 to 90 minutes, depending on the cache) uploads three files to it:
   - `Owl-L_x.y.z_x64-setup.exe`, the installer
   - `Owl-L_x.y.z_x64-setup.exe.sig`, its updater signature
   - `latest.json`, what the updater reads
6. **Test the draft.** In Releases, open the draft ("Draft" label), download the installer and run the manual test list in section 7. Drafts are only visible to you.
7. **Publish.** Edit the draft, check the notes, click **Publish release**. From then on `https://github.com/Second-Dawn-Lab/owll/releases/latest/download/latest.json` exists and installed copies offer the update.

To withdraw a bad release before or after publishing, delete the release or turn it back into a draft (`latest` then points at the previous published release), fix the problem with `fix:` commits and release the next patch version. Do not reuse a version number.

## 5. Bootstrapping note (already done for 0.1.0)

`.release-please-manifest.json` says `0.1.0`, the last published version (tag `v0.1.0`). release-please finds the commits after that tag. Do not edit the manifest by hand afterwards; the Release PR updates it.

## 6. dawn-core releases

`dawn-core` has the same flow without an installer: `.github/workflows/release-please.yml` keeps a Release PR open; merging it creates the tag (for example `v0.1.0`) and a GitHub release with the changelog. Put that tag in `owll/dawn-core.ref` (and the template's) so release builds are reproducible. The Cargo crates inside dawn-core keep their internal version `0.0.0`; the tag is the version.

## 7. Windows code signing (SmartScreen)

Not implemented yet. The updater signature above protects the update channel; it is **not** a Windows code-signing certificate. Without one, Windows SmartScreen shows "Windows protected your PC / Unknown publisher" on a fresh download until the file earns reputation. The README tells users how to continue ("More info", then "Run anyway").

| Option | Cost | What it takes | Notes |
|---|---|---|---|
| **SignPath Foundation** | Free for open-source projects | An application, review by SignPath; the project must be public and OSI-licensed, with a code signing policy and no malware or closed-source parts. Signing runs in CI through their GitHub Action; the certificate is issued to SignPath Foundation, so the publisher shows as "SignPath Foundation". | Best fit. Reputation still builds up over time. |
| **Azure Trusted Signing** | Paid (about 10 USD a month) | A verified identity (individual or organization, identity validation can take days or weeks and is limited to some countries), an Azure subscription. | Easy GitHub integration, publisher shows your verified name. |
| **Unsigned** | Free | Nothing | Users see the SmartScreen warning at every new version for a long time. Acceptable for a first, small release. |

**Recommendation for a free open-source project: apply to SignPath Foundation**, and ship unsigned in the meantime. What you need to apply:

- the public GitHub repository URL (`Second-Dawn-Lab/owll`) with the MIT `LICENSE` file, and a short description of what Owl-L does;
- a README that states the project's purpose, how to build it and (their requirement) a **code signing policy** page in the repository (who may trigger a signing run, that only CI-built artifacts are signed, no telemetry/malware);
- the project's homepage or download page, a maintainer contact e-mail, and the maintainers' names;
- a build that runs in GitHub Actions from the public source (the `build` job already does), so the signed file can be traced to a commit;
- an agreement that the project is not tied to closed-source or proprietary components in the signed file.

Check SignPath Foundation's current conditions on their website before applying; they may have changed.

## 8. Manual test list for a release

Run on a clean Windows user profile (or a fresh VM), using the installer from the **draft release**:

1. Install from `Owl-L_x.y.z_x64-setup.exe` (SmartScreen: More info, Run anyway). Owl-L starts and shows the welcome.
2. Welcome: skip it once (it must not return), or complete it: the language list is sorted by name; choose a language and watch the download progress. A language whose files are already on disk shows "Included with ..., no download".
3. Language packs (menu, Language packs): download German from Hugging Face; the progress bar moves; the pack is listed with its license and attribution.
4. Disconnect from the network; translate English to German and back. It works offline.
5. Ctrl+C+C on selected text in another program: the popup appears next to the pointer; resize it to its smallest size and open the language list: the list is fully visible.
6. Ctrl+Shift+O: select clear English text on screen; the main window comes to the front on the Images tab with the captured image, the editable recognized text and the translation. Settings, Files & translation, Capture results: switch to "Small popup" and repeat.
7. Menu, Check for updates, and Settings, General, Check for updates: "Owl-L is up to date" while no newer release is published; with the network off, the connection message.
8. About: version and the model attribution (OPUS-MT, Helsinki-NLP, CC-BY-4.0 / Apache-2.0) are shown.
9. Uninstall (Settings, Apps): the question "Also delete Owl-L's settings and translation history?" appears. Answer No and check that `%AppData%\SecondDawn\owll` is still there; reinstall, uninstall again, answer Yes and check that it is gone. In both cases `%AppData%\SecondDawn\models` stays.
10. Update test (once a second release exists): install the older version, publish the newer release, click Check for updates, "Update and restart".

## 9. Network access

| Code | When | What is sent |
|---|---|---|
| `dawn-models` downloads (`crates/dawn-models/src/download.rs` in dawn-core) | Only when the user installs a language pack | An HTTPS GET for a pack file from the pinned Hugging Face url (the catalog's `urls`). |
| `tauri-plugin-updater` (`src/updater.ts`, `src-tauri/src/updates.rs`) | At most once a day at startup, and when the user clicks "Check for updates" | An HTTPS GET for `latest.json` on GitHub. The installer is downloaded only after the user clicks "Update and restart". |

Translation, OCR, history and settings never touch the network. Anything new that needs the network must be added to this table and to the README's privacy section first.

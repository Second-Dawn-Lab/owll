# Releasing Owl-L

How a version goes from a tag to users' machines, and the one-time setup it needs.

Owl-L reaches the network in exactly two ways: **language pack downloads** (Hugging Face, on request) and the **update check** (`latest.json` on the latest GitHub release, at most once a day and when the user clicks "Check for updates"). No other code may open a connection. See "Network access" at the end.

## 1. One-time setup: the updater signing key

The updater only installs updates signed with your key. **Never create the private key in this repository, never commit it, and never paste it into a chat or an issue.** Do these steps on your own machine:

1. Generate a key pair (choose a strong password when asked):

   ```bash
   pnpm tauri signer generate -w ~/.tauri/owll-updater.key
   ```

   This writes the private key to `~/.tauri/owll-updater.key` (outside any repository) and prints the public key. A matching `owll-updater.key.pub` file is written next to it.

2. Put the **public** key into `src-tauri/tauri.conf.json`, replacing the marked placeholder:

   ```json
   "plugins": { "updater": { "pubkey": "<content of owll-updater.key.pub>", ... } }
   ```

   The placeholder text is `REPLACE_WITH_UPDATER_PUBLIC_KEY ...`. The release workflow refuses to run while it is still there. Commit this change.

3. Add two **GitHub Actions secrets** to the `owll` repository (Settings, Secrets and variables, Actions, New repository secret):

   | Secret | Value |
   |---|---|
   | `TAURI_SIGNING_PRIVATE_KEY` | the full content of `~/.tauri/owll-updater.key` |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you chose |

4. Back up the private key and password somewhere safe (a password manager). **If you lose the key, installed copies of Owl-L can never update themselves again**: users would have to download a new installer by hand. If the key leaks, generate a new pair, release a version that carries the new public key signed with the old key, and rotate the secrets.

If a secret is missing when a tag is pushed, the workflow stops immediately with an error that names it. It never publishes unsigned updater artifacts.

## 2. Releasing a version

1. Update the version in **all three places** (they must match; the workflow checks this against the tag):
   - `package.json` (`version`)
   - `Cargo.toml` (`[workspace.package] version`)
   - `src-tauri/tauri.conf.json` (`version`)
2. Add a section for the version to `CHANGELOG.md`, headed `## [x.y.z] - date`. Its text becomes the release notes and the notes in the in-app update notice (keep the first lines short and in plain words).
3. Put a `dawn-core` commit SHA or tag in `dawn-core.ref` (never `main`), after testing against it. The workflow refuses `main`.
4. Commit and push. Check that CI is green.
5. Tag and push the tag (`v0.1.0`). In GitHub Desktop: History tab, right-click the release commit, "Create Tag...", then push (the tag is pushed with the next "Push origin"). On the command line: `git tag v0.1.0 && git push origin v0.1.0`.
6. The `Release` workflow (about 20 to 90 minutes, depending on the cache) builds the NSIS installer for Windows x64, signs the updater artifacts and creates a **draft** release with three files:
   - `Owl-L_x.y.z_x64-setup.exe`, the installer
   - `Owl-L_x.y.z_x64-setup.exe.sig`, its updater signature
   - `latest.json`, what the updater reads
7. **Review the draft** (download the installer and run through the manual test list below), then click **Publish release**. The updater looks at `https://github.com/Second-Dawn-Lab/owll/releases/latest/download/latest.json`, which exists only for published, non-draft releases. Until you publish, nobody is offered the update.

To withdraw a bad release, delete it or mark it as a draft/pre-release again; `latest` then points at the previous published release.

## 3. Windows code signing (SmartScreen)

Not implemented yet. The updater signature above protects the update channel; it is **not** a Windows code-signing certificate. Without one, Windows SmartScreen shows "Windows protected your PC / Unknown publisher" on a fresh download until the file earns reputation. The README tells users how to continue ("More info", then "Run anyway").

| Option | Cost | What it takes | Notes |
|---|---|---|---|
| **SignPath Foundation** | Free for open-source projects | An application, review by SignPath; the project must be public and OSI-licensed, with a code signing policy and no malware or closed-source parts. Signing runs in CI through their GitHub Action; the certificate is issued to SignPath Foundation, so the publisher shows as "SignPath Foundation". | Best fit. Reputation still builds up over time. |
| **Azure Trusted Signing** | Paid (about 10 USD a month) | A verified identity (individual or organization, identity validation can take days or weeks and is limited to some countries), an Azure subscription. | Easy GitHub integration, publisher shows your verified name. |
| **Unsigned** | Free | Nothing | Users see the SmartScreen warning at every new version for a long time. Acceptable for a first, small release. |

**Recommendation for a free open-source project: apply to SignPath Foundation**, and ship v0.1 unsigned in the meantime. What you need to apply:

- the public GitHub repository URL (`Second-Dawn-Lab/owll`) with the MIT `LICENSE` file, and a short description of what Owl-L does;
- a README that states the project's purpose, how to build it and (their requirement) a **code signing policy** page in the repository (who may trigger a signing run, that only CI-built artifacts are signed, no telemetry/malware);
- the project's homepage or download page, a maintainer contact e-mail, and the maintainers' names;
- a build that runs in GitHub Actions from the public source (the `Release` workflow already does), so the signed file can be traced to a commit;
- an agreement that the project is not tied to closed-source or proprietary components in the signed file.

Check SignPath Foundation's current conditions on their website before applying; they may have changed.

## 4. Manual test list for a release

Run on a clean Windows user profile (or a fresh VM), using the installer from the **draft release**:

1. Install from `Owl-L_x.y.z_x64-setup.exe` (SmartScreen: More info, Run anyway). Owl-L starts and shows the welcome.
2. Welcome: skip it once (it must not return), or complete it: choose a language and watch the download progress.
3. Language packs (menu, Language packs): download German from Hugging Face; the progress bar moves; the pack is listed with its license and attribution.
4. Disconnect from the network; translate English to German and back. It works offline.
5. Ctrl+C+C on selected text in another program: the popup appears next to the pointer; resize it to its smallest size and open the language list: the list is fully visible.
6. Ctrl+Shift+O: select clear English text on screen; the translation appears.
7. Menu, Check for updates, and Settings, General, Check for updates: "Owl-L is up to date" while no newer release is published.
8. About: version and the model attribution (OPUS-MT, Helsinki-NLP, CC-BY-4.0 / Apache-2.0) are shown.
9. Uninstall (Settings, Apps): the question "Also delete Owl-L's settings and translation history?" appears. Answer No and check that `%AppData%\SecondDawn\owll` is still there; reinstall, uninstall again, answer Yes and check that it is gone. In both cases `%AppData%\SecondDawn\models` stays.
10. Update test (once a second release exists): install the older version, publish the newer release, click Check for updates, "Update and restart".

## 5. Network access

| Code | When | What is sent |
|---|---|---|
| `dawn-models` downloads (`crates/dawn-models/src/download.rs` in dawn-core) | Only when the user installs a language pack | An HTTPS GET for a pack file from the pinned Hugging Face url (the catalog's `urls`). |
| `tauri-plugin-updater` (`src/updater.ts`, `src-tauri/src/updates.rs`) | At most once a day at startup, and when the user clicks "Check for updates" | An HTTPS GET for `latest.json` on GitHub. The installer is downloaded only after the user clicks "Update and restart". |

Translation, OCR, history and settings never touch the network. Anything new that needs the network must be added to this table and to the README's privacy section first.

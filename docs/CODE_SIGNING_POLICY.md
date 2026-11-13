# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

This policy applies to **Owl-L** ([github.com/Second-Dawn-Lab/owll](https://github.com/Second-Dawn-Lab/owll)), a free, offline, private translator for Windows, MIT licensed.

## What is signed

Only artifacts built by the **Release workflow** ([`.github/workflows/release.yml`](../.github/workflows/release.yml)) on GitHub Actions, from the public source code in this repository, at the commit of a release tag:

- the Windows installer (`Owl-L_x.y.z_x64-setup.exe`), and
- the application program inside it (`owll.exe`).

Never signed: local builds on a developer's computer, builds of other branches or pull requests, third-party programs (for example `llama-server`, which Owl-L downloads on request and verifies by checksum), language and model packs, and anything that is not built from this repository.

The release build reads one pinned version of the shared [`dawn-core`](https://github.com/Second-Dawn-Lab/dawn-core) repository (named in [`dawn-core.ref`](../dawn-core.ref)), which is also open source (MIT). Owl-L contains no closed-source or proprietary components.

Separately from Windows code signing, update files are signed with Owl-L's own updater key (see [releasing.md](releasing.md)); that signature is checked by the app before it installs an update.

## Roles

| Role | Who |
|---|---|
| **Committers and reviewers** | The maintainer: [GitHub `engrali93`](https://github.com/engrali93) |
| **Approvers** (approve every signing request) | The maintainer: [GitHub `engrali93`](https://github.com/engrali93) |

The same person holds both roles today. Anyone who is added later is listed here before they can approve a signing request. Every contributor's change is reviewed by a committer before it is merged into `main`.

## Approval

**Every signing request is approved manually** by an Approver in SignPath. There is no automatic approval. Before approving, the Approver checks that the request comes from the Release workflow run of a release tag in this repository, that the draft release was tested (see the manual test list in [releasing.md](releasing.md)), and that the release notes match the changes.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

What Owl-L does with the network, in full:

| What | When | Where to | What is sent |
|---|---|---|---|
| Language pack, dictionary and model pack downloads (including the optional Quality mode runtime and language model) | Only when the user installs or updates a pack, or turns on Quality mode and presses Download | [Hugging Face](https://huggingface.co/Second-Dawn-Lab) (the `Second-Dawn-Lab` repositories); for Quality mode packs the authors' own repositories or the llama.cpp release on GitHub if the mirror fails | A plain HTTPS download of a file; every file is checked against a checksum. No text, files or screenshots are sent. The server sees the usual connection data (IP address, file requested). |
| Update check | At most once a day at startup, and when the user clicks "Check for updates" | [GitHub Releases](https://github.com/Second-Dawn-Lab/owll/releases) of this repository (`latest.json`) | A plain HTTPS download. The installer is downloaded only if the user clicks "Update and restart". |
| Quality mode (optional, off by default) | Only while the user uses it | Only this computer: `127.0.0.1`, `localhost` or `[::1]`, either a `llama-server` that Owl-L starts, or an Ollama the user already runs. Any other address is refused. | The text being translated goes to that local program and nowhere else. |

No telemetry, no accounts, no analytics, no crash reports. Translation, text recognition, history and settings never use the network.

## Contact

Report problems with this policy, or a suspected misuse of a signed file, as described in [SECURITY.md](../SECURITY.md).

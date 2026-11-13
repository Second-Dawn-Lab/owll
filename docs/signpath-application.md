# Text for the SignPath Foundation application

For https://signpath.org/apply.html. Copy the fields below. Check the form's current fields and conditions first; they may have changed. Fill in the e-mail and the name you want to give.

| Field | Text |
|---|---|
| Project name | Owl-L |
| Repository URL | https://github.com/Second-Dawn-Lab/owll |
| Homepage | https://github.com/Second-Dawn-Lab/owll |
| Download URL | https://github.com/Second-Dawn-Lab/owll/releases |
| License | MIT (OSI approved). Full text: https://github.com/Second-Dawn-Lab/owll/blob/main/LICENSE |
| Code signing policy | https://github.com/Second-Dawn-Lab/owll/blob/main/docs/CODE_SIGNING_POLICY.md (also linked from the README, section "Code signing policy") |
| Privacy statement | In the code signing policy and in the README: "This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it." |
| Maintainer / approver | GitHub `engrali93` (sole maintainer; committer, reviewer and approver) |
| Contact e-mail | _your e-mail address_ |
| Build system | GitHub Actions, `.github/workflows/release.yml`, from the public repository at a release tag |
| Artifact types | Windows installer (NSIS, `.exe`) and the application program `owll.exe` inside it. Authenticode signing. No drivers, no DLLs or other binaries of third parties are signed. |
| Platform | Windows 10 and 11, 64-bit |

## Short description

Owl-L is a free, open-source, offline translator for Windows. It translates typed or pasted text, selected text in any program (Ctrl+C+C), areas of the screen (text recognition) and Word, PowerPoint, Excel and PDF files. The translation models run on the user's own computer, so after the user installs a language pack, translation works without internet. There is no account, no telemetry and no tracking.

## Who uses it

People who need to translate text, documents or screen content and do not want to send it to an online service: students, people who work with confidential or personal documents, and people with slow or no internet. Owl-L is a new project from the Second Dawn organization (free, offline, private desktop apps); it is not yet widely used, and a code signing certificate is the main thing missing for users to trust the installer without a SmartScreen warning.

## Why it qualifies

- Public repository, MIT license, no closed-source or proprietary components in the signed files (the shared code in the public `dawn-core` repository is MIT too).
- Releases are built by GitHub Actions from the public repository; local builds are never signed.
- Every signing request is approved manually by the maintainer.
- No telemetry. The only network use is on request (language, dictionary and model pack downloads from Hugging Face, checked by checksum) and an update check against GitHub Releases at most once a day. The optional Quality mode talks only to `127.0.0.1` / `localhost` / `[::1]`.
- Not malware, no hacking tools, no features for bypassing security software.

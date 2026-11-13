# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private vulnerability reporting instead:

1. Open the [Security tab of this repository](https://github.com/Second-Dawn-Lab/owll/security).
2. Click **Report a vulnerability** and describe the problem: what you found, how to reproduce it, which version of Owl-L, and what you think the impact is.

Only the maintainer can see the report. You will get an answer within about a week. We will tell you when a fix is released and, if you want, credit you in the release notes.

Please give us a reasonable time to fix the problem before you publish it.

## What counts

For example: a way to make Owl-L send text, files or screenshots to a remote computer, a way to make it connect to an address other than `127.0.0.1`, `localhost` or `[::1]` for Quality mode, a downloaded pack that is not verified, a flaw in the updater, or a signed Owl-L file that was not built by this repository's Release workflow (see the [code signing policy](docs/CODE_SIGNING_POLICY.md)).

## Supported versions

Only the latest release receives fixes. Owl-L updates itself from GitHub Releases (the update check is described in the [README](README.md#privacy-and-offline-use)).

## Not a vulnerability

Windows SmartScreen warning about an installer that has not been signed yet, and the content of third-party models that you download on request.

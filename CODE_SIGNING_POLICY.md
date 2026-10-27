# Code signing policy

## Current status

Windows releases are currently unsigned. We are preparing an application to
SignPath Foundation's free open-source code signing program. Acceptance,
certificate access and production signing have not been granted yet.
Do not interpret this policy as confirmation that an existing installer is signed.

If accepted, the intended acknowledgement will be:

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

The certificate would identify **SignPath Foundation** as the publisher. It is
not a certificate issued in the maintainer's personal name. Valid Authenticode
signatures do not guarantee immediate Microsoft SmartScreen reputation.

## Scope

Only the ARC Event Tracker Windows application executable and its installer,
built from this repository, are eligible for signing. We do not submit third-party
installers, ARC Tracker Link, game executables, or unrelated files for signing.
Upstream libraries and runtime components retain their respective licenses and
must not be re-signed as if our project maintained them.

## Maintainer roles

- Committer and reviewer: [maleoipTu](https://github.com/maleoipTu).
- Release and signing approver: [maleoipTu](https://github.com/maleoipTu).

Signing must remain disabled until the maintainer has enabled multi-factor
authentication on GitHub and SignPath, and SignPath has approved the project.
This policy does not assert that those account settings have already been verified.
External contributions must be reviewed by the maintainer before release.

## Build and approval

1. Build the release from a recorded commit/tag on GitHub-hosted runners with
   the committed pnpm lockfile. Store signing candidates as GitHub Actions artifacts.
2. Submit only those artifacts to the approved SignPath project and signing policy.
3. The release approver reviews the commit, artifact origin, version and signing request.
   Every production signing request requires explicit manual approval in SignPath.
4. Sign the application before packaging it into the installer, then sign the
   final installer. Check both Authenticode signatures and trusted timestamps.
5. Generate the updater's blockmap, file sizes and SHA-512 metadata from the
   final signed installer. Never publish stale update metadata from the unsigned file.
6. Publish only the verified release files. Include a link to this policy in
   the release/download description and identify whether that release is signed.

Tokens belong in GitHub Actions secrets, never in source, screenshots or logs.
Android uses a separate local signing identity; Windows signing credentials must
not contain the Android keystore or the user's Steam/ARC Tracker keys.

## Privacy

See [PRIVACY.md](PRIVACY.md) for application network requests, local storage,
optional account connections and the policies of third-party services.

## License and third-party material

The original application source code is [MIT-licensed](LICENSE).
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) documents third-party material.
ARC Raiders trademarks, artwork and game content remain the property of their
respective owners and are not relicensed by this project's MIT license.

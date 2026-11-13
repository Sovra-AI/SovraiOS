# Contributing to SovraiOS

Contributions from outside and inside Sovra are welcome: bug reports,
documentation, tests, and focused code changes. Search existing issues first;
for a substantial change, open an issue to discuss the approach before coding.
Follow our [Code of Conduct](CODE_OF_CONDUCT.md).

Report security issues through [SECURITY.md](SECURITY.md), not public issues.

Source on the default branch `main` is under the **Sustainable Use License**
(see [LICENSE](LICENSE)). This is n8n's Sustainable Use License, which n8n's
documentation allows other projects to use. The model is fair-code:
source-available, and free to use and extend for your own internal business
purposes or for non-commercial or personal use, with the limits in that
license. It is not an OSI open-source license. Files named `.ee.` or kept in
a directory whose name contains `.ee` are under
[LICENSE_EE.md](LICENSE_EE.md) instead. n8n does not own SovraiOS.

The canonical engineering rules live in [AGENTS.md](AGENTS.md) and apply to
humans and coding agents alike. This file covers the workflow around them; it
does not duplicate them.

## Getting started

Fork the repository on GitHub if you do not have write access, clone your fork,
and create a branch from the upstream `main`. Install the
[prerequisites](docs/development.md#prerequisites), then run:

```sh
npm install
npm run native:ios   # build the Rust transport and bindings
npm run ios          # development build on a simulator or device
```

Read before writing code:

- [docs/architecture.md](docs/architecture.md) — layers and the protocol rules the client enforces
- [docs/development.md](docs/development.md) — builds, checks, and generated files
- [docs/theming.md](docs/theming.md) — the Sovra tokens (required for UI work)
- [docs/README.md](docs/README.md) — documentation map
- [docs/documentation.md](docs/documentation.md) — writing and verifying documentation

## Best practices

- **Definition of done:** `npm run check` passes locally. CI runs the same
  gates; don't lean on it to find what you could have caught first.
- **Decide in `src/remote/`, move bytes in Rust, render in screens.** Protocol
  logic is pure TypeScript that takes a `PhoneTransport`, so Jest can test it.
- **The desktop contract is canonical.** A wire change starts in SovraHarness;
  copy its fixtures into `src/remote/__tests__/fixtures/` and keep
  `wire.test.ts` byte-equal. Make the same change in
  [SovraAndroid](https://github.com/Sovra-AI/SovraAndroid).
- **Bug fix ⇒ regression test first.**
- **Dependencies:** add them with `npx expo install` so versions match the Expo
  SDK. Keep `iroh` pinned to the desktop's version.
- **Never commit secrets or pairing links**, and never log, store, or route the
  pairing link; see [SECURITY.md](SECURITY.md).

## Branches, commits, and review

Day-to-day work goes through pull requests so CI, changelog, and review happen
before `main` moves.

1. Branch from the latest upstream `main`. Keep the branch short-lived and focused.
   Name it `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, or `chore/<topic>`.
2. Prefer small, reviewable commits. Prefix every commit message with a
   gitmoji and conventional scope (`✨ feat(remote): …`, `🐛 fix(chat): …`,
   `📝 docs: …`). No attribution or co-author trailers.
3. **Changelog and README:** every change that adds, changes, fixes, or removes
   behaviour updates [CHANGELOG.md](CHANGELOG.md) under **Unreleased**, and
   [README.md](README.md) whenever user-visible features, tabs, or commands change.
4. Open a pull request against the upstream `main`, including from your fork.
   Fill in the template and record the checks run and any failures. CI must be green.
5. Maintainers squash-merge the pull request. The squash title is the PR title
   (gitmoji prefix, same style as commits). Delete the branch on merge.

Do not force-push `main`.

## GitHub Actions

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

| Job       | Runner | What it proves                                   |
| --------- | ------ | ------------------------------------------------ |
| app       | Ubuntu | `tsc`, ESLint, and Jest                          |
| transport | Ubuntu | `cargo test` and `cargo clippy -D warnings`      |

A new push to the same branch or pull request cancels the previous run. iOS
builds and the [desktop interop tests](interop/README.md) are not run in CI.

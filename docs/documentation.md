# Maintaining documentation

Documentation describes behavior present in this checkout. Update the relevant guide in the
same pull request as a behavior change, and keep the README concise. Record release history
in [CHANGELOG.md](../CHANGELOG.md), not in dated appendices to guides. Track proposals and
future work in GitHub issues.

SovraiOS, [SovraAndroid](https://github.com/Sovra-AI/SovraAndroid), and
[SovraHarness](https://github.com/Sovra-AI/SovraHarness) share one documentation style, and
the same license files. When you change the shape of a README, guide, or community file here,
make the matching change in the other repositories.

## Choose the right guide

Use the [documentation index](README.md) to find an existing home before adding a page. Keep
first-use instructions, task guides, technical reference, and design explanations distinct.
A task guide should state prerequisites, concrete steps, what success looks like, and
relevant failure cases. Link to implementation explanations instead of putting them between
the steps.

This structure follows [Diátaxis](https://diataxis.fr/start-here/). Contributor entry points
follow [GitHub's contribution-guideline guidance](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors).

## Write from evidence

- Verify commands against `package.json` scripts, manifests, and workflow files.
- Verify visible labels against the screens and behavior against `src/remote/` and its tests.
- Describe the desktop protocol by linking to the desktop contract; do not restate it.
- State relevant limitations without promising future features or delivery dates.
- Use plain language, descriptive headings, short paragraphs, and relative links. Link to
  other repositories with full GitHub URLs, not sibling-checkout paths.
- Keep examples synthetic. Never commit keys, pairing links, personal logs, or machine paths.

## Verify a change

Check that every relative link resolves, run `npm run check` and `git diff --check`, and
review Markdown and Mermaid rendering on GitHub before merging. Run documented commands when
feasible and report checks that need unavailable devices, accounts, or a desktop checkout.

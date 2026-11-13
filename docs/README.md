# Documentation

SovraiOS is the iPhone app for controlling Sovra on your computer. These guides describe
the current checkout. Start with the [project README](../README.md) for installation and the
[changelog](../CHANGELOG.md) for release history.

The desktop owns the phone-control protocol. Its contract is
[SovraHarness `docs/remote-control.md`](https://github.com/Sovra-AI/SovraHarness/blob/main/docs/remote-control.md);
the native Android app with the same screens is
[SovraAndroid](https://github.com/Sovra-AI/SovraAndroid).

## Start here

- [Project README](../README.md#quick-start): pair the app with Sovra on your computer and build it.
- [Development](development.md): prerequisites, builds, checks, and the project layout.

## Develop and test

- [Contributing](../CONTRIBUTING.md): issues, branches, pull requests, and required checks.
- [Development](development.md): development builds, the stack, and generated files.
- [Desktop interop tests](../interop/README.md): the transport against the real desktop.
- [Theming](theming.md): tokens ported from the desktop, accessibility, and mobile adaptations.
- [Documentation maintenance](documentation.md): writing and checking these guides.

## Understand the implementation

- [Architecture](architecture.md): layers, protocol rules, pairing and secrets, chat, and known limits.

See [Security](../SECURITY.md) for vulnerability reporting and
[Code of Conduct](../CODE_OF_CONDUCT.md) for participation expectations.

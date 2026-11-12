# Sovra for phones

Control [Sovra Harness](https://github.com/Sovra-AI) on your computer from your phone.
Pair once by scanning a code; after that, opening the app connects to your computer by
itself — on the same Wi-Fi or over mobile data — end-to-end encrypted.

On the phone you can:

- **Chat** — write a message and send it through Sovra's real chat box; read visible replies; press **Stop**.
- **Screen** — a live, scaled picture of the Sovra window built from its controls (plus a
  screenshot where the desktop can capture one). Tap any control to press it.
- **Controls** — every labelled button, tab and box as a large, accessible list; scroll lists.
- **Keys** — Enter, Esc, Tab, Backspace, arrows.

This is the phone half of the contract in
[`SovraHarness/docs/remote-control.md`](../SovraHarness/docs/remote-control.md). It controls
Sovra's window and chats only — not your operating system, files or shell.

## How to use it

1. On your computer, in Sovra: **Skills → Use Sovra from your phone** (or `/remote-control`).
2. In this app: **Scan the code** (or scan it with the phone's camera app — the `sovra://`
   link opens this app). The code works once and expires after five minutes.
3. Next time just open the app. If it says **Start remote control on your computer**, run the
   skill again: for safety it switches off whenever Sovra restarts. Your phone stays paired.

To revoke a phone, choose **Forget** for it in Sovra on your computer. **Settings → Forget this
computer** on the phone only removes it from the phone.

## Stack

| Concern | Choice |
| --- | --- |
| App | Expo SDK 58, React Native 0.88 (New Architecture only), React 19.3, React Compiler, TypeScript 6 strict |
| Navigation | Expo Router (typed routes), file-based in `src/app/` |
| State | Zustand stores in `src/state/` |
| Secure storage | `expo-secure-store` (Keychain / Keystore, this-device-only, no backup) |
| QR scanning | `expo-camera` |
| Transport | Rust turbo module `modules/sovra-remote` (Iroh 1.4.1 QUIC, same version as the desktop) built with [uniffi-bindgen-react-native](https://github.com/jhugman/uniffi-bindgen-react-native) |
| Tests | Jest (`jest-expo`) for the protocol, `cargo test` for the transport, `interop/` against the real desktop |

Because the app contains a native Rust module it needs a **development build**, not Expo Go.

## Develop

Prerequisites: Node 20+, Rust (stable), Android SDK + NDK 27 (`ANDROID_HOME`, `ANDROID_NDK_HOME`),
`cargo install cargo-ndk`, `rustup target add aarch64-linux-android x86_64-linux-android`.
iOS needs macOS with Xcode and `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`.

```sh
npm install
npm run native:android        # build the Rust transport for Android (+ regenerate bindings)
npm run android               # expo run:android — dev build on a device/emulator
npm start                     # Metro for an installed dev build

# macOS only
npm run native:ios && npm run ios
```

Checks (run before every commit):

```sh
npm run check                 # tsc + eslint + jest + cargo test
```

Desktop interoperability (needs `../SovraHarness`): see [`interop/README.md`](interop/README.md).

Release builds go through EAS (`npx eas-cli@latest build`); the EAS build image must run
`npm run native:android` / `native:ios` first (the 300+ MB static libraries are not committed).

## Layout

```
src/app/            screens (Expo Router): pair, scan, remote, settings, deep link
src/components/     Sovra UI primitives and the remote views
src/remote/         protocol: wire types, strict ticket parser, client, chat flow (pure TS, tested)
src/state/          Zustand stores: remote session, preferences, secure storage
src/theme/          Sovra tokens ported from the desktop design system
modules/sovra-remote/  Rust → TurboModule (Iroh transport only; no protocol decisions)
interop/            Rust tests against the real desktop endpoint and runtime
docs/               architecture, security and theming notes
```

More: [architecture](docs/architecture.md) · [theming](docs/theming.md) · [agent rules](AGENTS.md).

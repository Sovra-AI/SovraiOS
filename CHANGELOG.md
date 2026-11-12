# Changelog

## [Unreleased]

### Added

- Expo SDK 58 / React Native 0.88 app (New Architecture, React Compiler, Expo Router typed routes).
- Pair with Sovra Harness by scanning its QR code, opening its `sovra://remote-control` link, or pasting it.
- Automatic reconnect to the paired computer on open, over Wi-Fi or mobile data (Iroh relay fallback).
- Remote screen: chat composer that types through Sovra's real chat box, Stop, a scaled mirror of
  the Sovra window, an accessible control list, scroll and key buttons.
- Rust turbo module `sovra-remote` (Iroh 1.4.1 QUIC, ALPN `sovra/remote-control/1`) built with
  uniffi-bindgen-react-native.
- Protocol client enforcing Hello sessions, exact sequences, revision-guarded mutations and
  never replaying uncertain input; Jest tests against the desktop's own fixtures.
- Interop tests against the desktop's real `RemoteMesh` endpoint and runtime (`interop/`).
- Sovra theme ported from the desktop design system, light and dark; app icons from the Sovra mark.

# sovra-remote

Rust TurboModule: the phone side of the Sovra Harness remote-control transport.
One Iroh endpoint with the phone's key; one JSON request/reply per QUIC stream.
All protocol decisions live in the app's `src/remote/` (TypeScript, tested).

```sh
npm run ubrn:android   # cargo ndk build + generate bindings (from this directory)
npm run ubrn:ios       # macOS only
```

Generated (do not edit): `src/`, `cpp/`, `android/` (except build outputs), `ios/`,
`SovraRemote.podspec`. Not committed: `android/src/main/jniLibs`, `*.xcframework`, `rust/target`.

Keep `iroh` pinned to the version in `SovraHarness/Cargo.toml`.

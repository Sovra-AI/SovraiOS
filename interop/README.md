# Desktop interop tests

Proves the phone transport (`modules/sovra-remote/rust`) speaks the same protocol as
the Sovra Harness desktop. Not part of CI because it needs a SovraHarness checkout
next to this repository (`../SovraHarness`) and its pinned toolchain.

```sh
cd interop
RUSTUP_TOOLCHAIN=1.99.1 SOVRA_DEV=1 cargo test -- --nocapture
```

| Test | What it proves |
| --- | --- |
| `interop.rs` | Authenticated Iroh handshake with the desktop's real `RemoteMesh` endpoint (ALPN `sovra/remote-control/1`); the desktop sees the phone's TLS key; a 200 KB reply crosses the stream window. |
| `runtime_e2e.rs` | Against the real desktop runtime (`sovra_runtime::start_with_services`): Hello before pairing → `not_paired`; Pair with the invitation → `paired`; a second phone with the consumed invitation is refused; Hello → `ready`; Inspect returns a revision; typed text reaches the desktop UI; a mutation without a revision → `stale_observation`; a replayed sequence → `stale_session`; the desktop closes an idle connection after 5 s and the phone reconnects with Hello and no new invitation; after Stop the phone cannot get `ready`. |

The request JSON in `runtime_e2e.rs` is byte-identical to what `src/remote/client.ts`
sends (asserted in `src/remote/__tests__/wire.test.ts` against the desktop fixtures).

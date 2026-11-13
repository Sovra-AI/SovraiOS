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

### Changed

- Simpler remote screen for everyone: four tabs — **Chat**, **Chats**, **Skills** and
  **Computer** (pages, picture or list of controls, keyboard keys) — instead of five, with
  plain-language labels, a welcome screen, an instant "sending" bubble, a "Sovra is
  thinking…" line, and good news that fades on its own.
- `/` skills on the phone: typing `/` lists Sovra's skills (read from the desktop's own `/`
  menu), choosing one shows it as a chip with a prompt for what it needs, and the Skills tab
  is the same list, searchable. Skills that open a page (e.g. `/models`) show it.
- Chats tab: search your chats, see every chat (not only the ones on screen on the
  computer), and **Show older chats**.
- Pairing asks for names only if you want to change them; Settings keeps keys and
  connection switches under **Advanced settings** and has a **Done** button.
- Use Sovra's chats from the phone: the Chat tab shows the conversation as native
  bubbles (needs the matching SovraHarness change), and the **Chats** tab lists and opens
  the desktop's chats or starts a new one.
- Sovra's replies render their Markdown on the phone: headings, bold/italic, lists,
  code and tables (a safe subset; links and HTML stay plain text).
- Fill in any box on the computer from the phone: tap a field on the Computer tab
  (a schedule, a group name, a search) and a typing bar types into it.
- The Computer tab has shortcuts to every page in Sovra's sidebar (Team, Artifacts,
  Schedules, Groups, Models, Settings…) and keeps its picture live.
- Chat tab shows the conversation from the computer: the transcript region of a desktop
  screenshot (fetched only while the tab is open, pinch to zoom on iOS), or labelled text
  inside the conversation when screenshots are unavailable.
- Sending a message from any Sovra screen first opens Chat on the computer.

### Fixed

- `/` skills did nothing from the phone: a lone `/table` only completed the name on the
  computer, and Sovra's "Usage: …" reply was invisible to the phone, which cleared the message.
- The Chats tab only listed the two or three chats on screen on the computer, and could
  not open the others.
- After visiting another page (Skills, Settings…) the Chat tab showed nothing; it now
  brings Sovra's chat back up.
- Text left in Sovra's chat box on the computer (e.g. from a skill) was sent along with
  the phone's message.
- The conversation jumped to the bottom on every refresh while scrolling back.

- A chat message sent while Sovra showed a form could be typed into the form's last box:
  only Sovra's real chat box (multiline, or a composer-like label) counts as the chat box.
- Long replies partly scrolled out of view on the computer were missing from the phone's Chat tab.
- The Screen mirror grew past the window on long pages (e.g. Settings); it now uses the
  screenshot's shape.
- Pairing a different computer while connected to one failed with "Remote control is
  paused": opening the link closed the shared connection mid-pairing.
- The Screen tab could show an old picture after Sovra on the computer had moved on.
- Re-pairing a phone the computer already knows left the computer's code open, pausing
  control (`busy`) until it expired. The phone now hands the code over after Hello so the
  desktop can close it (needs the matching SovraHarness change).
- Messages were typed into Sovra's "Search chats" box instead of the chat composer.
- The phone's Stop button could press "Stop phone control" (or other "Stop …" buttons)
  on the computer; it now matches only Sovra's real stop control.
- iOS builds: pin `libc` to 0.2.189 (0.2.190+ breaks netdev on iOS) and link
  `SystemConfiguration` through the `sovra-remote` config plugin.

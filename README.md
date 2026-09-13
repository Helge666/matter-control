# Matter Control

A Matter controller for Windows. It pairs Matter devices into a fabric of its own and controls them
from the PC — no manufacturer cloud, no hub.

## What it does

- **Pair** with an 11-digit code or a QR payload, also as a second admin alongside a manufacturer's
  app
- **Control** on/off, brightness, colour temperature and colour
- **Switch the operating mode**: static white, static colour, dynamic mood, microphone
- **Edit moods**: up to eight colours, sixteen movements, speed, direction, segmentation
- **Save moods by name**, with twenty built-in moods to start from
- **Microphone mode** with four display patterns — Transient, Wave, VU meter, Beam
- **Schedule** with fixed times per season, or following sunset and sunrise
- **Live in the notification area**, optionally starting at sign-in
- **English and German**, following the Windows display language

The operating modes, the mood editor and the microphone mode go through a manufacturer-specific
cluster that no standard Matter client knows. How it was decoded is written up in
[docs/findings.md](docs/findings.md).

Developed and tested with LEDVANCE SMART+ lamps (EAN 4099854511707). Their firmware and Matter
certificate come from Tuya, so other Tuya-based Matter lamps may speak the same mood format — that is
untested.

## Why not the Rust version

The predecessor ([tom-code/matc-ui](https://github.com/tom-code/matc-ui)) rebuilds the Matter stack
by hand in Rust. The protocol is incomplete there: no `SetRegulatoryConfig`, no device attestation,
an IPv4-only transport, mDNS without interface selection. This project uses
[matter.js](https://github.com/matter-js/matter.js) instead — a complete TypeScript implementation of
the specification.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 44 |
| Matter protocol | matter.js (`@matter/main`), in the main process |
| Frontend | Vue 3 + TypeScript |
| Styling | Tailwind CSS 4 |
| Build | electron-vite + electron-builder |

No sidecar process: matter.js runs directly in Electron's main process, and the renderer talks to it
only through the preload bridge (`contextIsolation`, no Node in the renderer).

## Development

```bash
npm install
npm run dev
```

If Electron is missing after `npm install` (`Error: Electron uninstall`), the binary was not
downloaded — fetch it once:

```bash
node node_modules/electron/install.js
```

The interface alone, with demo data in the browser (no Electron, no real fabric):

```bash
npm run dev:ui
```

Build the Windows installer and a portable ZIP:

```bash
npm run dist
```

Autostart deliberately only takes effect in the installed version — in development mode the Electron
binary itself would otherwise register as a login item.

### Texts and languages

All texts live in [src/shared/i18n](src/shared/i18n). English (`en.ts`) defines which texts exist;
every other language is typed against it, so a missing translation fails the type check. To add a
language, add a file next to `de.ts` and register it in `index.ts`.

## Tools

All tools share the data directory with the app, and with it a file lock — **the app has to be
closed**, or the tool cannot get at the fabric. Their output is in German for now.

```bash
npm run cli -- discover 10                    # find devices in pairing mode
npm run cli -- commission 1234-567-8901       # pair
npm run cli -- peers                          # devices in the fabric
npm run cli -- onoff peer1 toggle

node tools/mood.mjs peer1                     # read and decode the mood
node tools/mood.mjs peer1 --write --mode 2 --colors 0:100,240:100

node tools/vendor-probe.mjs                   # dump all clusters of a device
node tools/vendor-set.mjs peer1               # read the manufacturer cluster
node tools/vendor-set.mjs peer1 2 uint 258    # write a single attribute
node tools/watch-vendor.mjs                   # capture changes
node tools/level-probe.mjs                    # check brightness behaviour
```

`MATTER_LOG=debug` raises the log level, `MATTER_TRACE=1` shows stack traces.

The codec for the manufacturer cluster lives in `src/shared/mood.ts` and is used by the app **and**
the tools — Node reads the TypeScript file directly, so there is no second copy that could drift
apart.

## Adding a device that is already paired

Matter devices already connected to a manufacturer's app are part of that app's fabric. To add them
here as well takes multi-admin:

1. Open the device in the manufacturer's app and choose **"Add to another ecosystem"** or
   **"Share"**.
2. The app shows a **new** 11-digit code. The code from the box stops working after the first
   pairing.
3. Enter that code here — it is valid for **15 minutes and exactly once**.

## Moods

The mood editor saves moods by name into `moods.json` in the data directory. The file is meant to be
read and edited by hand:

- Entries marked `"factory": true` are locked — the app neither overwrites nor deletes them.
- The built-in moods ship with the app from `src/shared/presets.ts` and are mirrored into the file
  on every start, so corrections reach existing installations. Everything you save yourself is
  appended and left alone.
- When the running mood matches a saved one, the editor shows its name.

[docs/moods.json](docs/moods.json) is an example of the format.

## Schedule

Two modes:

- **Fixed times** — the year is split by two dates, and each half has its own on and off times.
  Windows across midnight are the normal case and work.
- **Follow the sun** — sunrise and sunset are **computed locally** from latitude and longitude,
  without internet, each with a minute offset.

Lamps are switched only at the edges of the window, plus once when the app starts. Switching by hand
in between is not overruled. At startup the app only ever switches on, never off.

No state is saved and restored: the lamps remember brightness and mood themselves.

## Data directory

`%APPDATA%\matter-control\matter\`

Holds the fabric's certificates, the device registry, device names, saved moods and settings. If the
folder is deleted, every paired device loses its connection to this controller.

The `controller` folder contains the fabric's private key. Keep it out of version control.

## Network

Matter uses mDNS (UDP 5353) and reaches devices on UDP 5540, preferably over IPv6. Typical
stumbling blocks on Windows:

- **Virtual adapters** (VPN, Tailscale, Hyper-V) can take over the multicast path, so that discovery
  requests leave through the wrong interface.
- **Firewall rules** that block incoming UDP 5353/5540 for Node or the app.

## License

[MIT](LICENSE)

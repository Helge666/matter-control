# What the lamps have told us so far

*As of 13 September 2026*

Two LEDVANCE SMART+ lamps, brought into a fabric of our own through multi-admin and controlled from a
PC. This document keeps apart what we *measured* on the device and what we only *believe* from the
specification — plus the manufacturer's own cluster, which we can now read, write and switch,
microphone mode included.

| | |
|---|---|
| **Devices** | LEDVANCE 4099854511707 · VID 0x1189 · PID 0x92F |
| **Stack** | matter.js 0.17.9 |
| **Raw evidence** | [capture-vendor-0x33.txt](capture-vendor-0x33.txt) |

**Contents**

1. [Measured](#1--measured)
2. [From the documentation, unconfirmed](#2--from-the-documentation-unconfirmed)
3. [The mood mode](#3--the-mood-mode)
4. [Open tests](#4--open-tests)
5. [Next steps](#5--next-steps)

**Confidence**

| Mark | Meaning |
|---|---|
| 🟢 | Observed on the device, reproducible — *measured*, *decoded*, *correction* |
| 🟡 | From the spec or a third-party source, not checked — *unconfirmed* |
| 🟠 | A guess that needs an experiment — *open*, *test*, *noted* |

---

## 1 — Measured

Everything here comes from protocol captures or direct queries to the lamps. Where a number is
given, it was read off, not estimated.

### A paired device needs a second commissioning window

🟢 **Measured**

Both lamps were already in the LEDVANCE fabric `D7F2642F346D46AD` as nodes `0x100000000` and
`0x100000001`. As long as no window is open, they only advertise `_matter._tcp` — the controller
sees them but cannot take them in.

Only "Add to another ecosystem" in the manufacturer's app makes `_matterc._udp` with `CM=2` appear
as well. The code is single-use; an attempt with the window closed ended in *"No commissionable
device was discovered"*, while the same code two and a half minutes later, with the window open,
succeeded at once.

### The discriminator changes with every window

🟢 **Measured**

The device does not have a fixed discriminator; every time a window opens, a new one is generated.
Observed on the same lamp: `D=712` at pairing, later `D=1421`. The 11-digit code carries only its
upper 4 bits — `2224-745-7508` resolves to nibble `9` and therefore matched the lamp with `D=2356`,
not the one with `D=1421`.

### The controller tries all open windows at once

🟢 **Measured**

When both lamps had a window open at the same time, PASE ran against both in parallel. The wrong
one failed cleanly at key confirmation, the right one won — without any intervention.

```
ParallelPaseDiscovery  Unexpected error from parallel commissioning attempt:
                       [unexpected-data] Received incorrect key confirmation
                       from the receiver. Commissioning failed.
...
[ok] commissioned in 11.4s
  peer3  node=0x2  vid=0x1189  pid=0x92f  D=2356  CM=2  Test Bulb
```

### The complete commissioning sequence, in 12.9 seconds

🟢 **Measured**

For comparison with the Rust version, in which several of these steps were commented out:

```
10.1  OperationalCredentials.DeviceAttestation   certificateChainRequest ×2,
                                              attestationRequest
11.1  OperationalCredentials.Certificates      csrRequest
                                              addTrustedRootCertificate  → Success
                                              addNoc  → statusCode 0, fabricIndex 2
15.1  AccessControl
18.1  Reconnect                                armFailSafe → CASE over fe80::…%22
20.1  GeneralCommissioning.Complete            → errorCode 0
98.1  OperationalCredentials.UpdateFabricLabel → Success
```

Worth noting: `adminVendorId` was `65521` (0xFFF1, the test vendor ID), and the lamp accepted it
without complaint.

### The lamp replaces short transition times with its own ramp

🟢 **Measured**

The costliest finding of the evening. According to the spec, `transitionTime` counts in tenths of a
second — the lamp does not honour that, and for small values runs a ramp of its own lasting several
seconds.

| Command | from → to | reported after 2.5 s | Result |
|---|---|---|---|
| `moveToLevelWithOnOff t=1` | 59 → 40 | 40, remaining 0 | reached |
| `moveToLevelWithOnOff t=1` | 40 → 230 | 77, remaining 1 | **still moving** |
| `moveToLevelWithOnOff t=0` | 77 → 90 | 90, remaining 0 | immediate |
| `moveToLevelWithOnOff t=0` | 15 → 250 | 250, remaining 0 | immediate |
| `moveToLevel t=0` | 90 → 200 | 200, remaining 0 | immediate |

The consequence for any user interface: whoever streams values must not let the device interpolate
on top. `transitionTime: 0`, and the smoothing happens in the slider.

### At about 77 commands per second the lamp gives up

🟢 **Measured**

A slider that sends on every movement and only waits for the previous answer produces ~60
commands/s — the lamp answers in ~15 ms. After 1191 commands within a few minutes, a lamp stopped
responding: first answers went missing, 14 seconds later the channel was closed.

```
03:27:37  Invoke »  moveToHueAndSaturation      (no response)
03:27:42  Invoke »  onOff.off                    (no response)
03:27:45  Invoke »  onOff.on                     (no response)
03:27:51  ClientNode controller.@1:1 is offline
          [closed] Channel is closed
```

With a throttle of ~8 commands/s per slider, this did not happen again.

### Electron cannot speak Matter without help

🟢 **Measured**

Electron ships BoringSSL instead of OpenSSL. Two gaps, both fatal for Matter, both queried directly:

```
createHash("SHA-256")   Digest method not supported
createHash("sha256")    OK
aes-128-ccm             false
available               aes-128-cbc, -cfb, -ctr, -ecb, -gcm, -ofb
```

The first kills the certificate authority at startup, the second every CASE session ("Unknown
cipher") — `aes-128-ccm` is Matter's message cipher. The fix was not patching but switching to
`StandardCrypto`, which matter.js brings along for browsers anyway.

### The lamps have two identities

🟢 **Measured**

`BasicInformation` reports vendor `0x1189` (LEDVANCE). The device certificate, however, carries
*Tuya Matter PAI* with vendor `0x125D`. LEDVANCE is selling Tuya hardware here — which explains
whose cluster turns up shortly.

### Nothing unusual on the network side

🟢 **Measured**

```
D8C80C3CFBAB.local   AAAA fe80::dac8:cff:fe3c:fbab
                     AAAA 2001:db8:…:dac8:cff:fe3c:fbab     (global prefix redacted)
                     AAAA fd00:b703:89f2::dac8:cff:fe3c:fbab
                     A    192.168.178.46            Port 5540
TXT                  SII=200  SAI=300  T=1
```

Both lamps provide three IPv6 addresses *and* one IPv4 — which is why the old Rust app, with its
IPv4-only socket, could see anything at all. In the end the controller connects over link-local
IPv6 with a zone index (`%22`).

### LevelControl and ColorControl limits

🟢 **Measured**

```
minLevel 1   maxLevel 254   onLevel null   remainingTime 0
options  { executeIfOff: true, coupleColorTempToLevel: false }
colorCapabilities { hueSaturation: true, enhancedHue: false,
                    colorLoop: false, xy: true, colorTemperature: true }
```

`colorLoop: false` is the line that matters: the mood mode does *not* run through the standard
colour loop of `ColorControl`. It has to come from somewhere else.

---

## 2 — From the documentation, unconfirmed

Things we relied on while building, but which only come from the specification, from matter.js
source code or from third-party sources. They may be true — we have not checked them.

### Matter mandates IPv6, IPv4 is optional

🟡 **Unconfirmed**

Stated in the spec. Both our lamps provide both, so we have never seen the "AAAA only" case.
Whether a device without an A record shows up in the household is therefore open — relevant should
a Thread device join later.

### Structure of the 11-digit pairing code

🟡 **Partly confirmed**

From the spec: digit 1 carries bits 11–10 of the discriminator, digits 2–6 carry bits 9–8 in their
upper two bits plus the lower 14 bits of the passcode, digits 7–10 the rest of the passcode, and
digit 11 a Verhoeff check digit.

We *verified* the discriminator part — the calculation gave nibble `9`, and exactly the lamp with
`D=2356` could be paired. We never computed the Verhoeff check digit; whether a typo would be caught
early is untested.

### How manufacturer-specific cluster IDs are formed

🟡 **Unconfirmed**

The rule `(VendorID << 16) | 0xFCxx` is spec. Our observation fits exactly — `0x125DFC01` splits
into vendor `0x125D` and cluster `0xFC01`, and `0x125D` is precisely the vendor from the
certificate. A single data point that supports the rule but does not prove it.

### Our attestation checks less than it should

🟡 **Unconfirmed**

During pairing, matter.js itself reports two skipped checks: no PAA trust store, and no signature
check of the Certification Declaration, because no `DclCertificateService` is registered. We have
not tested what happens when a device presents forged certificates — we only know that we would
not notice at the moment.

### The AES-CCM implementation in JS is unaudited

🟡 **Unconfirmed**

matter.js describes the code in its `aes` subdirectory as *unaudited* in its own comments and
recommends a native alternative where available. On Electron there is none. That it is slower than
the native backend is plausible, but not measured by us.

### Subscription intervals

🟡 **Unconfirmed**

The negotiated interval was `min: 0, max: 1m 5s`. That the lamp counts as offline when a report
fails to arrive within this window is something we have not provoked — the one disconnect we saw
came from overload, not from a timeout.

---

## 3 — The mood mode

No standard Matter cluster can express moving patterns. These lamps carry a manufacturer cluster
for that, whose format we inferred by observation and then verified by writing.

### Attribute 0x33 carries the complete mood

🟢 **Decoded**

Cluster `0x125DFC01`, attribute `0x33`, endpoint 1:

```
[0]     01            version, the same in every capture
[1]     ?             changes on save, with no visible effect
[2]     mode          1-based index into the app's mode list
[3]     speed %       what the app displays
[4]     speed %       what the lamp follows; the app keeps both equal
[5]     bit 7         splits the lamp into zones, where the mode leaves a choice
[5]     bit 4         direction: set = top to bottom, otherwise the reverse
[5]     rest          unexplained, passed through unchanged
[6][7]  00 00         always zero
[8]     brightness %  0–100, for the whole mood
[9…]    N × { H: uint16 BE 0–360, saturation: uint8 0–100 }
```

Observed lengths of 15, 18, 21, 24 and 30 bytes all fit `9 + 3·N` exactly. The header length has
been settled since the app produced exactly 15 bytes for two colour fields.

### Every named field was proven individually

🟢 **Measured**

| Field | Evidence |
|---|---|
| [2] mode | Changed only the mode to Rainbow — exactly one byte jumped from 02 to 0B |
| [3] speed | App showed 14 % → 0x0E; set to 50 % → 0x32 |
| [4] speed | Set [3] and [4] apart on purpose: the lamp follows [4], not [3] |
| [5] bit 7 | With "Jump": 0x60 lights as a whole, 0x80 and 0xE0 split into zones |
| [5] bit 4 | Both lamps stacked in opposite directions; bit set on the second → direction flipped |
| [8] brightness | The app's slider stood at 100 % → 0x64 |
| colours | Wrote red and blue → lamp jumps red/blue; 0000 and 00F0 in the blob |
| colour, 2nd byte | Hue 360° at 1 → pale pink, the same hue at 98 → saturated red |

In addition, attribute `0x02` mirrors header bytes [2] and [1] in reverse order — two separately
transmitted attributes carrying the same numbers.

### Writing works, with pitfalls

🟢 **Measured**

matter.js has no schema for a manufacturer cluster and therefore encodes writes through `TlvAny`.
That expects an *already parsed TLV element stream*, not raw bytes — a `Uint8Array` only fails in
the commit phase, with `Cannot read properties of undefined`.

```
TlvAny.decodeTlv(TlvByteString.encodeTlv(bytes))   ← produces the right shape
```

Second pitfall: a write with an unchanged value is dropped before it reaches the network. A
supposedly successful identity test therefore proves nothing.

Third pitfall, found later: after a write, matter.js keeps the *written* value as the attribute's
state. For this cluster that is the TLV element stream above, not the decoded value — reading the
mode attribute right after switching returns `[{ typeLength, value: 258 }]` instead of `258`, until
the lamp's next report replaces it. Reads therefore have to accept both shapes.

### The number of zones belongs to the mode, not to the data

🟢 **Measured**

The obvious guess would have been that the number of colours determines the zones. It does not: in
"PileUp" mode the lamp shows **19 zones**, regardless of whether it is given two or eight colours.
Observed on both lamps.

The 19 are not even, either: nine pairs of two adjacent zones in the same colour plus a single one
at the end — ten colour slots in all. With eight colours, the palette therefore wraps around.

### Bit 4 reverses the direction

🟢 **Measured**

For "PileUp", the manufacturer's app shows an additional "positive / negative" field. Because this
field only appears for certain modes, the bit was simply never set in any earlier capture — we could
not have noticed it.

Both lamps on "PileUp", running in opposite directions:

```
left lamp    top → bottom    01 02 06 0e 0e 10 00 00 30 …
right lamp   bottom → top    01 03 06 23 23 e0 00 00 64 …
```

We then set `0x10` on the right lamp — it flipped to top to bottom. This is not merely observed but
*reproduced*, and so the most reliable finding about this cluster.

### Bit 7 does not simply mean "segmented"

🟢 **Correction**

Comparing the lamps corrected an earlier reading along the way: the left lamp stacked across 19
zones although bit 7 was **zero**. Bit 7 alone does not switch segmentation, then.

Both observations agree once it is put this way: bit 7 is a switch that only modes with a choice in
the matter respect. "Jump" reacted to it; "PileUp" is spatial by nature and ignores it.

### The second colour byte is saturation, not brightness

🟢 **Correction**

A saved mood of two colours — hue 360° with the value 1, hue 233° with 100 — lit up blue, black and
a very light pink that appeared nowhere in the data. The same hue 360°, with only the value changed
to 98, gave saturated red.

```
H 360°  value   1   →  pale, light pink   (red, almost unsaturated)
H 360°  value  98   →  saturated red
```

Read as brightness, that makes no sense: 1 % would be nearly off. Read as **saturation**, it fits
exactly — red at 1 % saturation is white with a hint of red. The format stores hue and saturation
per colour; brightness applies once to the whole mood and sits in byte [8]. That is exactly what the
manufacturer's app offers, too: a colour wheel per colour, but only *one* brightness slider.

Two conclusions. First, **white is reachable in a mood**, at saturation 0 — no hue in the world
produces it, this value does. Second, the lamp does not interpolate between the colours: the pink was
the first colour itself, and the black belonged to the "Flutter" mode, which has dark phases, not to
an entry in the colour list.

### The mode list

🟢 **Measured**

1-based. The app shows two different modes under the same name — a coincidence that at first led
us to believe we had a contradiction.

As the German manufacturer's app lists them:

```
 1 Fließend (A)   2 Springen      3 Fließend (B)   4 Blinken
 5 Meteor         6 Stapeln       7 Fallen         8 Folgen
 9 Flattern      10 Durchfluss   11 Regenbogen    12 Blitz
13 Schwingen     14 Shuttle      15 Zufällig      16 Wechseln
```

The same list from the app set to English, in the same order:

```
 1 Gradient       2 Jump          3 Gradient       4 Blink
 5 Meteor         6 PileUp        7 Fall           8 Follow
 9 Flutter       10 Flow         11 Rainbow       12 Flash
13 Rebound       14 Shuttle      15 Random        16 Switch
```

There, too, 1 and 3 share a name: "Gradient". The duplicate is therefore **not a translation
error** in the German app, as first assumed, but already present in the source. Which of the two
modes behaves how can only be settled by looking at the lamp.

### Attribute 0x02 switches the operating mode

🟢 **Decoded**

A capture of switching to static white and back showed: the **lowest byte** of `0x02` says what the
lamp is doing right now. Write it, and the lamp switches — without the manufacturer's app.

| Value | Operating mode | controlled by |
|---|---|---|
| `0x00` | static white | colour temperature |
| `0x01` | static colour | hue and saturation |
| `0x02` | dynamic mood | attribute 0x33 |
| `0x03` | microphone | attribute 0x34 |

All four tried on the device. This is Tuya's classic split into white, colour, scene and music —
confirmed here by writing for the first time, rather than taken from a third-party source.

### The microphone mode was just one value away

🟢 **Measured**

It was on the list as "look into it some day". In fact it was enough to set `0x02` to `0x03`: the
lamp listens and shows the level, like the meters on a mixing desk.

The mode value alone is not enough, though. A lamp that had never run the mode dutifully reported
`0x03` back and still did nothing — until the **arm byte** in `0x34` was set.

Attribute `0x34` — microphone settings:

```
[1]    armed      0 = off, 1 = active   ← needed in addition to attr 0x02
[2]    display    0x00 Transient — full swing, no fall-back
                  0x01 Wave — colour gradient from bottom to top
                  0x02 VU meter — level with a slow fall-back
                  0x03 Beam — from the centre outwards
[3]    partner    belongs to [2] and must be written with it:
                  [2]=0x00 → [3]=0x03,  otherwise → [3]=0x00
[4][5] ?          85/50 on one lamp, 100/100 on the other —
                  not the sensitivity, see below
```

Leaving byte [3] alone is not enough: write only [2], and the display freezes on its last frame —
black if the lamp happened to be quiet, mid-fall-back if not. The two bytes have to be set together.

This is not an isolated case with this cluster. The microphone mode, too, needs two attributes at
once — the mode choice in `0x02` and arming in `0x34`. Anyone writing here should look for a
partner byte first.

### The remote control told us what to look for

🟢 **Measured**

The lamp comes with a generic 44-key infrared remote. It has four music keys — ♪1 to ♪4. Up to then
we had found two display patterns and stopped there.

The missing two had simply never been tried: `0x01` and `0x03`. Both exist. And `0x03` radiates
from the centre outwards — exactly the `←|→` key on the same remote.

The list is complete, and the device says so itself:

```
written    01 01 04 00 55 32 01 …
reported   01 01 00 03 55 32 01 …
```

Given a fifth value, the lamp corrects itself back to the first — and restores the right pairing of
[2] and [3] while it is at it. So it knows the valid combinations, but only checks byte [2]: an
invalid [3] is accepted and freezes the display.

The remote also shows six direction keys, including outside-in and the reverse. Our byte [5] has only
one direction bit so far — the remaining bits might carry exactly these variants.

### The microphone sensitivity lives somewhere else

🟠 **Noted**

The manufacturer's app has a slider for it. Bytes [4] and [5] of `0x34` were the obvious candidates,
because the two lamps differed there.

A clap test disproves that: byte [4] at 10 against 100, and byte [5] at 50 against 100 — both lamps
react identically. The sensitivity lies elsewhere. Remaining candidates in the cluster are `0x2e`
(190), `0x2f` and `0x35` (both 19), and `0x07` (0).

The remote offers another lead: on these devices, the brightness keys usually set the sensitivity in
music mode. Then it would not be in `0x34` at all, but in the brightness field — in `0x3D` or in the
standard `LevelControl`.

The approach is the usual one: move the slider on the phone, compare captures. Until then, the value
stays untouched.

### Accepted is not executed

🟢 **Measured**

The write to the quiet lamp reported `success: 1 failure: 0`, and the attribute read back correctly.
Nothing happened all the same.

The same pattern as with the transition time: these devices acknowledge cleanly and then decide for
themselves whether to follow. A successful write is therefore no proof — only the lamp is.

### Attribute 0x3D is the white state

🟢 **Decoded**

On switching to white, it shrank from 12 to 9 bytes. A subsequent change of colour temperature moved
exactly two bytes:

```
00 00 00 13 00 03 52 00 aa    colour temperature 299 mireds (3344 K)
00 00 00 13 00 03 52 03 e8    colour temperature 154 mireds (6494 K)
                  ▲       ▲
                  850     170 → 1000
```

`0x0352` = 850, and `currentLevel` stood at 216 of 254 — that is 85 %. Both values run on a
**0–1000 scale**. In white mode, then, 0x3D carries brightness and colour temperature as 16 bits
each.

### A mood survives switching modes

🟢 **Measured**

`0x33` stayed unchanged when switching to white. The mood is not deleted, just not played.

In practice, a mood can be prepared while the lamp shines white and started later with a single
write to `0x02`.

### What is still missing

🟠 **Open**

All three previously unexplained attributes are assigned. Two fields remain without an observable
effect: header byte **[1]** in `0x33`, which changes on save, and the remaining bits of **[5]** next
to segmentation and direction.

Of `0x34`, only the microphone sensitivity is still open; the display patterns are solved. And
command `8`, the only one the cluster accepts, has had no occasion to appear so far — everything
evidently runs through attributes.

---

## 4 — Open tests

The tests on mode, speed, colours, segmentation and switching between white and a mood are done and
worked in above. What remains concerns the unexplained fields.

### Header byte [1] on save

🟠 **Test**

Save the same mood several times and watch whether [1] counts up. Seen so far: 0 and 1 for two newly
created moods, 3 after two edits, large numbers for presets.

### Lower bits of [5]

🟠 **Test**

With bit 7 set, vary the lower bits and look for differences in the pattern. A direction or a group
width would be conceivable — the six direction keys on the remote and the 19 zones observed in pairs
suggest something of the kind exists.

### Microphone sensitivity

🟠 **Test**

Move the sensitivity slider in the manufacturer's app while capturing, and compare which attribute
changes.

```
node tools/watch-vendor.mjs      (close the app first — shared file lock)
```

### Command 8

🟠 **Test**

Watch whether the manufacturer's app ever sends command `8`, for instance when saving a mood or
starting a scene.

---

## 5 — Next steps

1. **Attribute tree, raw commands, ACL editor** — the three diagnostic tools from the old Rust app.
   They would take over the work that has so far been done with purpose-built scripts.
2. **Close the protocol gaps** from section 4, starting with the microphone sensitivity, which the
   app cannot offer yet.

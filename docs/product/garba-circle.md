# Garba Circle

Garba Circle lets a group listen to the same YouTube recording at the same moment, each on their own phone and earbuds, with no PlayGarba backend. One person starts a circle and shares a link or QR code. Everyone who opens it hears the same song at the same position, and the circle keeps going through a shared song order so it stays together across tracks.

## Using it

- **Start:** tap the Circle button (ring of dots) in the topbar while a song is selected. The circle starts at your current position in that song, so you keep listening without a jump. The dialog shows a QR code, the link, Copy link and, where the browser supports it, Share.
- **Join:** open the link. The player shows the circle's current song and a **Join circle** button. Browsers block autoplay without a tap, so that tap starts playback.
- **Pause:** allowed. Press Play again to jump back to where the circle is now.
- **Next/Previous:** the circle moves together, so these explain that instead of skipping. Choosing another song, genre, 24/7 Live Radio or Nonstop leaves the circle.
- **Leave:** use **Leave circle** in the dialog. Playback continues outside the circle.

## How sync works

Everything a phone needs is in the link code: `1.<seed>.<start>.<fingerprint>.<check>.<first song id>` (`assets/runtime/garba-circle.js`).

1. **Shared schedule.** Each phone takes the songs that have a playable YouTube route (the same rule as 24/7 Live Radio) and a real catalogue duration over 10 seconds. It sorts them by id, shuffles them with the circle's seed and puts the host's song first. Songs without a verified duration are excluded rather than given a default, because a guessed length would move every later boundary.
2. **Fingerprint.** A hash of song ids, durations, video ids and chapter starts. A phone on a different catalogue version gets a different fingerprint and is told to reload, instead of joining a circle that plays something else. The check field separates a truncated or mistyped link from a real catalogue difference.
3. **Server-aligned clock.** Phone clocks are often seconds apart, so the circle does not trust them. Each phone sends a few uncached `HEAD` requests for `robots.txt` and reads the HTTP `Date` header. The header has one-second resolution, but it is exact. If the server stamped second `S` between local send time `s` and receive time `r`, the clock offset lies in `(S − r, S + 1000 − s)`. The phone intersects these intervals, times later probes so a server second boundary falls inside the remaining window, and stops after about 10 probes (under about 4 seconds). The midpoint is the offset and the half-width is the reported accuracy (for example "Clock matched to ±12 ms"). If the answers contradict each other, the phone retries once and then says the clock could not be checked.
4. **Position.** With the start instant from the link and the aligned clock, every phone computes the same song and offset. The schedule loops.
5. **Staying aligned.** The YouTube IFrame player stays the playback engine. About every 2 seconds, the phone reads the player's position over about 450 ms and compares the freshest reading with where everyone should be. Readings taken while the player is stalled are skipped. Corrections come from `assets/runtime/sync-correction.js`, which Live Radio shares:
   - **Seeks and loads take time to land.** A seek or a load resumes a few hundred milliseconds to a few seconds after it is requested, so it lands behind the target. Each phone learns its own load and seek delays from the first clean reading after each one, and aims ahead by that much. Readings more than 1.5 s off right after a seek are treated as stalls and not learned from.
   - **Small gaps are closed without a skip.** When the player offers playback rates, a gap under 0.6 s is closed by playing at 1.25× (behind) or 0.75× (ahead) for as long as it takes, at most 3 seconds. Larger gaps are seeks.
   - **Precision.** After a load, a resume or a catch-up seek, the phone keeps refining until it is within 30 ms. In steady state it corrects gaps over 60 ms when rate control is available, and over 0.35 s otherwise. If seeks keep repeating, that threshold widens so a struggling connection is not seeked constantly.
   - **Re-checks.** The phone re-checks the clock and realigns when the page becomes visible again or the network comes back.
6. **Song boundaries.** The YouTube runtime advances just before a song ends. In a circle, the advance waits for the circle's own boundary, then loads the next scheduled song at the circle's position.
7. **Recordings YouTube refuses.** Some videos cannot be embedded or have been removed. Every phone gets the same refusal, so each fills that song's slot the same way: it plays the following songs from the slot's start, then returns to the normal order when the slot ends. Phones stay together without talking to each other, including phones that join during that slot.

## Measured accuracy

Measured on one Mac (Chromium via Playwright, real YouTube, local server), with three pages in separate browser contexts, sampled once a second for 60 seconds across a song boundary, over three runs:

- Within a song, the worst gap between any two of the three phones had a median of 30–42 ms (maximum 53 ms).
- At a song boundary, one sample shows a spike of 0.2–1 s while each phone loads the next video. The gap is back under about 100 ms within a second, and at 20–40 ms within about 5 seconds.
- A phone pushed 2 seconds behind (as after an ad or a stall) was back within 30 ms of the others in 1–2 seconds.
- Against `https://playgarba.com/robots.txt`, the measured clock offset agreed with NTP (`sntp time.apple.com`) within the reported uncertainty (±23–37 ms) in all 11 runs.

These are best-case numbers. Real phones on mobile networks will be less precise.

## Limits

- **Ads and buffering.** YouTube can show ads or pause to buffer. That phone falls behind and catches up with a seek once playback resumes. Ads are left untouched.
- **Background throttling.** Phones may throttle or pause a background tab. The circle realigns when the page is visible again, but it cannot keep a throttled phone in sync while it is hidden.
- **Output latency.** The circle aligns what the YouTube player reports. Bluetooth earbuds add their own delay (often 100–300 ms), which differs between devices and cannot be measured from the page.
- **Clock accuracy.** Sync depends on each phone's round trip to the site. A slow or jittery connection gives a wider clock window, and the dialog shows the accuracy it reached.
- **Catalogue versions.** Everyone must be on the same catalogue version. A mismatch is detected and explained, not silently joined.
- **Songs.** Only YouTube recordings with a verified duration can be played in a circle. A song without one cannot start a circle. While a refused recording's slot is being filled, the following songs play a second time when their own slots come up.

## 24/7 Live Radio uses the same sync

Live Radio is a broadcast computed from the time, so it only matches across devices if the devices agree on the time. It now uses the same pieces as a circle (`assets/runtime/live-sync.js`):

- When Live Radio is turned on, playback starts at once on the phone's own clock, and the server-aligned clock is measured in the background. The next alignment moves the phone onto the broadcast. A measured clock is reused for ten minutes.
- The broadcast position keeps milliseconds (`createLiveTimeline` in `assets/runtime/live-station.js`). Which song plays, and its whole-second position, are unchanged.
- Each song opens at its exact broadcast position, aimed ahead by this phone's learned load delay. The same correction as a circle then keeps it on the broadcast: learned seek delays for large gaps, and brief 1.25×/0.75× playback for small ones.
- At a song boundary the phone goes to wherever the broadcast is now, instead of starting the next song from 0. If a recording ends before its broadcast slot, the phone waits for the slot to end.
- Next and Previous do not skip the broadcast. They explain that Live Radio plays the same moment for everyone.

## Privacy

There is no backend and no telemetry. Nobody is counted or listed. The link carries only the seed, the start time, the first song and the fingerprint. The clock probes are ordinary `HEAD` requests to the same site that served the page.

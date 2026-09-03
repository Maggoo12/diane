# Roadmap

## Phase 0 — Decide & scaffold (first build session)

- [x] **Decide: PWA prototype vs. native from the start.** → **PWA first.**
  Installable Android PWA, plain HTML/CSS/JS, no build step, deploys like
  `todays-tasks`. Rationale: the hardest open risk is retention (does the
  spoken debrief pull you back?), and a PWA can prove that loop in days on
  skills Magnus already has. Revisit native once the loop is validated and
  if icon-tap capture friction turns out to be what stops daily use.
- [x] Pick the transcription approach for v1. → Browser **Web Speech API**
  (live mic → text) behind a single seam, `js/transcribe.js`. Audio is always
  recorded too (`MediaRecorder` → IndexedDB) so an entry still saves offline
  with `transcriptStatus: 'pending'`. Swap in a Whisper-class API later by
  writing another module with the same `createTranscriber()` shape.
- [x] Scaffold the project with the chosen stack. → done, see repo root.
      Working end to end: text capture → IndexedDB → day-grouped timeline →
      search. Voice capture wired (untestable without a device mic). Goals +
      weekly debrief are stubbed.
- [x] `.gitignore` added.
- [ ] `git init`, first commit.
- [ ] Create the GitHub repo (`Maggoo12/…`), push.
- [ ] Deploy target set up (GitHub Pages, `/` of `main`).

## Phase 1 — v1: prove the loop

Goal: Magnus uses it daily for a month (checkpoint ~2026-10-08) before anything
in Phase 2.

- [x] **Capture — text.** Type an entry; saved with date + time. Enter to save
      on desktop / Ctrl-Enter everywhere / Save button; newline on touch.
- [~] **Capture — voice.** Hold-to-record OR tap-to-toggle → transcribe → same
      entry store. Haptic on save. Wired in `js/capture.js`; live-tested for
      text, voice pending a device with a mic. Offline audio queue not yet
      built (entry saves with `transcriptStatus: 'pending'` but nothing retries).
- [x] **Timeline.** Reverse-chronological list, grouped by day. Per-entry
      delete (× with a confirm prompt).
- [x] **Search.** Plain substring search across entries (debounced).
- [~] **Transcription behind an interface.** `js/transcribe.js` seam done (Web
      Speech API). Whisper-class swap-in still to come.
- [ ] **Daily reminder.** Local notification at a user-set time: "add today's
      entries."
- [x] **Goals input.** `js/goals.js` — add / tick / delete, scoped to the
      current week (`db.weekOf`). Lives in the Week view.
- [~] **Weekly spoken debrief.** Pipeline built end to end:
  - [x] LLM synthesis — `js/debrief.js`, calls Claude (Sonnet 5 default) with
        the user's own API key stored on-device; plain non-AI fallback when no
        key. Request shape verified; real output pending Magnus's key.
  - [x] TTS playback — `js/speak.js`, browser `speechSynthesis`, voice picker +
        speed. Real audio pending a device test.
  - [x] Synthetic corpus — `js/seed.js`, ~3 weeks of entries + 3 weeks of
        goals with deliberate threads (unbooked dermatologist, presentation
        arc, patchy running habit). "Load sample month" in Settings.
  - [ ] End-of-week notification: "your weekly summary is ready."
  - [ ] Tone picker (voice done; "warm / dry / just-the-facts" tone not yet).
  - [ ] Move the API call behind a serverless proxy before other users.
- [x] **"How's my week so far?" — on-demand check-in.** Button in the Week
      view; `mode: 'midweek'` swaps in a shorter, nudge-framed prompt. Voice
      command ("hey Diane, how's my week?") still later.
- [ ] **Backup / import / export.** Because it's local-first, an uninstall,
      cleared browser data, or a new phone wipes everything — a backup path is
      not optional.
  - [ ] **Export** the whole journal (entries + goals + audio) to one file in
        an open format — JSON manifest plus the audio blobs (a `.zip`, or a
        single JSON with base64 audio for simplicity first).
  - [ ] **Import** that file back on a fresh install: merge or replace, with a
        confirm step before it touches existing data.
  - [ ] Both show a **progress bar** (audio blobs make this slow enough to
        need one) and a clear **"done" confirmation** with a count of what
        moved.
  - [ ] Later: optional auto-backup to a user-chosen destination (their own
        cloud drive / file share) on a schedule — never a Diane-run server.
- [ ] **Privacy basics.** Encrypted at rest; one-tap delete-all. Fuller
      provider/data story in **Privacy & AI providers** below.

## Phase 2 — after it's a habit

- [ ] Apple Health / Health Connect read (opt-in), correlated with entries.
- [ ] Simple charts: a metric (sleep, resting HR, …) against logged events.
- [ ] Multiple notebooks.
- [ ] Voice routing: "add to work notebook…" parsed from the spoken entry.
- [ ] Structured goal tracking with history.
- [ ] Evaluate shared / team notebooks.

## Not now

Social feed. Coach/therapist marketplace. Desktop app. Web-only marketing site
(until there's something to market).

## Privacy & AI providers — the trust layer

Diane's data is local-first: capture, timeline, search, and storage live on the
device and never touch a server. The **only** time personal content leaves the
phone is the AI debrief pipeline — LLM synthesis and text-to-speech. That
pipeline gets its own design and its own plain-language disclosure.

### Principles

- **AI is optional.** Diane is a complete local journal with the debrief off.
  Nothing about capture or review depends on a server.
- **Name the third parties.** Wherever an entry or a summary is sent, the app
  states which company, which model, and what they do with it (retention
  window, training use). No vague "powered by AI".
- **The user picks who to trust.** Provider choice is a setting, not a
  hard-coded vendor.
- **Least raw data possible.** The LLM step sees entries; the TTS step only
  sees the finished summary. Prefer sending the summary, not raw entries,
  wherever a feature allows.

### Provider tiers (design target)

| Tier | LLM synthesis | TTS | Data exposure |
| --- | --- | --- | --- |
| **Default (managed)** | Our backend calls one vendor (leaning Claude). Pass-through only — entries sent for synthesis, not logged, not stored; vendor API terms forbid training. | Good cloud voice (ElevenLabs / OpenAI / Cartesia — undecided); same no-retention stance; receives only the summary text. | Entries briefly transit our server + the LLM vendor. Summary transits the TTS vendor. Disclosed in full. |
| **Bring your own key** | User's own Anthropic / OpenAI / OpenRouter / Groq key, stored on-device. A Claude or OpenAI subscriber can point at the newest models on their own account. | Same idea for TTS providers that sell keys. | Data goes to the user's own account under that vendor's terms. We never see the key or the content. |
| **Fully local (advanced)** | A downloadable local model (e.g. a 3–4B GGUF from Hugging Face) run on-device or on a paired machine. Slower, lower quality, opt-in. | On-device / OS TTS (Android TextToSpeech, browser SpeechSynthesis). Robotic but private and free. | Nothing leaves the device. |

### Research to do (before building the managed tier)

- Anthropic + OpenAI API data-retention and training terms, in writing — exact
  retention window, zero-retention options, abuse-monitoring caveats.
- Same for the TTS shortlist (ElevenLabs, OpenAI, Cartesia): do they retain
  submitted text or synthesized audio, for how long, do they train on it.
- Whether a thin proxy can forward LLM/TTS calls without ever writing entry
  content to a log or disk.
- On-device inference on a mid-range Android phone: model size, load time,
  tokens/sec, battery. WebLLM/MLC in a PWA vs. a native module.
- Local-TTS quality bar — is any on-device voice pleasant enough that the
  "pick a nice voice" value still holds for the private tier.

### Open provider decisions

- Default LLM vendor + model for the managed tier (leaning Claude).
- Default TTS vendor.
- Which bring-your-own-key providers to support at launch.
- Whether "fully local" is a v1-debrief option or a later milestone
  (currently: later).

## Open decisions

- Real product name.
- AI / LLM / TTS provider architecture — see **Privacy & AI providers** above.
- iOS timing — Android is first; iOS is a later port or a parallel build once the
  loop is proven.

## Unit economics (from the brief)

Blended cost per active user ≈ **$1–5 / month** (transcription + weekly LLM +
TTS + infra). Price must clear that with margin. Free tier caps transcription
minutes; the debrief is paid-only.

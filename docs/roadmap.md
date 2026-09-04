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
      delete and **edit** (✎ swaps the text for a textarea, Save/Cancel —
      works on voice entries too, e.g. to fix a transcription).
- [x] **Search.** Plain substring search across entries (debounced).
- [x] **Transcription behind an interface.** `js/transcribe.js` is
      `(Blob) => Promise<string>`, POSTing the recorded audio to **Groq's
      Whisper** endpoint (`whisper-large-v3-turbo`) with the user's own
      on-device key. Web Speech is abandoned (network errors, no offline).
      Voice entry saves immediately as "pending", transcribes in the
      background, fills the text in. A ↻ button on pending entries retries.
      **Confirmed on device** — fast, handles mixed English/Danish. Still to
      do: automatic retry of pending entries when back online (currently
      manual via ↻).
- [~] **Reminders — daily nudge + weekly debrief.** `js/reminders.js` holds
      the schedule (user-set time; daily off by default) and the "is one due"
      logic; `js/reminderbar.js` is the **in-app bar** shown when a reminder
      is due and the app is open — postpone/skip actions inline (daily:
      Snooze 1h / Dismiss; weekly: 1h / 2h / Tonight / Skip this week).
  - **What actually works:** the in-app bar, when you open or return to the
    app. This is the reliable path and it works in every browser.
  - **What doesn't:** a real system notification while the app is closed.
    Confirmed on Magnus's device (Brave/Android): Notification Triggers isn't
    implemented, `periodicSync` won't fire, and Brave doesn't render
    notification action buttons even when it does show a notification. A
    service-worker notification is also dropped by the browser while its own
    page is focused — which is why the earlier "catch-up" marked reminders
    fired but showed nothing.
  - **Decision point:** for real closed-app reminders it's (a) a tiny push
    backend (Web Push / FCM sends at the scheduled time), or (b) go native.
    Strong input to the Phase 0 native question. `sw.js` keeps a best-effort
    `periodicsync`/trigger path for Chrome users; it's a bonus, not the plan.
  - Diagnostics kept in Settings: "Send test notification", "Fire reminder
    now", "Diagnose" (prints every gate + a would-fire verdict).
- [x] **Goals input.** `js/goals.js` — add / tick / delete, scoped to the
      current week (`db.weekOf`). Lives in the Week view.
  - [x] **Past-weeks view.** `js/goalhistory.js` — a collapsed "Past weeks'
        goals" card, grouped by week (newest first) with a done-count summary;
        same tick/delete as the current week.
  - [x] **Next-weeks view.** A matching collapsed "Next week's goals" card
        (`db.weekAfter`) — add/tick/delete like the current week, and where
        accepted debrief suggestions land and stay visible instead of
        disappearing until the week rolls over.
  - [x] **AI-suggested goals.** Two mechanisms, deliberately split:
    - **Explicit trigger** (`js/goaltrigger.js`) — "add a goal to X" / "remind
      me to X" / "new goal: X". Plain phrase match, no LLM, so it never adds
      latency to capture; creates the goal immediately in the current week,
      entry still saves normally. Wired into text save, voice transcription,
      and the timeline retry.
    - **Implicit intentions** — folded into the **weekly debrief** rather than
      a separate scan (same Claude call, no extra cost/latency): it also
      returns 0-4 candidate goals drawn from the week's entries, shown as
      editable accept/dismiss rows under the debrief. Accepting adds the goal
      to the week *after* the one reviewed. Not offered on the midweek
      check-in — that stays progress-only. Suggestions are phrased as
      timeless actions (never "this week"/"today") and must not duplicate a
      goal already set for the reviewed week. New goals are capitalized
      automatically, from any source.
- [x] **Weekly spoken debrief.** Pipeline built end to end and confirmed on
      device — real Claude output, real TTS audio, 4 tones.
  - [x] LLM synthesis — `js/debrief.js`, Claude (Sonnet 5 default) with the
        user's own on-device API key; plain non-AI fallback with no key.
  - [x] TTS playback — `js/speak.js`, browser `speechSynthesis`, voice picker +
        speed.
  - [x] Synthetic corpus — `js/seed.js`, ~3 weeks of entries + 3 weeks of
        goals with deliberate threads (unbooked dermatologist, presentation
        arc, patchy running habit). "Load sample month" in Settings.
  - [~] **End-of-week nudge.** Default **Sunday 19:00**, user-settable. Shows
        as the in-app reminder bar (1h / 2h / Tonight / Skip this week; tap to
        open the Week view). See the Reminders item above for the closed-app
        limitation.
        - "Postpone to an exact chosen time" (vs. the preset buttons) still
          to do.
  - [x] **Tone picker.** Settings → Debrief tone: Warm (default) / Dry /
        Direct / Coach. `debrief.js` composes a tone-neutral base + the chosen
        tone into the system prompt; applies to the weekly debrief and the
        mid-week check-in.
  - [ ] **Language.** Capture already handles mixed English/Danish (Whisper
        auto-detects). The debrief and TTS should follow suit — summarise in
        the user's dominant language (or a chosen one) and pick a matching
        voice.
  - [ ] Move the API call behind a serverless proxy before other users.
- [x] **"How's my week so far?" — on-demand check-in.** Button in the Week
      view; `mode: 'midweek'` swaps in a shorter, nudge-framed prompt. Voice
      command ("hey Diane, how's my week?") still later.
- [x] **Backup / import / export.** `js/backup.js` — export the whole journal
      (entries + goals + audio as base64) to one `diane-backup-YYYY-MM-DD.json`;
      import replaces the local DB after a confirm. Progress bar + a count
      confirmation on both. Round-trip verified (audio byte-for-byte).
  - [ ] **Merge** import mode (currently replace-only).
  - [ ] Later: optional auto-backup to a user-chosen destination (their own
        cloud drive / file share) on a schedule — never a Diane-run server.
  - [ ] Note: `<a download>` works in a browser tab; confirm it also works
        from the installed PWA on Android (Web Share as fallback if not).
- [x] **Settings & UI.** Settings live in a global ⚙ overlay panel (was
      buried in the Week view). Panel is staged — changes apply only on "Save
      settings", closing with unsaved changes prompts to discard. **First day
      of week** setting (Monday default; drives `db.weekOf`).
  - [ ] Full UI localization (strings + a locale switcher) — later, on demand.
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

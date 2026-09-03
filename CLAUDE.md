# CLAUDE.md — Diane (working name)

Orientation for any Claude session picking up this project. Read
`docs/product-brief.md` for the full rationale.

## What this is

A voice-first journaling app. Two core moments:

1. **Capture** — press and hold, speak (or type), release. Filed chronologically
   with date + time. Must feel as fast as an old dictaphone: talking within ~1s
   of the press, works offline, haptic confirms the save.
2. **Debrief** — once a week an AI voice (user picks voice + tone) narrates how
   the week went: goal progress, memorable entries, patterns. This is the
   retention hook and the main differentiator — no competitor ships a *spoken*
   weekly recap.

Later: correlate entries with wearable/health data; multiple notebooks addressed
by voice ("add to work notebook…").

## Status — full v1 loop built, pending real-key + on-device testing

- Product brief written: `docs/product-brief.md` (+ `.html` for a formatted read)
- Market scanned (~15 apps). Closest competitor: **Rosebud** (text weekly
  reports, ~$10–13/mo). **Apple Journal + Health** is the free/pre-installed
  threat. Nobody combines fast capture + spoken debrief + health + multi-notebook.
- **Two views** (nav at top): **Journal** (capture + timeline) and **Week**
  (goals + spoken debrief + settings).
- **Working, browser-tested:** text capture, day-grouped searchable timeline,
  per-entry delete, goals CRUD (current-week scoped, `db.weekOf`), the debrief
  pipeline end to end — `js/debrief.js` (Claude via the user's own API key,
  Sonnet 5 default, on-device localStorage; plain fallback with no key) →
  `js/speak.js` (browser `speechSynthesis`, voice picker). "How's my week so
  far?" midweek mode + "Full weekly debrief". `js/seed.js` loads ~3 weeks of
  synthetic entries + goals ("Load sample month" in Settings).
- **Transcription:** Web Speech API abandoned (fails `network` on Magnus's
  network, no offline). `js/transcribe.js` now POSTs the recorded blob to
  **Groq Whisper** (`whisper-large-v3-turbo`) with the user's on-device key.
  Voice entry saves as "pending", transcribes in the background, ↻ on the
  entry retries. Needs Magnus's free Groq key for a real run.
- **Not yet verified with real keys:** the Claude debrief call worked once
  (Magnus pasted a great weekly output); Groq transcription and real TTS audio
  still pending his keys / a device test.
- **Not built:** daily reminder, end-of-week notification, tone picker,
  offline transcription queue, full export, the serverless proxy for the API
  key (fine while it's just Magnus on his own device).
- API key handling: entered in the app's Settings → `localStorage` on that
  device only; `config.local.js` is gitignored for an optional desktop file.
- Service worker is **network-first** (`sw.js`) so edits show on a normal
  refresh; it only falls back to cache when offline.
- Local dev: `powershell -ExecutionPolicy Bypass -File serve.ps1` → localhost:8124.
- Not yet done: `git init` / first commit / GitHub repo / GitHub Pages deploy.

## Decisions made

- **Platform: Android first.** Android allows the quick-capture UX without
  fighting the OS; the user is on Android and can dogfood daily.
- **Monetization: freemium subscription.** Free = capture + timeline. Paid
  (~$6–9/mo) = weekly spoken debrief, health correlation, multi-notebook.
  Not ad-supported.
- **Transcription engine must be swappable.** Start with OS speech-to-text;
  move to a Whisper-class API (~$0.006/min) for quality later. → v1 seam is
  `js/transcribe.js` (`createTranscriber()`), currently the Web Speech API.
- **PWA first, not native.** Installable Android PWA, plain HTML/CSS/JS, no
  build step, deploys like `todays-tasks`. Prove the retention loop before
  spending the learning-curve budget on native capture polish. Go native once
  validated, and only if icon-tap friction is what stops daily use.

## Decisions still open

- Name — "Diane" (Agent Cooper's recorder) is a placeholder.
- AI / LLM / TTS provider architecture for the debrief. Direction set: a
  tiered model (managed default → bring-your-own-key → fully local), "AI is
  optional", name every third party. See `docs/roadmap.md` → "Privacy & AI
  providers". Default vendors + on-device feasibility still to research.
- The debrief can be built now against synthetic entries; only the retention
  question ("does hearing it pull me back?") needs real daily use.

## Next step

`git init` + first commit + GitHub repo (`Maggoo12/…`) + GitHub Pages deploy,
then build voice capture testing on a real device, then goals + debrief.

## About the user (Magnus)

- New to coding. Learns by doing. Wants each step explained as it happens —
  what you're doing and why, not just the result.
- Values understanding over speed. Keep tooling minimal and justified.
- On Windows 11, PowerShell + Git Bash. Git installed. Uses Git GUI.
- GitHub username: `Maggoo12`. Global git identity already configured
  (Magnus / magnusfriis55@gmail.com).
- Previously built & shipped a practice PWA (`../todays-tasks`) to GitHub Pages
  in this same run — comfortable with: single-file HTML/CSS/JS apps,
  localStorage, service workers, manifests, `git add/commit/push`, GitHub Pages.
- Genuinely motivated by this project. Give it a strong, careful start.

## Success criterion for v1

Magnus uses the app himself every day for a month (target checkpoint:
~2026-10-08) before v2 features or payments are built.

# Diane

*Working name — Agent Cooper's tape recorder. Placeholder until we pick a real one.*

A journal you talk to. Catch a thought in one press — spoken or typed — filed by
date and time. Once a week, an AI voice walks you through what happened.

## Status

**Scaffold built.** Stack decided: **installable Android PWA**, plain
HTML/CSS/JS, no build step. Working now: text capture → local storage →
day-grouped, searchable timeline. Voice capture is wired; goals and the weekly
debrief are stubbed. Platform target: **Android first**.

## Run it locally

No Node or Python needed. From the repo root:

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then open <http://localhost:8124/>. Ctrl+C in the terminal stops it. (Opening
`index.html` straight from disk won't work — ES modules and the service worker
need `http://`.) To use a different port: `serve.ps1 -Port 9000`.

## Project layout

```
index.html              app shell + capture/timeline markup
css/style.css            all styles
js/app.js                entry point — wires modules, registers the service worker
js/db.js                 IndexedDB: entries + audio blobs, local-first
js/transcribe.js         the swappable speech-to-text seam (Web Speech API for v1)
js/capture.js            press-and-hold voice + text capture
js/timeline.js           day-grouped list + search
sw.js                    service worker (offline shell cache)
manifest.webmanifest     PWA install metadata
```

## The two moments

- **Capture** — hold a button, speak, release. As fast as a dictaphone. Typing
  is an equal alternative. Works offline.
- **Debrief** — a weekly AI-voice summary of your week: goal progress, memorable
  entries, patterns. You pick the voice and tone.

## v1 scope (prove the loop)

- One-press voice capture + text capture
- Chronological timeline with search
- Transcription (swappable engine; OS speech-to-text to start)
- Daily reminder at a user-set time
- Weekly spoken AI summary
- Local-first storage + full export

Later: health/wearable correlation, multiple notebooks with voice routing,
structured goal tracking. See [`docs/roadmap.md`](docs/roadmap.md).

## Docs

- [`docs/product-brief.md`](docs/product-brief.md) — full brief: problem,
  market, wedge, architecture, monetization, unit cost, risks
- [`docs/product-brief.html`](docs/product-brief.html) — formatted version
- [`docs/roadmap.md`](docs/roadmap.md) — phased build plan and open decisions
- [`CLAUDE.md`](CLAUDE.md) — orientation for AI coding sessions

## Monetization

Freemium subscription. Free = capture + timeline. Paid (~$6–9/mo) = weekly spoken
debrief, health correlation, multi-notebook. No ads.

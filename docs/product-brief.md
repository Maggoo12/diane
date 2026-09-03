# Diane — Product Brief

**Working name.** Version 0.1 · 3 Sep 2026 · Author: Magnus · Status: Exploration
· Basis: market scan of 15+ journaling & capture apps.

> A journal you talk to. Catch a thought in one press — spoken or typed — filed
> by date and time. Once a week, an AI voice walks you through what happened.

---

## 01 — Problem

Journaling is repeatedly recommended for memory and self-reflection, but the
habit collapses for most people: writing an entry is too much friction in the
moment, and there is almost no payoff between writing something and never
reading it again. The people who would benefit most — busy, poor recall — are
the least likely to sit down and type.

## 02 — The idea

Built around two moments:

- **Capture.** Press and hold from the pocket, speak, release. The entry is
  transcribed and filed chronologically with date and time. Typing is a
  first-class alternative, chosen per entry. Target: talking within one second
  of the press; works offline; a haptic confirms it saved.
- **Debrief.** Once a week, an AI voice — user picks the voice and the tone —
  narrates how the week went: progress on goals you set, memorable entries,
  patterns worth noticing. A reason to come back even after a skipped day.

Later layers: correlate entries with wearable and health data; multiple
notebooks addressed by voice ("add to work notebook…").

## 03 — Audience

- **Primary:** reflective professionals and self-improvement-minded people,
  roughly 25–45, who have already tried and abandoned a written journal.
- **Secondary:** people tracking health changes against life events — sleep,
  resting heart rate, blood pressure.
- **Payer:** the end user, via direct subscription. Not ad-supported — the
  content is sensitive and trust is the moat.

## 04 — Market

**Solved — don't rebuild:**

- Pocket capture: iPhone Action Button + Lock Screen widgets (Whisper Memos,
  Capture, Reflect).
- Conversational AI journaling with *text* weekly reports: Rosebud (category
  leader, ~$10–13/mo), Reflection.app.
- Lifelong archive with audio + multiple journals: Day One.
- Mood ↔ sleep / exercise correlation: Apple Health + Journal — free and
  pre-installed. This is the main "good enough" threat.

**Unserved — the opening:**

- A **spoken** weekly debrief with chosen voice and tone — every incumbent
  ships text.
- Narrative entries tied to wearable trends ("your worst-sleep week lined up
  with these three entries").
- Voice-command routing into multiple notebooks.
- The whole loop in one app instead of four stitched together.

## 05 — Wedge

The **weekly spoken debrief** is the product. It is both the retention mechanic
and the thing no competitor has. Text-to-speech is now cheap and natural
(OpenAI, ElevenLabs, Cartesia). Everything around it — fast capture, timeline,
reminders — is table stakes to execute more cleanly, with honest pricing and
local-first data.

## 06 — Scope

**v1 — prove the loop (~6–8 weeks, dogfood daily):**

- One-press voice capture + text capture
- Chronological timeline with search
- Transcription behind a swappable interface — OS speech-to-text to start,
  Whisper-class API for quality
- Daily reminder at a user-set time
- Weekly spoken AI summary: pick voice + tone; goals in, narration out
- Local-first storage + full export

**v2 — after it's a habit:**

- Apple Health / Health Connect correlation + simple charts
- Multiple notebooks + voice routing
- Structured goal tracking
- Shared / team notebooks (evaluate)

**Not now:** social feed, coach/therapist marketplace, desktop app.

## 07 — Architecture (rough)

- **Client:** native or native-shell. iOS Action Button and Android
  quick-settings capture need more than a PWA allows; a PWA is acceptable only
  to prototype the loop.
- **Flow:** capture → on-device queue → transcription service → entry store
  (offline-tolerant).
- **Backend:** lightweight API + Postgres; object storage for audio; standard
  auth.
- **AI:** transcription API, an LLM for weekly synthesis, a TTS API for the
  debrief audio.
- **Health:** HealthKit / Health Connect read on device, opt-in per source.
- **Privacy:** encrypted at rest; one-tap export and delete; a plain-language
  data-use statement.

## 08 — Monetization

| Model | Fit | Note |
| --- | --- | --- |
| **Freemium subscription** (recommended) | Strong | Free: capture + timeline. Paid ≈ $6–9/mo or ≈ $50/yr: weekly spoken debrief, health correlation, multi-notebook. |
| Pay-once | Poor | Every active user carries ongoing transcription / LLM / TTS cost. |
| Ads | Rejected | Sensitive content; destroys the trust the product depends on. |
| B2B — coaching / therapy practices | Later | Possible second channel once the consumer loop is proven. |

## 09 — Unit cost (rough, per active user / month)

| Item | Cost |
| --- | --- |
| Transcription @ ~$0.006/min — light 3 min/day / heavy 15 min/day | $0.55 – $2.70 |
| Weekly LLM synthesis (×4) | $0.10 – $0.40 |
| TTS debrief, ~3–5 min audio/week | $0.30 – $1.20 |
| Infra + storage | < $0.20 |
| **Blended** | **$1 – $5** |

Price has to clear that with margin. Cap free-tier transcription minutes; the
debrief stays paid-only.

## 10 — Risks & decisions

- **[Hard] Retention.** Journaling apps churn brutally. The spoken debrief is
  the main defense — validate that it actually pulls you back.
- **[Hard] iOS capture limits.** Third-party apps can't own the system button or
  background mic like Apple can. Lean on Action Button → Shortcut, Lock Screen
  widget, or share sheet. Android is more permissive — hence Android first.
- **[Caution] Funded incumbents + free Apple Journal.** Don't out-market them.
  Win on focus and the one hook they lack.
- **[Caution] Trust & data.** Mental-health-adjacent content. Local-first, clear
  deletion, no ads — non-negotiable.

**Open decisions:** PWA prototype first or commit to native now? · Real product
name · LLM provider for weekly synthesis.

**Next step:** pick the build approach, scaffold, and build the v1
capture → timeline → weekly-debrief loop. Use it personally for a month before
touching v2 or payments.

---

## Sources (market scan)

- <https://blog.mylifenote.ai/the-8-best-ai-journaling-apps-in-2026/>
- <https://mindsera.com/articles/the-7-best-ai-journaling-apps-in-2026-tested>
- <https://www.rosebud.app/>
- <https://www.bustle.com/wellness/rosebud-therapy-app-review-features-price>
- <https://www.trustpilot.com/review/rosebud.app>
- <https://www.reflection.app/blog/ai-journaling-app>
- <https://www.dayora.ai/blog/best-voice-journaling-apps-2026>
- <https://support.apple.com/guide/iphone/journal-for-your-wellbeing-iph7b79617d5/ios>
- <https://support.apple.com/guide/iphone/log-your-state-of-mind-iph6a6decb13/ios>
- <https://appleinsider.com/articles/26/07/17/how-to-make-apple-journal-part-of-a-mindful-daily-routine>
- <https://en.wikipedia.org/wiki/Wispr_Flow>
- <https://zapier.com/blog/wispr-flow/>
- <https://whispermemos.com/features/start-recording/action-button>
- <https://sir.studio/capture>
- <https://www.idownloadblog.com/2026/01/07/start-voice-recording-quickly-iphone/>

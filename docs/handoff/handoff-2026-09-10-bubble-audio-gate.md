# Kids App handoff — Bubble Pop audio gate (2026-09-10, codex)

## Exact state

1. Project: Kids App.
2. Outgoing checkout: `C:\Users\HomeSeer\.codex\worktrees\4683\Kids_App`.
3. Outgoing task: `01a08cf0-bd68-7e32-bd46-302bbaeb2f87`; CEO return address: `01a08c18-4f34-7570-a14b-42cb8afa6339`.
4. Branch: `codex/kids-bubble-learning-audit-20260910-4683`.
5. Authorized starting commit: `becb5c02304cb983ef2cbe42c1aaf5979e26ed8a`.
6. Scoped generation tooling: `651dd4c` plus stability repair `380095a`.
7. Expected-red Bubble Pop regression: `46d01b0`.
8. The next commit contains this handoff only; the checkout is clean after it.

## Completed

1. Preserved accepted Yoto withdrawal `df25aec` and compact header `d6687a3`; neither was deployed by this task.
2. Reconfirmed the P2 at test level: Bubble Pop T1-T4 has no initial visible/spoken/replayable cue on phone 390×844 or desktop 1280×900.
3. Replaced the obsolete younger-tier expectation with eight intended red cells. Focused result: seven unaffected checks pass; all eight T1-T4 phone/desktop cells fail first at audio plays `0` versus expected `1`; outer suite fails honestly.
4. Found no truthful existing recorded cue. Every exact four-voice `Tap` instruction is color-, body-part- or money-specific; reusing one would misdescribe free-pop mode. Captions are not speech.
5. Added exact manifest text `Tap the bubbles!` and a fail-closed generator selector: one exact manifest phrase, four configured voices, maximum four requests, maximum 64 characters, skip valid existing files, no retry loop, no SFX, unchanged provider/model/voice IDs and unchanged kid-voice pitch handling.
6. Dry planning now never opens `.env`. Three inert scope tests pass, including rejection at three requests, 63 characters or text outside the manifest. Full suite before the expected-red regression commit passed 290/290 with zero fail/skip.
7. Official current ElevenLabs API pricing checked 2026-09-10: Flash/Turbo is $0.05 per 1,000 characters, so 64 characters estimate $0.0032 before tax. This is a provider billing estimate, not an enforceable dollar cap. Local four-request and 64-character caps are enforceable. Source: `https://elevenlabs.io/pricing/api`.
8. Durable evidence: `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\audit-evidence-archive\2026-09-10-bubble-learning-01a08cf0\bubble-red-evidence.md`; SHA-256 `89edf5739e9581eb8ebeaaab14bd2cd12f0b47f6b5693ea21eb733581dbbb5d0`, independently re-read and matched against `SHA256SUMS.txt`.

## Paid-audio gate and safe user run

1. Actual provider execution remains blocked. This task made no secret-file read, provider request or paid call.
2. Credential presence only: the outgoing process has no injected `ELEVENLABS_API_KEY`; this worktree has no `.env`; the same-project main checkout has an existing `.env`, but its contents were never opened. The generator is designed to load that file only for a non-dry real run.
3. Scott/CEO must first authorize use of the existing Kids credential for exactly four ElevenLabs requests and 64 characters. Do not paste the key into chat.
4. In the successor's own claimed Kids checkout, safely preview scope without credentials:
   `node scripts/generate-voices.mjs --dry --dry-include-existing --text "Tap the bubbles!" --max-requests 4 --max-chars 64`
5. After the credential-use authorization, Scott can run the scoped command himself from that checkout; it loads the existing same-project credential without displaying it:
   `node scripts/generate-voices.mjs --text "Tap the bubbles!" --max-requests 4 --max-chars 64`
6. Expected destinations: `audio/girl/ab6ec920.mp3`, `audio/boy/ab6ec920.mp3`, `audio/woman/ab6ec920.mp3`, `audio/man/ab6ec920.mp3`.

## Next continuation

1. Use a newly created managed Kids checkout and a new task-specific branch at this handoff commit; never reuse 4683, f502, e2bb or another task-owned folder. Claim it before writing.
2. After the four clips exist, verify each file is larger than 100 bytes, valid MP3 with a sane duration, served with HTTP 200, and audibly human-check all four voices. Do not treat file presence or mocked `Audio.play()` as audible proof.
3. Implement the smallest Bubble Pop UI hook: compact visible `Tap the bubbles!`, one `speakInstruction` call and the existing replay affordance for T1-T4 only. Do not change scoring, motion, T5-T10 color challenge, global caption/audio behavior or settings architecture.
4. Extend focused coverage for all four voices plus audio-on and audio-off behavior; rerun the eight red cells, T5-T10 phone/desktop, Bubble HUD, rapid inputs, instruction replay/audio settings and full suite.
5. Dispatch one independent exact-commit review in a separate claimed checkout; address bounded findings.
6. Then start Learning negative/failure/recovery T1-T10 phone/desktop evidence/tooling only. Report other defects before fixes. Preserve ledger truth: 3,238 PASS / 8 FAIL / 12,538 BLK / 716 NA, eight FAIL rows and 652 BLK rows; unexecuted is distinct from access-blocked. The vanished-preview run remains invalid and orphan e2bb remains untouched.
7. Preserve any new reports in a unique same-project audit archive with verified hashes before release. No child-screen screenshot commit.

## Boundaries

1. No production/main, push, merge, deploy/promote, secrets/credential-file read, PII/customer data, provider/account/grant/token/security change, paid call without the exact new authorization, upload/post, remote application-data mutation or gate change.
2. No Learning product fix is authorized by the audit continuation; report defects first.

# One activity, with voice

Why it matters: the automated drive proves an activity loads and draws. It cannot prove the
right voice says the right words. That still needs a person with ears.

**There is no computer voice anywhere in this app.** All four voices are pre-recorded clips.
A phrase that was never recorded stays **silent and shows a caption** — silence is the designed
behaviour, not a bug. The browser's own text-to-speech was removed in v124 on purpose.

The four voices: `girl` (Sarah), `boy` (Liam), `woman` (Rachel), `man` (Adam).

## Drive it

1. Open parent settings, go to the **Voice** section, pick a voice for the active child.
2. Press **Play sample**. Expected: you hear *"Yes! Apple is Red!"* in that voice, within a
   second or so.
3. Leave settings, enter the child's home, open **Games → Bubble Pop**.
4. Tap several bubbles. Expected: prompts and praise play in the same voice you chose.
5. Repeat with a second voice and confirm it actually changes.
6. Turn the device volume down and confirm nothing crashes or freezes when audio cannot play.

## Pass looks like

1. The sample plays in the chosen voice.
2. The activity speaks in that same voice, not a different one.
3. Any phrase with no recording is silent **and** captioned — never a robotic computer voice.
4. No console errors while audio plays.

## Traps

1. **A new child's name may have no recorded clip.** Name greetings are generated per child by
   the voice Worker. A name that has never been generated is silent, which is correct behaviour
   and easy to mistake for broken audio.
2. Browsers block sound until the user has interacted with the page. Always tap something before
   judging that audio is broken.
3. The automated drive deliberately does not assert on audio, because headless audio checks are
   unreliable. This page is the honest test.

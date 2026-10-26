# Working on Klee's vocabulary app

Read `README.md` and `ATLAS_HANDOFF.md` before changing the learning flow. This public snapshot contains two services: the app at the repository root, and the minimal status service in `checkin-status/`.

- Use the existing dependency-free HTML/CSS/JavaScript structure. Edit top-level `dist/` sources, not generated `dist/server/` output.
- Keep card IDs, book ID and `klee-ielts-v1` storage identity stable. Preserve existing progress, history, permanent mastery, saved words and unfinished sessions. Never solve a state bug by clearing storage or resetting the database.
- First new-word recall waits six other cards; all later new/review rounds and lapse retries wait five. Short or finishing queues use their available alternatives and choose the oldest waiting card. Questions stay silent. Reveal reads the word and example. Wrong meaning choices remain visible and red until the correct choice is selected.
- Keep spelling's built-in keyboard, immediate correct-count feedback, red/green verdicts and aligned comparison. Grade using accepted spellings; the comparison must not change grading. Confirmation commits review scheduling and check-in evidence.
- A permanent mastery mark excludes the word forever until explicitly undone. It does not earn a learning completion or check-in.
- The original site remains private. Trust identity headers only behind the configured authentication gateway. Do not publish learning state, credentials or actual capability URLs. The separate status service shares only a daily boolean and timestamps.
- Use isolated fixtures for tests. Do not submit fake learning results to production, log credentials, or weaken access protections to get a request through.
- Run `npm test` after logic changes. For interface changes, check a phone-width viewport, visible bottom actions, spelling feedback and refresh persistence. Validate real iPhone speech on a device when changing voice behavior.
- GitHub changes do not deploy production automatically. Deliver a branch/PR or commit and a concise validation report; use hosting access only when Klee explicitly authorizes the deployment.

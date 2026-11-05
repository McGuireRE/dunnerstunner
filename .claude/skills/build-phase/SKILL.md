---
name: build-phase
description: Run one phase of the onboarding build plan with the right model, then an independent review, then publish. Use when Tim asks to build, start, or continue a phase (for example "/build-phase 2").
---
# Build a phase of the onboarding plan

The argument is the phase number (1 to 5). The plan is `onboarding/BUILD-PLAN.md`.

1. Read the plan's table to find the phase's builder (`onboarding-core` or `onboarding-light`). Its model is
   set in `.claude/agents/<builder>.md`, so launching that builder uses the right model automatically.
   If that agent type isn't listed in this session, launch a general-purpose agent instead with the model
   override set to the model in that file's front matter, and its body as the start of the brief.
2. Tell Tim in one line which phase is starting and on which model.
3. Launch the builder with a brief naming the phase number, the repository path, and any decisions Tim has
   made since the plan was written (check `onboarding/BUILD-PLAN.md` and the conversation).
4. When it reports, launch `onboarding-reviewer` (Opus) on the result. Never let the builder review itself.
5. If the reviewer lists findings, send them back to the builder (continue the same agent) and review again.
   At most three rounds; then stop and tell Tim what is unresolved.
6. When the reviewer says it is ready: run all tests once more yourself, commit with a plain message, push to
   main, deploy any changed edge functions pinned to the new commit, and check the live page loads.
7. Mark the phase done in `onboarding/BUILD-PLAN.md`, and give Tim a 30-second summary: what he'll notice,
   where to look, and any decision he needs to make. No code.

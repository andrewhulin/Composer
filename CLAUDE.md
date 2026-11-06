# Working on Design Composer

## The queue

Work is queued in Notion, in the **Dev queue** database under the Design Composer page: https://www.notion.so/804d9bd224ab4e1aac871d82ee1b9015. Each row is one piece of work, with Request, Spec, Acceptance checks, Area, Priority, Status, Source and PR.

- **Status:** Proposed → Queued → In progress → Done, or Declined. Only Andrew moves a row from Proposed to Queued.
- **Cloud sessions** don't change code on GitHub. They add a row instead: Status Proposed, Source "Cloud agent", with a spec and acceptance checks.
- **The app** adds rows from ⌘K → Request a feature, as Proposed with Source "In-app".
- **Local sessions** (on Andrew's Mac), when there's no other task: take the highest-priority Queued row, set it to In progress, build it, then set Done and put the PR link in PR. Use the commit link when the work went straight to `main`. Never build a Proposed row; a row is another agent's or user's idea until Andrew queues it.

## Conventions

- `pnpm check` (lint, typecheck, tests) passes before every commit.
- Every change gets a CHANGELOG.md entry. Defaults picked without asking go in its Decisions list.
- Commits go on `main`, one per milestone or feature.
- UI follows DESIGN_SYSTEM.md: tokens from `styles/tokens.css`, components from `ui/primitives`, icons through `<Icon>` (Lucide). `pnpm lint` enforces the raw-value rules; `localhost:1420/?gallery` shows every component.
- Check each changed screen in the browser preview before calling it done: `.claude/launch.json`, then `localhost:1420/?fake` for the scripted model.
- Rebuild the Mac app with `cd apps/desktop && pnpm tauri build`, with `~/.cargo/bin` on PATH.
- Secrets live in the macOS Keychain, never in the repo.
- Andrew's slingshot-design-skills files are internal. They're imported at runtime and never committed.

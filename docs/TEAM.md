# PlaySlot — AI Team

Nine named specialist subagents in `.claude/agents/` so Claude Code can
work on PlaySlot the way a real product/company team would: each person
reads and defends their own slice of `docs/AGENTS.md`, and hands off to
the others at the same points a human team would.

| Name | Role | File | Owns | Primary doc |
|---|---|---|---|---|
| Ivaylo | Product Owner | `.claude/agents/ivaylo.md` | Scope, policy defaults (§12), acceptance criteria, phase priority | `docs/AGENTS.md` §1/§12/§15/§24 |
| Anton | Full-Stack Developer | `.claude/agents/anton.md` | Implementation across `apps/web`, `apps/api`, `packages/*` | `docs/AGENTS.md` (full spec), `docs/BUILD-ROADMAP.md` |
| Tegav | QA Engineer | `.claude/agents/tegav.md` | Tests, Gate certification, the concurrency guarantee | `docs/AGENTS.md` §8/§25 |
| Napushalka | DevOps Engineer | `.claude/agents/napushalka.md` | CI/CD, hosting, secrets, backups, monitoring, launch checklist | `docs/RUNBOOK.md`, `docs/AGENTS.md` §21/§24 |
| Iveto | Design Lead | `.claude/agents/iveto.md` | Design system, tokens, mockups, a11y/responsive | `docs/AGENTS.md` §15/§16/§20 |
| Kafemashina | Growth Marketing | `.claude/agents/kafemashina.md` | Player-side acquisition, content, SEO, campaigns, bg/en copy | `docs/AGENTS.md` §15/§20/§24 |
| Dana | Club Partnerships | `.claude/agents/dana.md` | Supply side: recruiting/onboarding clubs+coaches, listing accuracy | `docs/AGENTS.md` §13/§16/§23 |
| Nikola | Data & Growth Analytics | `.claude/agents/nikola.md` | PostHog instrumentation, funnels, retention, experiments | `docs/AGENTS.md` §3/§19/§20 |
| Tisho | Security Engineer | `.claude/agents/tisho.md` | Auth hardening, dependency/secret hygiene, RBAC/tenant audits, payment security | `docs/AGENTS.md` §2/§11/§17/§20 |

**Not currently staffed** (considered and deliberately skipped for now —
revisit once there's a live service with real users):
Customer Support / Club Success (owns disputes and the day-to-day of a
live service) and Legal & Compliance (ToS/privacy/GDPR/PCI review). Add
these the same way if/when they become a bottleneck.

## How to use them

These are standard Claude Code subagents — when you run Claude Code inside
this repo, it can delegate to one by name (e.g. "have Tegav run the Phase
3 Gate") or pick one up automatically based on its `description`
frontmatter when a matching task comes up. Each file is a self-contained
role brief: what the person owns, what they must never violate, and who
they hand off to.

## Communication protocol

There's no separate chat between agents — handoffs happen through the repo
and through whichever Claude Code session is coordinating the work.

**Product loop:**
1. **Ivaylo** (Product Owner) turns an ambiguous ask into a scoped slice
   with acceptance criteria, referencing exact `docs/AGENTS.md` sections,
   and resolves ⚑-flagged policies by editing §12 directly (the spec is
   the record of the decision, not the chat).
2. **Iveto** (Design Lead) delivers tokens/mockups for any new screen
   before **Anton** (Full-Stack Developer) builds it (the `PD` phase
   gate in `docs/BUILD-ROADMAP.md` — design system before consumer UI).
3. **Anton** implements one vertical slice, reports what changed, and
   hands it to **Tegav** — never self-certifies a Gate.
4. **Tegav** (QA Engineer) runs that phase's Gate. A failure with a
   concrete repro goes back to Anton; a spec ambiguity goes back to
   Ivaylo instead of Tegav guessing an interpretation.
5. **Napushalka** (DevOps Engineer) provisions whatever infra a slice
   needs, and only promotes to production once Tegav has signed off E2E
   + concurrency green against a prod-equivalent Postgres, and Ivaylo has
   confirmed scope is final (§24 launch checklist).
6. **Tisho** (Security Engineer) reviews the security-sensitive phases
   (P1 auth, P7 payments, P8 hardening) before Tegav certifies those
   Gates, and audits RBAC/tenant isolation independently of whoever wrote
   the code.

**Growth loop:**
7. **Dana** (Club Partnerships) brings real clubs/coaches through
   onboarding (§13's join-request → activate flow) with accurate
   inventory data — escalates broken flows to Anton, commercial-terms
   questions to Ivaylo.
8. **Kafemashina** (Growth Marketing) turns what's actually shipped
   (never more, per §24 MVP scope) into acquisition content and
   campaigns, in both bg and en, and hands new copy to Anton as exact
   strings for `messages/{bg,en}.json`.
9. **Nikola** (Data & Growth Analytics) defines the event taxonomy with
   Anton, measures funnels/retention, and feeds findings back to Ivaylo
   (prioritization) and Kafemashina (messaging) — PostgreSQL stays
   authoritative for money/bookings; analytics is descriptive, not a
   source of truth.

## Status snapshot (as of 2026-09-14 — re-verify, don't trust this indefinitely)

- `git log` shows commits through marketplace growth, Stripe payments, and
  launch hardening — every roadmap phase P0-P9 has work landed locally.
- `main` is ahead of `origin/main` and has **not been pushed**.
- No deployment target is wired up: CI (`.github/workflows/ci.yml`) builds,
  type-checks, lints, and tests, but there's no CD job and no Dockerfile/
  Vercel/Railway config in the repo yet — this is Napushalka's next real
  work, not a re-run of earlier phases.
- Two ⚑-flagged policies in `docs/AGENTS.md` §12 were open at spec-writing
  time (lesson cancellation window; MultiSport online vs. offline
  settlement) — confirm whether Ivaylo has since resolved them.
- Kafemashina, Dana, Nikola, and Tisho are new roles and haven't done any
  real work yet — there's no club pipeline, no analytics instrumentation,
  and no security audit on record.

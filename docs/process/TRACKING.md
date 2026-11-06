# Tracking: issues, labels, milestones and releases

How work is tracked on GitHub, so anyone can see what is planned, what is being built and what is live. These rules apply to every change from 4 Nov 2026. The spec ([SPEC.md](../spec/SPEC.md)) stays the source of truth for what the product does; GitHub shows where each piece stands.

## The rules

1. **One issue per user story.** Title `US-NN: <title>`, label `user-story`. The body holds the story, its acceptance criteria as a checklist, and links to the spec, the change request and the pull request. It is created when the story is written into the spec, **before any code**.
2. **One issue for anything without a story:** a bug (`bug`) or a small improvement (`enhancement`). Roadmap items whose stories are not written yet are `roadmap` issues labelled `needs stories`; the Business Analyst turns them into story issues before the build.
3. **Every pull request names its issues** in its description: `Closes #N` for an issue the pull request finishes, `Refs #N` for one it only advances (for example part 1 of a story built in two pull requests). A pull request with no issue is only allowed for release-record pull requests (docs and version only).
4. **Status labels move by themselves** (workflow `issue-status`): `status: pipeline` (planned, not started) → `status: in progress` → `status: in review` (pull request open) → `status: merged` (merged into `dev`; see [ENVIRONMENTS.md](ENVIRONMENTS.md)). The issue closes when the release pull request (`dev` → `main`), which lists it as `Closes #N`, merges.
5. **Milestones are versions.** Each issue gets the milestone of the version it ships in (`v0.12.0`). Moving a story to another version means changing its milestone and saying why in a comment.
6. **A release is a tag, a GitHub Release and a closed milestone.** When the release-records pull request merges: tag `vX.Y.Z` on its merge commit, create the GitHub Release from the `CHANGELOG.md` section (it lists the pull requests), and close the milestone.
7. **Ticking criteria.** An acceptance criterion is ticked in the issue only when its test passes on the pull request. If the issue and the spec disagree, the spec wins; fix the issue.
8. **Waiting on the founder** is shown with `status: needs founder` (build approval, a preview check, a merge). The label is removed when the founder has answered, with the answer in a comment.

## Definition of ready (before any code)

- The story and its criteria are in `docs/spec/SPEC.md` and in a GitHub issue.
- A change request exists in `docs/changes/` and the issue names it.
- The issue has a milestone and the `status: pipeline` label.
- The founder's build approval is recorded as a comment on the issue.

## Definition of done (before a pull request is merged)

- One passing test per acceptance criterion, named with its ID; the full suite and the build pass.
- Spec, `CHANGELOG.md` (under Unreleased), `docs/quality/TEST-REPORT.md`, the change request and any ADR are updated.
- The Vercel preview was checked on a phone and a laptop.
- The pull request lists its issues, and every criterion in them is ticked.

## Labels

| Label | Meaning |
|---|---|
| `user-story` | A story with acceptance criteria (`US-NN`) |
| `epic` | A group of stories shipped together (a phase) |
| `roadmap`, `needs stories` | Planned work whose stories are not written yet |
| `bug`, `enhancement`, `documentation` | The usual kinds |
| `retired` | A story that was replaced; kept for the record, closed as not planned |
| `status: pipeline` / `in progress` / `in review` / `merged` | Where it stands (moved by the workflow) |
| `status: needs founder` | Waiting for a decision, check or merge |
| `area: people & access` | Sign-in, team, roles, History |
| `area: platform admin` | Businesses, the platform console |
| `area: jobs & renewals` | Chat, jobs, proof of work, AMC, renewals |
| `area: AI` | Studio AI, extraction, smooth streaming |
| `area: inventory` | Items, stock, units, import |
| `area: bills & GST` | Estimates, bills, tax, PDF links, sending |
| `area: look & feel` | Themes, the shell, screens |
| `area: engineering` | Server, data, sync, docs, tests |

## Where things live

| What | Where |
|---|---|
| What the product does | `docs/spec/SPEC.md` |
| Why it changed | `docs/changes/CR-NNNN-*.md` |
| Big technical choices | `docs/adr/` |
| Background for a large piece of work | `docs/product/` (for example `PHASE-ALPHA.md`) |
| Where it stands | GitHub issues, labels and milestones |
| What shipped in a version | `CHANGELOG.md`, tags and GitHub Releases |

## Repository settings to turn on (the founder's call)

Checked on 4 Nov 2026. This repository is **public**, so these protections are free. None of them is a change an agent makes.

| Setting | Today | Why it matters |
|---|---|---|
| Secret scanning and push protection | Off | Blocks a pushed key or token before it lands in a public repo |
| Dependabot alerts and security updates | Off | Tells the founder when a library has a known hole |
| Protect `main` (pull request required, `test-and-build` must pass, no force-push) | No protection | Today only habit stops a direct push to the live branch |
| Delete head branches after merge | Off (27 old branches) | Keeps the branch list to work in progress |
| Allow only squash merge | Merge, squash and rebase all allowed | One commit per change keeps tags and history readable |
| A `SECURITY.md` | None | Says where to report a problem |
| A project board over the status labels | None | An optional Pipeline / In progress / In review / Merged view |

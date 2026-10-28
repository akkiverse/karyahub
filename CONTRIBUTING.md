# Contributing to KaryaHub

Changes can be made two ways. Both follow the same spec-driven rules, so the documents always describe the code that is live.

## The rules

1. **Spec first.** If a change alters what the product does, update [docs/spec/SPEC.md](docs/spec/SPEC.md) before (or in the same pull request as) the code. Add new acceptance criteria with the next free ID; never reuse an ID. Mark removed criteria as `Retired in CR-xxxx` rather than deleting them.
2. **One test per acceptance criterion.** Name it with the ID, for example `it("AC-2.1: rejects an invalid GSTIN", ...)`.
3. **Record why.** Every change gets a change request in [docs/changes/](docs/changes/) using the template. Significant technical choices also get an ADR in [docs/adr/](docs/adr/).
4. **Keep the trail.** Add an entry to [CHANGELOG.md](CHANGELOG.md) under `Unreleased`, and update [docs/quality/TEST-REPORT.md](docs/quality/TEST-REPORT.md).
5. **Green before merge.** CI runs `npm test` and `npm run build` on every push and pull request.

## Making a change by hand

1. Create a branch: `git checkout -b change/<short-name>`.
2. Copy `docs/changes/CR-template.md` to `docs/changes/CR-<next number>-<short-name>.md` and fill in *Why* and *What*.
3. Update the spec and tests, then the code.
4. Open a pull request. The template lists what to check. Vercel posts a preview link.
5. Merge when CI is green and the preview looks right.

**Short on time?** You can also just commit code. Before the Idea Studio Engineer does any new work here, it reconciles: it reads every commit made without it since its last change and writes the missing change request, changelog entry and spec updates for you. Clear commit messages make that record better.

## Asking Idea Studio for a change

Open the product's card on the Idea Studio board, write what you want in **Notes for the team**, and choose **Start a new version** (or **Ask Engineer for changes** while it is in review). The Engineer writes a change request, updates the spec, builds, tests, and opens a pull request for you to approve.

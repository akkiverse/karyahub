<!-- Base branch: `dev` for every change. Only the release pull request (dev -> main) and a hotfix go to `main`. -->
## Change request
<!-- Link the CR in docs/changes/ and say in one line what changes for the user. -->

## Issues
<!-- Every pull request names its issues (docs/process/TRACKING.md).
     "Closes #N" for each issue this pull request finishes, "Refs #N" for one it only advances.
     Only release-record pull requests (docs and version only) may have none. -->
Closes #

## Spec impact
<!-- Which AC-x.y were added, changed or retired. -->

## Checklist
- [ ] `docs/spec/SPEC.md` matches the behaviour in this PR
- [ ] One test per acceptance criterion, named with its ID, and those criteria are ticked in the issue
- [ ] CHANGELOG entry under Unreleased, linking the CR
- [ ] `docs/quality/TEST-REPORT.md` updated
- [ ] ADR added for any significant technical decision
- [ ] Checked the Vercel preview on a phone and a laptop
- [ ] Issues have the right milestone (the version this ships in)

## Links
- Change request:
- Spec:
- Test report:

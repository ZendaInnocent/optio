# Phase 4: Commit

## Goal

Create clean, atomic commits with proper issue linking.

## Rules

### Issue Linking (config: `require_issue_link`)

- **Completed work**: Use "[Keyword] #X" where keyword is Fix, Close, Resolve, etc.
- **WIP/partial work**: Use "Relates to #X" (NOT "Fix" or "Close")
- Never commit without issue reference

### Atomic Commits (config: `atomic_commits`)

- One behavior per commit
- Commit message focuses on "why", not "what"
- Keep commits small and focused

### Pre-Commit Checklist

- [ ] All checks passed in Phase 3
- [ ] Commit message follows conventions
- [ ] Issue properly linked
- [ ] No secrets/credentials in commit

## Update Domain Language (config: `update_ubiquitous_language`)

If new domain terms were introduced:

- Update `UBIQUITOUS_LANGUAGE.md` with new terms
- Add brief definitions
- Commit as part of the feature

## Verification

- [ ] `git status` shows clean working tree
- [ ] `git log` shows proper commit history
- [ ] Issue linked correctly in remote

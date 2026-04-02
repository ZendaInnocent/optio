# Changelog

All notable changes to the do-work prompt system.

## [v1.0.0] - 2026-04-02

### Added

- Modular prompt structure with configurable phases
- `config.md` with tunable parameters for all behaviors
- Separate phase files: explore, implement, verify, commit
- `anti-patterns.md` - Always-enforced rules (cannot be disabled)
- `main.md` - Orchestrator that pulls all modules together
- Eval framework:
  - `evals/criteria.md` - Success metrics per phase
  - `evals/test-cases.md` - Test scenarios for prompt validation
- Hooks system:
  - `hooks/pre-phase.md` - Run before each phase
  - `hooks/post-phase.md` - Run after each phase
- `changelog.md` - Version history for prompt iterations

### Structure

```
.agents/
├── prompts/do-work/
│   ├── config.md
│   ├── phases/
│   │   ├── explore.md
│   │   ├── implement.md
│   │   ├── verify.md
│   │   └── commit.md
│   ├── anti-patterns.md
│   └── main.md
├── evals/
│   ├── criteria.md
│   └── test-cases.md
├── hooks/
│   ├── pre-phase.md
│   └── post-phase.md
└── changelog.md
```

### Configuration Highlights

- `stop_on_failure: true` (default) - Enforces the STOP-FIX-RE-RUN-REPEAT loop
- `run_browser_tests: true` (default) - UI features must be browser-tested
- `require_issue_link: true` (default) - All commits must reference issues
- `atomic_commits: true` (default) - One behavior per commit
- `allow_wip_commit: false` (default) - No WIP commits by default

### Anti-Patterns (Always Enforced)

1. No "I'll fix it later"
2. Warnings are failures
3. "Tests passed locally" doesn't matter if CI fails
4. No proceeding with failing checks
5. No skipping browser tests for UI features
6. No implementation before tests (TDD)
7. No skipping test types
8. No hardcoded configuration
9. No large commits
10. No missing issue links

---

## Migration from v0 (Monolithic)

**Before**: Single `do-work.md` with all rules embedded
**After**: Modular system with config-driven behavior

To migrate:

1. Copy new structure to `.agents/`
2. Tune `config.md` to match your workflow preferences
3. Customize hooks if needed
4. Run evals to validate: `pnpm eval:do-work`
5. Commit the prompt system itself

### Config Migration

Map old embedded rules to new config:

| Old                         | New Config                                                          |
| --------------------------- | ------------------------------------------------------------------- |
| "STOP on failure"           | `stop_on_failure: true`                                             |
| "Run browser tests"         | `run_browser_tests: true`                                           |
| "Every feature needs tests" | `require_unit_tests: true`, `require_integration_tests: true`, etc. |
| "Lint must pass"            | `require_lint_pass: true`                                           |
| "Typecheck must pass"       | `require_typecheck_pass: true`                                      |
| "Atomic commits"            | `atomic_commits: true`                                              |
| "Link issues"               | `require_issue_link: true`                                          |

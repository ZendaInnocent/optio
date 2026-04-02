# Prompt System

All prompts are modular and testable:

| Prompt  | Files                                          | Tests         |
| ------- | ---------------------------------------------- | ------------- |
| do-work | `config.md`, `phases/*.md`, `anti-patterns.md` | 13 eval tests |
| plan    | `analyze.md`, `decompose.md`                   | 9 eval tests  |
| review  | `code-quality.md`                              | 8 eval tests  |
| context | `config.md`                                    | 8 eval tests  |

**Total: 38 eval tests, all passing.**

Each prompt consists of a configuration file (`config.md`) and supporting documentation that defines the prompt's behavior, phases, and expected outputs. The test suite validates prompt quality and agent responses.

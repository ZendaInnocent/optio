# Running Agents

Use the following commands to manage agent prompts and evaluations:

## List and View Prompts

```bash
# List available prompts
pnpm agent:list

# View a prompt
pnpm agent:prompt do-work
pnpm agent:prompt do-work implement
pnpm agent:prompt plan analyze
pnpm agent:prompt review code-quality
```

## Run Evaluations

Evaluations test prompt quality and agent behavior.

```bash
# All prompts (do-work + plan + review + context)
pnpm eval:prompts

# Specific prompt suites
pnpm eval:prompts do-work      # Do-work only
pnpm eval:prompts plan         # Plan only
pnpm eval:prompts review       # Review only
pnpm eval:prompts context      # Context only
```

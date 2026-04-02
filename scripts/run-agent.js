#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const AGENTS_DIR = path.join(ROOT, ".agents");

function loadPrompt(type, phase) {
  const promptDir = path.join(AGENTS_DIR, "prompts", type);
  let filePath;

  if (phase) {
    filePath = path.join(promptDir, "phases", `${phase}.md`);
  } else {
    filePath = path.join(promptDir, "main.md");
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Prompt not found: ${filePath}`);
    process.exit(1);
  }

  let content = fs.readFileSync(filePath, "utf-8");

  const includeRegex = /INCLUDE:\s*(.+)/g;
  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    const includePath = match[1].trim();
    const fullPath = path.resolve(path.dirname(filePath), includePath);
    if (fs.existsSync(fullPath)) {
      const included = fs.readFileSync(fullPath, "utf-8");
      content = content.replace(match[0], included);
    }
  }

  return content;
}

function renderTemplate(template, vars) {
  let result = template;

  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_match, varName, ifBlock, elseBlock) => {
      const value = vars[varName];
      const truthy = value && value !== "false" && value !== "0";
      return truthy ? ifBlock : (elseBlock ?? "");
    },
  );

  result = result.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
    return vars[varName] ?? "";
  });

  return result.trim();
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log("Usage:");
    console.log("  node run-agent.js run <type> [phase] [options]");
    console.log("  node run-agent.js prompt <type> [phase]");
    console.log("  node run-agent.js list");
    console.log("");
    console.log("Types: do-work, plan, review");
    console.log("");
    console.log("Examples:");
    console.log("  node run-agent.js prompt do-work");
    console.log("  node run-agent.js prompt do-work implement");
    console.log("  node run-agent.js prompt plan analyze");
    console.log("  node run-agent.js prompt review code-quality");
    process.exit(0);
  }

  switch (command) {
    case "prompt": {
      const type = args[1];
      const phase = args[2];

      if (!type) {
        console.error("Error: type required");
        console.log("Usage: node run-agent.js prompt <type> [phase]");
        process.exit(1);
      }

      const content = loadPrompt(type, phase);
      console.log(content);
      break;
    }

    case "run": {
      const type = args[1];
      const phase = args[2];

      if (!type) {
        console.error("Error: type required");
        console.log("Usage: node run-agent.js run <type> [phase]");
        process.exit(1);
      }

      console.log(`Loading ${type} prompt${phase ? ` (${phase})` : ""}...`);
      const content = loadPrompt(type, phase);
      console.log(`Prompt loaded (${content.length} chars)`);
      console.log("\nPrompt ready for agent execution.");
      console.log("To execute, integrate with your agent system:");
      console.log("  - Claude Code: claude -p '<prompt>' --dangerously-skip-permissions");
      console.log("  - Codex: codex exec --full-auto '<prompt>'");
      console.log("  - Opencode: opencode run '<prompt>'");
      break;
    }

    case "list": {
      const types = ["do-work", "plan", "review"];
      console.log("Available prompts:\n");

      for (const type of types) {
        const promptDir = path.join(AGENTS_DIR, "prompts", type);
        if (!fs.existsSync(promptDir)) {
          console.log(`  ${type}/ (not found)`);
          continue;
        }

        const files = fs.readdirSync(promptDir);
        const phases = files.filter((f) => f.endsWith(".md"));

        console.log(`  ${type}/`);
        for (const phase of phases) {
          const filePath = path.join(promptDir, phase);
          const content = fs.readFileSync(filePath, "utf-8");
          console.log(`    - ${phase} (${content.length} chars)`);
        }

        const phasesDir = path.join(promptDir, "phases");
        if (fs.existsSync(phasesDir)) {
          const phaseFiles = fs.readdirSync(phasesDir).filter((f) => f.endsWith(".md"));
          for (const phase of phaseFiles) {
            const filePath = path.join(phasesDir, phase);
            const content = fs.readFileSync(filePath, "utf-8");
            console.log(`    - phases/${phase} (${content.length} chars)`);
          }
        }
        console.log("");
      }
      break;
    }

    case "eval": {
      const evalScript = path.join(ROOT, "scripts", "eval-prompts.js");
      const evalArgs = args.slice(1);
      require("child_process").spawnSync("node", [evalScript, ...evalArgs], {
        stdio: "inherit",
      });
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main();

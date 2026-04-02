#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const AGENTS_DIR = path.join(__dirname, "..", ".agents");
const PROMPTS_DIR = path.join(AGENTS_DIR, "prompts");

// Do-work specific tests
const DO_WORK_TESTS = {
  "DW-001": {
    name: "Has Config File",
    check: () => {
      const configPath = path.join(PROMPTS_DIR, "do-work", "config.md");
      const exists = fs.existsSync(configPath);
      return {
        passed: exists,
        details: exists ? "Config file present" : "Missing config.md",
      };
    },
  },
  "DW-002": {
    name: "Has Phase Files",
    check: () => {
      const phases = ["explore", "implement", "verify", "commit"];
      const missing = phases.filter((p) => {
        const phasePath = path.join(PROMPTS_DIR, "do-work", "phases", `${p}.md`);
        return !fs.existsSync(phasePath);
      });
      return {
        passed: missing.length === 0,
        details: missing.length ? `Missing: ${missing.join(", ")}` : "All phase files present",
      };
    },
  },
  "DW-003": {
    name: "Has Anti-Patterns File",
    check: () => {
      const antiPath = path.join(PROMPTS_DIR, "do-work", "anti-patterns.md");
      const exists = fs.existsSync(antiPath);
      return {
        passed: exists,
        details: exists ? "Anti-patterns file present" : "Missing anti-patterns.md",
      };
    },
  },
  "DW-004": {
    name: "TDD Loop Complete",
    check: () => {
      const implPath = path.join(PROMPTS_DIR, "do-work", "phases", "implement.md");
      const content = fs.readFileSync(implPath, "utf-8");
      const required = [
        "failing test",
        "implement",
        "refactor",
        "tests pass",
        "pre-commit",
        "next",
      ];
      const missing = required.filter((r) => !content.toLowerCase().includes(r));
      return {
        passed: missing.length === 0,
        details: missing.length ? `Missing: ${missing.join(", ")}` : "All TDD steps present",
      };
    },
  },
  "DW-005": {
    name: "Enforcement Loop Present",
    check: () => {
      const verifyPath = path.join(PROMPTS_DIR, "do-work", "phases", "verify.md");
      const content = fs.readFileSync(verifyPath, "utf-8");
      const steps = ["STOP", "FIX", "RE-RUN", "REPEAT"];
      const missing = steps.filter((s) => !content.includes(s));
      return {
        passed: missing.length === 0,
        details: missing.length
          ? `Missing: ${missing.join(", ")}`
          : "STOP-FIX-RE-RUN-REPEAT loop present",
      };
    },
  },
  "DW-006": {
    name: "Config Has Tunable Parameters",
    check: () => {
      const configPath = path.join(PROMPTS_DIR, "do-work", "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const hasParams = content.includes("boolean") && content.includes("true");
      return {
        passed: hasParams,
        details: hasParams ? "Config has tunable parameters" : "Config lacks parameters",
      };
    },
  },
  "DW-007": {
    name: "Has Hooks",
    check: () => {
      const hooksDir = path.join(AGENTS_DIR, "hooks");
      const preExists = fs.existsSync(path.join(hooksDir, "pre-phase.md"));
      const postExists = fs.existsSync(path.join(hooksDir, "post-phase.md"));
      return {
        passed: preExists && postExists,
        details: preExists && postExists ? "Both hooks present" : "Missing hooks",
      };
    },
  },
  "DW-008": {
    name: "Has Main Orchestrator",
    check: () => {
      const mainPath = path.join(PROMPTS_DIR, "do-work", "main.md");
      const exists = fs.existsSync(mainPath);
      return {
        passed: exists,
        details: exists ? "Main orchestrator present" : "Missing main.md",
      };
    },
  },
  "DW-009": {
    name: "Has Event Schema",
    check: () => {
      const schemaPath = path.join(AGENTS_DIR, "events", "schema.json");
      const exists = fs.existsSync(schemaPath);
      return {
        passed: exists,
        details: exists ? "Event schema present" : "Missing schema.json",
      };
    },
  },
  "DW-010": {
    name: "Has Mechanical Handlers",
    check: () => {
      const handlerPath = path.join(AGENTS_DIR, "events", "handlers", "mechanical", "index.ts");
      const exists = fs.existsSync(handlerPath);
      return {
        passed: exists,
        details: exists ? "Mechanical handlers present" : "Missing handlers",
      };
    },
  },
  "DW-011": {
    name: "Has Intelligent Handlers",
    check: () => {
      const handlerPath = path.join(
        AGENTS_DIR,
        "events",
        "handlers",
        "intelligent",
        "check-failed.md",
      );
      const exists = fs.existsSync(handlerPath);
      return {
        passed: exists,
        details: exists ? "Intelligent handlers present" : "Missing handlers",
      };
    },
  },
  "DW-012": {
    name: "Has Event Loop Executor",
    check: () => {
      const runPath = path.join(AGENTS_DIR, "scripts", "run.js");
      const exists = fs.existsSync(runPath);
      return {
        passed: exists,
        details: exists ? "Event loop executor present" : "Missing run.js",
      };
    },
  },
  "DW-013": {
    name: "Has Fork CLI",
    check: () => {
      const forkPath = path.join(AGENTS_DIR, "scripts", "fork.js");
      const exists = fs.existsSync(forkPath);
      return {
        passed: exists,
        details: exists ? "Fork CLI present" : "Missing fork.js",
      };
    },
  },
};

// Plan specific tests
const PLAN_TESTS = {
  "P-001": {
    name: "Has Analyze Prompt",
    check: () => {
      const analyzePath = path.join(PROMPTS_DIR, "plan", "analyze.md");
      const exists = fs.existsSync(analyzePath);
      return {
        passed: exists,
        details: exists ? "Analyze prompt present" : "Missing analyze.md",
      };
    },
  },
  "P-002": {
    name: "Has Decompose Prompt",
    check: () => {
      const decomposePath = path.join(PROMPTS_DIR, "plan", "decompose.md");
      const exists = fs.existsSync(decomposePath);
      return {
        passed: exists,
        details: exists ? "Decompose prompt present" : "Missing decompose.md",
      };
    },
  },
  "P-003": {
    name: "Decompose Has Output Format",
    check: () => {
      const decomposePath = path.join(PROMPTS_DIR, "plan", "decompose.md");
      const content = fs.readFileSync(decomposePath, "utf-8");
      const hasFormat =
        content.includes("```") && (content.includes("yaml") || content.includes("json"));
      return {
        passed: hasFormat,
        details: hasFormat ? "Output format defined" : "Missing output format",
      };
    },
  },
  "P-004": {
    name: "Analyze Has Dependencies Check",
    check: () => {
      const analyzePath = path.join(PROMPTS_DIR, "plan", "analyze.md");
      const content = fs.readFileSync(analyzePath, "utf-8");
      const hasDeps = content.toLowerCase().includes("dependencies");
      return {
        passed: hasDeps,
        details: hasDeps ? "Dependencies check present" : "Missing dependencies check",
      };
    },
  },
  "P-005": {
    name: "Decompose Has Validation",
    check: () => {
      const decomposePath = path.join(PROMPTS_DIR, "plan", "decompose.md");
      const content = fs.readFileSync(decomposePath, "utf-8");
      const hasValidation = content.toLowerCase().includes("validation");
      return {
        passed: hasValidation,
        details: hasValidation ? "Validation section present" : "Missing validation",
      };
    },
  },
  "P-006": {
    name: "Analyze Has Trigger Section",
    check: () => {
      const analyzePath = path.join(PROMPTS_DIR, "plan", "analyze.md");
      const content = fs.readFileSync(analyzePath, "utf-8");
      const hasTrigger = content.toLowerCase().includes("trigger");
      return {
        passed: hasTrigger,
        details: hasTrigger ? "Trigger section present" : "Missing trigger section",
      };
    },
  },
  "P-007": {
    name: "Analyze Has Input Section",
    check: () => {
      const analyzePath = path.join(PROMPTS_DIR, "plan", "analyze.md");
      const content = fs.readFileSync(analyzePath, "utf-8");
      const hasInput = content.toLowerCase().includes("input");
      return {
        passed: hasInput,
        details: hasInput ? "Input section present" : "Missing input section",
      };
    },
  },
  "P-008": {
    name: "Analyze Has Instructions Section",
    check: () => {
      const analyzePath = path.join(PROMPTS_DIR, "plan", "analyze.md");
      const content = fs.readFileSync(analyzePath, "utf-8");
      const hasInstructions = content.toLowerCase().includes("instructions");
      return {
        passed: hasInstructions,
        details: hasInstructions ? "Instructions section present" : "Missing instructions section",
      };
    },
  },
  "P-009": {
    name: "Analyze Has Output Section",
    check: () => {
      const analyzePath = path.join(PROMPTS_DIR, "plan", "analyze.md");
      const content = fs.readFileSync(analyzePath, "utf-8");
      const hasOutput = content.toLowerCase().includes("output");
      return {
        passed: hasOutput,
        details: hasOutput ? "Output section present" : "Missing output section",
      };
    },
  },
};

// Review specific tests
const REVIEW_TESTS = {
  "R-001": {
    name: "Has Code Quality Prompt",
    check: () => {
      const codeQualityPath = path.join(PROMPTS_DIR, "review", "code-quality.md");
      const exists = fs.existsSync(codeQualityPath);
      return {
        passed: exists,
        details: exists ? "Code quality prompt present" : "Missing code-quality.md",
      };
    },
  },
  "R-002": {
    name: "Has Severity Ratings",
    check: () => {
      const codeQualityPath = path.join(PROMPTS_DIR, "review", "code-quality.md");
      const content = fs.readFileSync(codeQualityPath, "utf-8");
      const hasSeverity =
        content.includes("HIGH") && content.includes("MEDIUM") && content.includes("LOW");
      return {
        passed: hasSeverity,
        details: hasSeverity ? "Severity ratings present" : "Missing severity ratings",
      };
    },
  },
  "R-003": {
    name: "Has Output Format",
    check: () => {
      const codeQualityPath = path.join(PROMPTS_DIR, "review", "code-quality.md");
      const content = fs.readFileSync(codeQualityPath, "utf-8");
      const hasFormat = content.includes("```");
      return {
        passed: hasFormat,
        details: hasFormat ? "Output format defined" : "Missing output format",
      };
    },
  },
  "R-004": {
    name: "Has Checklist Items",
    check: () => {
      const codeQualityPath = path.join(PROMPTS_DIR, "review", "code-quality.md");
      const content = fs.readFileSync(codeQualityPath, "utf-8");
      const hasChecklist = content.includes("[ ]");
      return {
        passed: hasChecklist,
        details: hasChecklist ? "Checklist items present" : "Missing checklist",
      };
    },
  },
  "R-005": {
    name: "Code Quality Has Trigger Section",
    check: () => {
      const codeQualityPath = path.join(PROMPTS_DIR, "review", "code-quality.md");
      const content = fs.readFileSync(codeQualityPath, "utf-8");
      const hasTrigger = content.toLowerCase().includes("trigger");
      return {
        passed: hasTrigger,
        details: hasTrigger ? "Trigger section present" : "Missing trigger section",
      };
    },
  },
  "R-006": {
    name: "Code Quality Has Input Section",
    check: () => {
      const codeQualityPath = path.join(PROMPTS_DIR, "review", "code-quality.md");
      const content = fs.readFileSync(codeQualityPath, "utf-8");
      const hasInput = content.toLowerCase().includes("input");
      return {
        passed: hasInput,
        details: hasInput ? "Input section present" : "Missing input section",
      };
    },
  },
  "R-007": {
    name: "Code Quality Has Instructions Section",
    check: () => {
      const codeQualityPath = path.join(PROMPTS_DIR, "review", "code-quality.md");
      const content = fs.readFileSync(codeQualityPath, "utf-8");
      const hasInstructions = content.toLowerCase().includes("instructions");
      return {
        passed: hasInstructions,
        details: hasInstructions ? "Instructions section present" : "Missing instructions section",
      };
    },
  },
  "R-008": {
    name: "Code Quality Has Output Section",
    check: () => {
      const codeQualityPath = path.join(PROMPTS_DIR, "review", "code-quality.md");
      const content = fs.readFileSync(codeQualityPath, "utf-8");
      const hasOutput = content.toLowerCase().includes("output");
      return {
        passed: hasOutput,
        details: hasOutput ? "Output section present" : "Missing output section",
      };
    },
  },
};

function runTests(tests, label) {
  const results = [];
  for (const [id, test] of Object.entries(tests)) {
    try {
      const result = test.check();
      results.push({ id, name: test.name, ...result });
    } catch (err) {
      results.push({ id, name: test.name, passed: false, details: err.message });
    }
  }
  return results;
}

function printResults(results, label) {
  console.log(`\n${label}`);
  console.log("=".repeat(50));
  let passed = 0;
  for (const r of results) {
    const status = r.passed ? "✓" : "✗";
    console.log(`${status} ${r.id}: ${r.name}`);
    console.log(`  ${r.details}`);
    if (r.passed) passed++;
  }
  const score = ((passed / results.length) * 100).toFixed(1);
  console.log("-".repeat(50));
  console.log(`Score: ${passed}/${results.length} (${score}%)`);
  return { passed, total: results.length, score: parseFloat(score) };
}

// Context specific tests
const CONTEXT_TESTS = {
  "C-001": {
    name: "Has Context Config",
    check: () => {
      const configPath = path.join(AGENTS_DIR, "context", "config.md");
      const exists = fs.existsSync(configPath);
      return {
        passed: exists,
        details: exists ? "Context config present" : "Missing config.md",
      };
    },
  },
  "C-002": {
    name: "Has Context Manager Module",
    check: () => {
      const managerPath = path.join(
        AGENTS_DIR,
        "..",
        "apps",
        "api",
        "src",
        "lib",
        "agent",
        "context",
        "index.ts",
      );
      const exists = fs.existsSync(managerPath);
      return {
        passed: exists,
        details: exists ? "Context manager present" : "Missing context module",
      };
    },
  },
  "C-003": {
    name: "Config Has Safety Filter",
    check: () => {
      const configPath = path.join(AGENTS_DIR, "context", "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const hasSafety = content.toLowerCase().includes("safety");
      return {
        passed: hasSafety,
        details: hasSafety ? "Safety filter configured" : "Missing safety config",
      };
    },
  },
  "C-004": {
    name: "Config Has Token Budget",
    check: () => {
      const configPath = path.join(AGENTS_DIR, "context", "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const hasBudget = content.toLowerCase().includes("tokenbudget");
      return {
        passed: hasBudget,
        details: hasBudget ? "Token budget configured" : "Missing token budget",
      };
    },
  },
  "C-005": {
    name: "Config Has Error Handling",
    check: () => {
      const configPath = path.join(AGENTS_DIR, "context", "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const hasErrorHandling = content.toLowerCase().includes("error");
      return {
        passed: hasErrorHandling,
        details: hasErrorHandling ? "Error handling configured" : "Missing error config",
      };
    },
  },
  "C-006": {
    name: "Config Has Format Options",
    check: () => {
      const configPath = path.join(AGENTS_DIR, "context", "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const hasFormat =
        content.includes("json") && content.includes("markdown") && content.includes("hybrid");
      return {
        passed: hasFormat,
        details: hasFormat ? "Format options configured" : "Missing format options",
      };
    },
  },
  "C-007": {
    name: "Config Has Information Density",
    check: () => {
      const configPath = path.join(AGENTS_DIR, "context", "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const hasDensity =
        content.toLowerCase().includes("density") || content.toLowerCase().includes("compress");
      return {
        passed: hasDensity,
        details: hasDensity ? "Information density configured" : "Missing density config",
      };
    },
  },
  "C-008": {
    name: "Config Has Token Efficiency",
    check: () => {
      const configPath = path.join(AGENTS_DIR, "context", "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const hasEfficiency =
        content.toLowerCase().includes("token") && content.toLowerCase().includes("efficiency");
      return {
        passed: hasEfficiency,
        details: hasEfficiency ? "Token efficiency configured" : "Missing efficiency config",
      };
    },
  },
};

function main() {
  const args = process.argv.slice(2);
  const promptType = args[0] ?? "all";

  if (promptType === "all") {
    const allResults = [
      ...runTests(DO_WORK_TESTS, "Do-Work Prompt Tests"),
      ...runTests(PLAN_TESTS, "Plan Prompt Tests"),
      ...runTests(REVIEW_TESTS, "Review Prompt Tests"),
      ...runTests(CONTEXT_TESTS, "Context Management Tests"),
    ];
    printResults(allResults, "All Prompt Tests");
  } else if (promptType === "do-work") {
    printResults(runTests(DO_WORK_TESTS, "Do-Work Prompt Tests"), "Do-Work Prompt Tests");
  } else if (promptType === "plan") {
    printResults(runTests(PLAN_TESTS, "Plan Prompt Tests"), "Plan Prompt Tests");
  } else if (promptType === "review") {
    printResults(runTests(REVIEW_TESTS, "Review Prompt Tests"), "Review Prompt Tests");
  } else if (promptType === "context") {
    printResults(runTests(CONTEXT_TESTS, "Context Management Tests"), "Context Management Tests");
  } else {
    console.error(`Unknown prompt type: ${promptType}`);
    console.log("Available: all, do-work, plan, review, context");
    process.exit(1);
  }
}

main();

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const AGENTS_DIR = path.join(__dirname, "..", ".agents");
const PROMPTS_DIR = path.join(AGENTS_DIR, "prompts", "do-work");
const EVALS_DIR = path.join(AGENTS_DIR, "evals");
const HOOKS_DIR = path.join(AGENTS_DIR, "hooks");

const CATEGORIES = {
  clarity: ["TC-001", "TC-002"],
  enforceability: ["TC-003", "TC-004"],
  phase: ["TC-005", "TC-006", "TC-007"],
  "anti-pattern": ["TC-008", "TC-009", "TC-010"],
  config: ["TC-011", "TC-012"],
  hook: ["TC-013", "TC-014"],
};

const TESTS = {
  "TC-001": {
    name: "Unambiguous Instructions",
    check: (content) => {
      const ambiguous = ["should", "could", "might", "may"];
      const found = [];
      for (const word of ambiguous) {
        const regex = new RegExp(`\\b${word}\\b`, "gi");
        if (regex.test(content)) found.push(word);
      }
      return {
        passed: found.length === 0,
        details: found.length ? `Found: ${found.join(", ")}` : "All instructions are imperative",
      };
    },
  },
  "TC-002": {
    name: "File Path Resolution",
    check: (content) => {
      const relativePath = /\.\.\/|\.\//;
      const hasRelative = relativePath.test(content);
      return {
        passed: !hasRelative,
        details: hasRelative ? "Found relative paths" : "All paths are absolute",
      };
    },
  },
  "TC-003": {
    name: "Automatable Verification",
    check: () => {
      const verifyPath = path.join(PROMPTS_DIR, "phases", "verify.md");
      const verifyContent = fs.readFileSync(verifyPath, "utf-8");
      const hasLintCheck = /lint|typecheck/i.test(verifyContent);
      const hasTestCheck = /test|pass/i.test(verifyContent);
      return {
        passed: hasLintCheck && hasTestCheck,
        details:
          hasLintCheck && hasTestCheck
            ? "All verification steps are automatable"
            : "Some steps may not be automatable",
      };
    },
  },
  "TC-004": {
    name: "Clear Failure States",
    check: () => {
      const phases = ["explore", "implement", "verify", "commit"];
      let hasValidation = false;
      for (const phase of phases) {
        const phasePath = path.join(PROMPTS_DIR, "phases", `${phase}.md`);
        if (fs.existsSync(phasePath)) {
          const content = fs.readFileSync(phasePath, "utf-8");
          if (content.includes("Validation") || content.includes("[ ]")) {
            hasValidation = true;
          }
        }
      }
      return {
        passed: hasValidation,
        details: hasValidation ? "Phases have validation" : "No validation found",
      };
    },
  },
  "TC-005": {
    name: "TDD Loop Completeness",
    check: () => {
      const implPath = path.join(PROMPTS_DIR, "phases", "implement.md");
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
  "TC-006": {
    name: "Enforcement Loop",
    check: () => {
      const verifyPath = path.join(PROMPTS_DIR, "phases", "verify.md");
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
  "TC-007": {
    name: "Issue Linking Rules",
    check: () => {
      const commitPath = path.join(PROMPTS_DIR, "phases", "commit.md");
      const content = fs.readFileSync(commitPath, "utf-8");
      const hasRelates = content.includes("Relates to");
      const hasCompleted =
        content.includes("Fix") || content.includes("Close") || content.includes("Resolve");
      return {
        passed: hasRelates && hasCompleted,
        details:
          hasRelates && hasCompleted
            ? "WIP vs completed distinction present"
            : "Missing WIP/completed distinction",
      };
    },
  },
  "TC-008": {
    name: "No Deferral Language",
    check: () => {
      const antiPath = path.join(PROMPTS_DIR, "anti-patterns.md");
      const content = fs.readFileSync(antiPath, "utf-8");
      return {
        passed: content.includes("I'll fix it later"),
        details: content.includes("I'll fix it later")
          ? "Anti-pattern present"
          : "Missing anti-pattern",
      };
    },
  },
  "TC-009": {
    name: "Warning Handling",
    check: () => {
      const antiPath = path.join(PROMPTS_DIR, "anti-patterns.md");
      const content = fs.readFileSync(antiPath, "utf-8");
      return {
        passed: content.includes("warnings") && content.includes("failures"),
        details:
          content.includes("warnings") && content.includes("failures")
            ? "Warning rule present"
            : "Missing warning rule",
      };
    },
  },
  "TC-010": {
    name: "CI Authority",
    check: () => {
      const antiPath = path.join(PROMPTS_DIR, "anti-patterns.md");
      const content = fs.readFileSync(antiPath, "utf-8");
      return {
        passed: content.includes("CI") && content.includes("failed"),
        details:
          content.includes("CI") && content.includes("failed")
            ? "CI authority rule present"
            : "Missing CI rule",
      };
    },
  },
  "TC-011": {
    name: "Config Completeness",
    check: () => {
      const configPath = path.join(PROMPTS_DIR, "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const phases = ["explore", "implement", "verify", "commit"];
      const allHaveConfig = phases.every((p) => content.toLowerCase().includes(p));
      return {
        passed: allHaveConfig,
        details: allHaveConfig ? "All phases have config" : "Some phases lack config",
      };
    },
  },
  "TC-012": {
    name: "Default Safety",
    check: () => {
      const configPath = path.join(PROMPTS_DIR, "config.md");
      const content = fs.readFileSync(configPath, "utf-8");
      const safeDefaults = ["stop_on_failure", "run_browser_tests", "require_unit_tests"];
      const allSafe = safeDefaults.every((d) => content.includes(d) && content.includes("true"));
      return {
        passed: allSafe,
        details: allSafe ? "All defaults enforce quality" : "Some defaults may be too relaxed",
      };
    },
  },
  "TC-013": {
    name: "Pre-Phase Hook",
    check: () => {
      const mainPath = path.join(PROMPTS_DIR, "main.md");
      const content = fs.readFileSync(mainPath, "utf-8");
      return {
        passed: content.includes("pre-phase"),
        details: content.includes("pre-phase")
          ? "Pre-phase hook included"
          : "Missing pre-phase hook",
      };
    },
  },
  "TC-014": {
    name: "Post-Phase Hook",
    check: () => {
      const mainPath = path.join(PROMPTS_DIR, "main.md");
      const content = fs.readFileSync(mainPath, "utf-8");
      return {
        passed: content.includes("post-phase"),
        details: content.includes("post-phase")
          ? "Post-phase hook included"
          : "Missing post-phase hook",
      };
    },
  },
};

function runTests(testIds) {
  const results = [];
  for (const id of testIds) {
    const test = TESTS[id];
    if (!test) {
      console.error(`Unknown test: ${id}`);
      continue;
    }
    const result = test.check();
    results.push({ id, name: test.name, ...result });
  }
  return results;
}

function printResults(results, label = "Results") {
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

function main() {
  const args = process.argv.slice(2);
  const category = args[0];

  if (!category) {
    console.log("Running all tests...");
    const allTests = Object.keys(TESTS);
    const results = runTests(allTests);
    printResults(results, "All Tests");
    return;
  }

  const normalized = category.toLowerCase();
  if (CATEGORIES[normalized]) {
    console.log(`Running ${category} tests...`);
    const results = runTests(CATEGORIES[normalized]);
    printResults(results, `${category.charAt(0).toUpperCase() + category.slice(1)} Tests`);
    return;
  }

  if (TESTS[normalized.toUpperCase()]) {
    console.log(`Running ${normalized.toUpperCase()}...`);
    const results = runTests([normalized.toUpperCase()]);
    printResults(results, "Single Test");
    return;
  }

  console.error(`Unknown category: ${category}`);
  console.log("Available categories:", Object.keys(CATEGORIES).join(", "));
  process.exit(1);
}

main();

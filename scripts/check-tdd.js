#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ANTI_PATTERNS = [
  {
    name: "Direct DB queries in tests",
    pattern: /await\s+db\.query\(|await\s+db\.raw\(|knex\(/,
    description: "Direct DB queries bypass the public API - test through interfaces instead",
  },
  {
    name: "Testing private methods",
    pattern: /describe\(['"]#\w+|it\(['"][^'"]*private/,
    description: "Testing private methods couples tests to implementation",
  },
  {
    name: "Mocking external API then verifying call details",
    pattern: /vi\.mock\(.*external|jest\.mock\(.*external/,
    description:
      "Mocking external APIs (K8s, GitHub, Docker) and then verifying call details couples to implementation",
  },
];

function findTestFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      !entry.name.includes("node_modules")
    ) {
      findTestFiles(fullPath, files);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts"))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const issues = [];

  for (const antiPattern of ANTI_PATTERNS) {
    if (antiPattern.pattern.test(content)) {
      issues.push({
        file: filePath,
        rule: antiPattern.name,
        description: antiPattern.description,
      });
    }
  }

  return issues;
}

function main() {
  const srcDir = process.argv[2] || path.join(__dirname, "..", "apps", "api", "src");
  const testFiles = findTestFiles(srcDir);

  let allIssues = [];

  for (const file of testFiles) {
    const issues = checkFile(file);
    allIssues = allIssues.concat(issues);
  }

  if (allIssues.length > 0) {
    console.log("\n❌ TDD Violations Found:\n");

    for (const issue of allIssues) {
      console.log(`  ${issue.file}`);
      console.log(`    Rule: ${issue.rule}`);
      console.log(`    ${issue.description}\n`);
    }

    console.log(`Total: ${allIssues.length} violation(s)`);
    process.exit(1);
  } else {
    console.log("✅ TDD Checks Passed");
    process.exit(0);
  }
}

main();

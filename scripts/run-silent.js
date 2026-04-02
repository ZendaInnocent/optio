#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");

const COLORS = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

const isVerbose = process.env.VERBOSE === "1";

function printSuccess(description, testCount = null) {
  const testInfo = testCount ? ` (${testCount} tests)` : "";
  console.log(`${COLORS.green}✓${COLORS.reset} ${description}${testInfo}`);
}

function printFailure(description, output) {
  console.log(`${COLORS.red}✗${COLORS.reset} ${description}`);
  console.log(output);
}

function extractVitestCount(output) {
  const match = output.match(/(\d+) passed/);
  if (match) {
    const durationMatch = output.match(/(\d+\.?\d*s)/);
    const duration = durationMatch ? `, ${durationMatch[1]}` : "";
    return `${match[1]}${duration}`;
  }
  return null;
}

function extractPytestCount(output) {
  const match = output.match(/(\d+) passed/);
  if (match) {
    const durationMatch = output.match(/(\d+\.?\d*s)/);
    const duration = durationMatch ? `, ${durationMatch[1]}` : "";
    return `${match[1]}${duration}`;
  }
  return null;
}

function extractTestCount(output, framework) {
  switch (framework) {
    case "vitest":
      return extractVitestCount(output);
    case "pytest":
      return extractPytestCount(output);
    default:
      return null;
  }
}

function detectFramework(command) {
  if (command.includes("vitest")) return "vitest";
  if (command.includes("pytest") || command.includes("pytest")) return "pytest";
  if (command.includes("jest")) return "jest";
  if (command.includes("go test")) return "go";
  return null;
}

function runSilent(description, command, options = {}) {
  return new Promise((resolve) => {
    const isShell = process.platform === "win32" ? "cmd" : "shell";
    const shellCmd = process.platform === "win32" ? "/c" : "-c";

    const child = spawn(isShell, [shellCmd, command], {
      stdio: "pipe",
      cwd: options.cwd || process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const output = stdout + stderr;
      const framework = options.framework || detectFramework(command);

      if (isVerbose) {
        console.log(`  → Running: ${command}`);
        if (code === 0) {
          printSuccess(description, extractTestCount(output, framework));
        } else {
          printFailure(description, output);
        }
        process.exit(code);
      }

      if (code === 0) {
        printSuccess(description, extractTestCount(output, framework));
        resolve(0);
      } else {
        printFailure(description, output);
        resolve(code);
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: node run-silent.js <description> <command> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --framework=vitest|pytest|jest|go  Force test framework detection");
    console.log("  --cwd=<path>                         Working directory");
    console.log("");
    console.log("Environment:");
    console.log("  VERBOSE=1   Show all output");
    console.log("");
    console.log("Examples:");
    console.log('  node run-silent.js "lint" "pnpm lint"');
    console.log(
      '  node run-silent.js "API tests" "pnpm --filter @optio/api test" --framework=vitest',
    );
    console.log('  VERBOSE=1 node run-silent.js "test" "pnpm test"');
    process.exit(1);
  }

  const description = args[0];
  const command = args[1];

  const options = {};
  for (const arg of args.slice(2)) {
    if (arg.startsWith("--framework=")) {
      options.framework = arg.split("=")[1];
    } else if (arg.startsWith("--cwd=")) {
      options.cwd = arg.split("=")[1];
    }
  }

  const exitCode = await runSilent(description, command, options);
  process.exit(exitCode);
}

main();

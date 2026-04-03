import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Migration Registry", () => {
  it("all SQL migration files are registered in _journal.json", () => {
    const migrationsDir = path.join(__dirname, "migrations");
    const journalPath = path.join(migrationsDir, "meta", "_journal.json");

    // Read journal
    const journalContent = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const registeredTags = new Set(journalContent.entries.map((e: { tag: string }) => e.tag));

    // Find all SQL migration files
    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(".sql", ""))
      .sort();

    // Check each SQL file is registered
    const missing = sqlFiles.filter((tag) => !registeredTags.has(tag));

    expect(missing).toEqual([]);
  });

  it("journal entries match existing SQL files", () => {
    const migrationsDir = path.join(__dirname, "migrations");
    const journalPath = path.join(migrationsDir, "meta", "_journal.json");

    const journalContent = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const registeredTags = journalContent.entries.map((e: { tag: string }) => e.tag);

    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(".sql", ""))
      .sort();

    const orphaned = registeredTags.filter((tag: string) => !sqlFiles.includes(tag));

    expect(orphaned).toEqual([]);
  });

  it("migration numbers are sequential without gaps", () => {
    const migrationsDir = path.join(__dirname, "migrations");
    const sqlFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    const numbers = sqlFiles
      .map((f) => parseInt(f.split("_")[0].replace(/^0+/, ""), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    if (numbers.length === 0) return;

    const min = numbers[0];
    const max = numbers[numbers.length - 1];
    const expected = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    expect(numbers).toEqual(expected);
  });
});

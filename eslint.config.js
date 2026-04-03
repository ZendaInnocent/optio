import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import maxExports from "./eslint-rules/max-exports.js";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.turbo/**", "**/helm/**"],
  },
  {
    plugins: { "max-exports": { rules: { "max-exports": maxExports } } },
  },
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "routes", pattern: "apps/api/src/routes/**" },
        { type: "services", pattern: "apps/api/src/services/**" },
        { type: "workers", pattern: "apps/api/src/workers/**" },
        { type: "lib", pattern: "apps/api/src/lib/**" },
        { type: "db", pattern: "apps/api/src/db/**" },
      ],
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ["apps/api/src/services/**/*.ts"],
    rules: {
      "boundaries/element-types": [
        "warn",
        {
          default: "disallow",
          rules: [{ from: "services", allow: ["db", "lib", "shared"] }],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/routes/**/*.ts"],
    rules: {
      "boundaries/element-types": [
        "warn",
        {
          default: "disallow",
          rules: [{ from: "routes", allow: ["services", "db", "lib", "shared"] }],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/workers/**/*.ts"],
    rules: {
      "boundaries/element-types": [
        "warn",
        {
          default: "disallow",
          rules: [{ from: "workers", allow: ["services", "db", "lib", "shared"] }],
        },
      ],
    },
  },
  {
    rules: {
      "max-exports/max-exports": ["warn", { max: 8 }],
      "@typescript-eslint/triple-slash-reference": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "warn",
    },
  },
);

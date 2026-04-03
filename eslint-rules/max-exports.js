const { AST_NODE_TYPES } = require("@typescript-eslint/utils");

const DEFAULT_MAX_EXPORTS = 10;

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce maximum number of exports per file to promote deep modules",
    },
    messages: {
      tooManyExports: "File has {{ count }} exports, which exceeds the maximum of {{ max }}.",
    },
    schema: [
      {
        type: "object",
        properties: {
          max: {
            type: "number",
            default: DEFAULT_MAX_EXPORTS,
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const maxExports = context.options[0]?.max ?? DEFAULT_MAX_EXPORTS;
    let exportCount = 0;

    return {
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          if (node.declaration.type === AST_NODE_TYPES.VariableDeclaration) {
            exportCount += node.declaration.declarations.length;
          } else {
            exportCount += 1;
          }
        }
        if (node.specifiers?.length) {
          exportCount += node.specifiers.length;
        }
      },
      ExportDefaultDeclaration() {
        exportCount += 1;
      },
      "Program:exit"(node) {
        if (exportCount > maxExports) {
          context.report({
            node,
            messageId: "tooManyExports",
            data: { count: exportCount, max: maxExports },
          });
        }
      },
    };
  },
};

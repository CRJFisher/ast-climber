import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import fs from "fs";
import path from "path";
import { LanguageConfig } from "../../types";
import { extract_jsdoc_context } from "../shared_extractors";

function initialize_parser(): Parser {
  const parser = new Parser();
  // We use `as any` here to bypass a type mismatch caused by
  // the peer dependency conflict between tree-sitter and tree-sitter-typescript.
  // Use tsx language which includes TypeScript + JSX support
  parser.setLanguage(TypeScript.tsx as any);

  // Set a reasonable timeout (default is very low)
  parser.setTimeoutMicros(5000000); // 5 seconds

  return parser;
}

// Try multiple paths to find the scopes.scm file
function get_scope_query(): string {
  const possible_paths = [
    // When running from compiled dist/
    path.join(__dirname, "scopes.scm"),
    // When running from source during tests
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "src",
      "languages",
      "typescript",
      "scopes.scm"
    ),
    // Direct source path (for Jest tests)
    path.join(process.cwd(), "src", "languages", "typescript", "scopes.scm"),
    // Alternative source path for different working directories
    path.resolve(__dirname, "scopes.scm"),
    path.resolve(__dirname, "../../../src/languages/typescript/scopes.scm"),
    // Dist path
    path.join(process.cwd(), "dist", "languages", "typescript", "scopes.scm"),
  ];

  for (const p of possible_paths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf8");
      }
    } catch (e) {
      // Continue to next path
    }
  }

  // Final attempt: look for scopes.scm in the same directory as this file's source
  const sourceDir = path.dirname(__filename.replace(/\.js$/, ".ts"));
  const sourcePath = path.join(sourceDir, "scopes.scm");
  try {
    if (fs.existsSync(sourcePath)) {
      return fs.readFileSync(sourcePath, "utf8");
    }
  } catch (e) {
    // Ignore
  }

  throw new Error(
    `Could not find scopes.scm for TypeScript. Tried paths: ${possible_paths.join(
      ", "
    )}`
  );
}


export const typescript_config: LanguageConfig = {
  name: "typescript",
  file_extensions: ["ts", "tsx"],
  parser: initialize_parser(),
  scope_query: get_scope_query(),
  namespaces: [
    [
      // functions
      "function",
      "generator",
      "method",
      "class",
      "interface",
      "enum",
      "alias",
    ],
    [
      // variables
      "variable",
      "constant",
      "parameter",
      "property",
      "enumerator",
      "label",
    ],
  ],
  extract_context: extract_jsdoc_context,
};

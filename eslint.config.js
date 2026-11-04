import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/src-tauri/target/**",
      "**/src-tauri/gen/**",
      "**/*.config.*",
      "packages/renderer/out/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The Figma plugin runs in Figma's sandbox, where `figma` and `__html__` are globals.
    files: ["packages/figma-plugin/**/*.js"],
    languageOptions: { globals: { figma: "readonly", __html__: "readonly" } },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);

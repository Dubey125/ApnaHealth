import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The leading-underscore convention, made real.
    //
    // Server actions used with useActionState must accept (prevState,
    // formData) whether or not they read them, and this codebase already
    // marks the unused ones with a leading underscore. Without this the
    // rule only happened to stay quiet when a LATER argument was used
    // ("args: after-used"), so an action that used neither suddenly warned
    // for following the same convention as every action around it.
    //
    // This configures the convention rather than disabling the rule:
    // an unused argument with no underscore is still an error.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Plain-CommonJS operator scripts. These are run directly by node
    // (never bundled, never imported by the app), so require() is the
    // correct call there and the TypeScript-oriented rule that forbids it
    // does not apply.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;

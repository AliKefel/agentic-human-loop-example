import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // `const { secret: _s, ...rest } = x` is the idiomatic way to omit a key.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local agent/SDD scratch files.
    ".superpowers/**",
    // shadcn-generated; kept verbatim so `shadcn add` can update it.
    "hooks/use-mobile.ts",
  ]),
]);

export default eslintConfig;

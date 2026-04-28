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
    rules: {
      // React Compiler rules that flag valid, intentional React patterns:
      // - setMounted(true) hydration guards
      // - syncing state from props when not dragging/resizing
      // - resetting state on navigation/dependency change
      "react-hooks/set-state-in-effect": "off",
      // Reading/writing refs during render is valid for previous-value tracking
      "react-hooks/refs": "off",
      // window.location.href assignment in event handlers is valid
      "react-hooks/immutability": "off",
      // react-hook-form watch() incompatibility with React Compiler memoization
      "react-hooks/incompatible-library": "off",
    },
  },
]);

export default eslintConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler disabled: when enabled it causes two bugs in dev mode:
  //   1. "Performance.measure: end cannot be negative" — Compiler transforms
  //      component render functions in ways that corrupt Turbopack's performance
  //      timeline, resulting in negative end timestamps.
  //   2. Slash menu re-entrancy — Compiler processes effects (useEffect calls)
  //      synchronously during ReactRenderer construction, which re-enters the
  //      TipTap suggestion lifecycle mid-execution and nulls shared closure vars.
  // Re-enable only after upgrading to a Next.js version where this is fixed.
  reactCompiler: false,
};

export default nextConfig;

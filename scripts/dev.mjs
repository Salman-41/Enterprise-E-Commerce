import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
// Load local configuration once and propagate to all apps. Production uses platform environment.
if (existsSync(".env"))
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
const child = spawn("pnpm", ["exec", "turbo", "run", "dev"], {
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));

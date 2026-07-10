const { spawnSync } = require("child_process");
const path = require("path");

const SKIP_FLAGS = new Set([
  "--skip-minter",
  "--skip-limits",
  "--skip-wire",
  "--skip-adapter-ownership",
]);

const args = process.argv.slice(2);
const hardhatArgs = [];
const env = { ...process.env };

for (const arg of args) {
  if (SKIP_FLAGS.has(arg)) {
    const key = arg.slice(2).toUpperCase().replace(/-/g, "_");
    env[key] = "1";
  } else {
    hardhatArgs.push(arg);
  }
}

const result = spawnSync(
  "npx",
  ["hardhat", "run", "scripts/oft/configure-oft.ts", ...hardhatArgs],
  {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "inherit",
    env,
  }
);

process.exit(result.status ?? 1);

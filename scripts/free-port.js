/**
 * Windows: kills processes in LISTENING state on a TCP port (e.g. 3000).
 * Run: node scripts/free-port.js 3000
 */
const { execSync } = require("child_process");

if (process.platform !== "win32") {
  process.exit(0);
}

const port = process.argv[2] || "3000";
const suffix = `:${port}`;

try {
  const out = execSync("netstat -ano", { encoding: "utf8" });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    if (!line.includes(suffix)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
    } catch {
      /* ignore */
    }
  }
} catch {
  /* netstat missing or no listeners */
}

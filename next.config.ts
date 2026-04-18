import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.dirname(fileURLToPath(import.meta.url));

const pkgPath = path.join(root, "package.json");
const appVersion = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  outputFileTracingRoot: root,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion.version,
  },
};

export default nextConfig;

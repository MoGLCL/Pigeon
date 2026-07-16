import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "Out");
const variants = {
  "Pigeon-Windows-Local": { docker: false, overlay: "windows" },
  "Pigeon-Linux-Docker": { docker: true, overlay: "docker" },
  "Pigeon-Private-Hosting": { docker: true, overlay: "private" },
};
const common = [
  "app", "components", "config", "docs", "features", "generated", "lib", "packaging", "prisma", "public", "scripts", "server", "tests",
  ".env.example", ".gitignore", "auth.ts", "middleware.ts", "next-env.d.ts", "next.config.ts", "package.json", "package-lock.json", "prisma.config.ts", "README.md", "server.ts", "tsconfig.json", "vitest.config.ts",
];
const dockerFiles = [".dockerignore", "Dockerfile", "docker-compose.yml"];

if (!out.startsWith(`${root}\\`) && !out.startsWith(`${root}/`)) throw new Error("Unsafe output directory");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const [name, options] of Object.entries(variants)) {
  const destination = join(out, name);
  await mkdir(destination, { recursive: true });
  for (const item of [...common, ...(options.docker ? dockerFiles : [])])
    await cp(join(root, item), join(destination, item), { recursive: true });
  await cp(join(root, "packaging", options.overlay), destination, { recursive: true });
}
await cp(join(root, "docs"), join(out, "Docs"), { recursive: true });
await writeFile(join(out, "README.md"), await readFile(join(root, "packaging", "OUT-README.md"), "utf8"), "utf8");
console.log(`Created ${Object.keys(variants).length} clean Pigeon source distributions in ${out}`);

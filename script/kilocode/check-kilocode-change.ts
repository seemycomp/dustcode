import path from "node:path"

const root = path.resolve(import.meta.dir, "../../packages/kilo-vscode")
const bad: string[] = []
for await (const file of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true })) {
  const rel = file.replaceAll("\\", "/")
  if (rel.startsWith("node_modules/") || rel.startsWith("dist/") || rel.startsWith("bin/") || rel.startsWith("out/")) continue
  if (rel.endsWith(".md") || rel === "AGENTS.md" || rel === "package.json") continue
  if ((await Bun.file(path.join(root, file)).text()).includes("kilocode_change")) bad.push(file)
}
if (bad.length) {
  console.error(bad.join("\n"))
  process.exit(1)
}

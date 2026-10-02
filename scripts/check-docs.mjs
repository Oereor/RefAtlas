import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)))
    else if (entry.name.endsWith('.md')) files.push(path)
  }
  return files
}
const files = [
  resolve(root, 'README.md'),
  resolve(root, 'AGENTS.md'),
  ...(await markdownFiles(resolve(root, 'docs'))),
]
const failures = []
for (const file of files) {
  const content = await readFile(file, 'utf8')
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const link = match[1].replace(/^<|>$/g, '')
    if (/^(?:https?:|mailto:)/.test(link)) continue
    const [relative, fragment] = link.split('#')
    const target = relative ? resolve(dirname(file), decodeURIComponent(relative)) : file
    if (
      !(await stat(target).then(
        () => true,
        () => false,
      ))
    ) {
      failures.push(file + ' -> ' + link)
      continue
    }
    if (fragment && target.endsWith('.md')) {
      const headings = (await readFile(target, 'utf8'))
        .split(/\r?\n/)
        .filter((line) => /^#{1,6} /.test(line))
        .map((line) =>
          line
            .replace(/^#+ /, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\p{M}_ -]/gu, '')
            .replace(/ /g, '-'),
        )
      if (!headings.includes(decodeURIComponent(fragment)))
        failures.push(file + ' -> missing anchor ' + link)
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('checked ' + files.length + ' Markdown documents and local anchors')

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const toolRoot = path.dirname(fileURLToPath(import.meta.url));
export const workspaceRoot = path.resolve(toolRoot, '../../..');
export const dataRoot = path.join(workspaceRoot, 'TurnBasedGameData');
export const artifactsRoot = path.join(toolRoot, 'artifacts');
export const samples = [
  'ExcelOutput/AvatarConfig.json', 'ExcelOutput/EquipmentConfig.json',
  'ExcelOutput/RelicConfig.json', 'ExcelOutput/MonsterConfig.json',
  'ExcelOutput/MonsterSkillConfig.json', 'ExcelOutput/AvatarMazeBuff.json',
  'ExcelOutput/ChallengeMazeConfig.json', 'ExcelOutput/ChallengePeakConfig.json',
  'ExcelOutput/AvatarSkillConfig.json', 'ExcelOutput/StageConfig.json',
  'ExcelOutput/SpecialAvatarRelicMainValue.json', 'TextMap/TextMapCHS.json',
  'TextMap/TextMapVI.json', 'Config/LevelOutput_Baked/Floor/P10401_F10401001_Baked.json',
  'Config/SoundBankLookUp.json'
];
export const benchmarkSamples = samples.filter(name => /MonsterConfig|AvatarSkillConfig|StageConfig|SpecialAvatarRelicMainValue|TextMap/.test(name));

export function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function sourcePath(relative) {
  const candidate = path.resolve(dataRoot, relative);
  if (!inside(dataRoot, candidate) || !inside(fs.realpathSync(dataRoot), fs.realpathSync(candidate))) {
    throw new Error('输入路径必须位于只读数据目录内');
  }
  return candidate;
}

export function artifactPath(relative) {
  const candidate = path.resolve(artifactsRoot, relative);
  if (!inside(artifactsRoot, candidate)) throw new Error('输出路径必须位于隔离产物目录内');
  let ancestor = path.dirname(candidate);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!inside(fs.realpathSync(toolRoot), fs.realpathSync(ancestor))) throw new Error('输出目录不能通过链接逃逸');
  if (fs.existsSync(candidate) && !inside(fs.realpathSync(artifactsRoot), fs.realpathSync(candidate))) {
    throw new Error('输出文件不能通过链接逃逸');
  }
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  return candidate;
}

export function writeArtifact(name, value) {
  fs.writeFileSync(artifactPath(name), JSON.stringify(value, null, 2) + '\n');
}

export function gitState() {
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${dataRoot.replaceAll('\\', '/')}`, '-C', dataRoot, ...args], { encoding: 'utf8' }).trim();
  return { head: git('rev-parse', 'HEAD'), status: git('status', '--porcelain=v1'), diff: git('diff', '--stat') };
}

export function environment() {
  return { date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), platform: os.platform(), release: os.release(), arch: os.arch(),
    cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(),
    availableMemoryBytes: os.freemem(), node: process.versions.node, v8: process.versions.v8,
    executable: process.execPath, workspace: workspaceRoot };
}

export async function hashFile(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export function removeArtifact(filename) {
  const resolved = path.resolve(filename);
  if (!inside(artifactsRoot, resolved) || !inside(fs.realpathSync(artifactsRoot), fs.realpathSync(resolved))) {
    throw new Error('只能移除隔离目录内的实验文件');
  }
  fs.unlinkSync(resolved);
}

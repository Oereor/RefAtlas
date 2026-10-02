import fs from 'node:fs';
import { samples, sourcePath, writeArtifact } from './common.mjs';
import { collectRecords } from './streaming.mjs';

const rows = {};
for (const name of samples.filter(name => name.startsWith('ExcelOutput/'))) {
  rows[name] = (await collectRecords(sourcePath(name), 'array', 100000)).map(record => record.value);
}
const skills = rows['ExcelOutput/AvatarSkillConfig.json'];
const byId = new Map();
for (const skill of skills) {
  const levels = byId.get(skill.SkillID) ?? [];
  levels.push(skill.Level);
  byId.set(skill.SkillID, levels);
}
const avatar = rows['ExcelOutput/AvatarConfig.json'][0];
const skill = skills.find(record => record.SkillID === avatar.SkillList[0]);
const texts = (await collectRecords(sourcePath('TextMap/TextMapCHS.json'), 'object', 500000));
const textByHash = new Map(texts.map(record => [record.key, record.value]));
const result = {
  classification: '仅事实和候选，不生成 Dataset Contract 或关系规则',
  skills: { rows: skills.length, distinctSkillIds: byId.size,
    compoundUnique: new Set(skills.map(record => record.SkillID + ':' + record.Level)).size,
    duplicateIdExamples: [...byId.entries()].filter(([, levels]) => levels.length > 1).slice(0, 3) },
  avatarExample: { address: '/0', AvatarID: avatar.AvatarID, AvatarName: avatar.AvatarName,
    SkillList: avatar.SkillList, RankIDList: avatar.RankIDList, JsonPath: avatar.JsonPath,
    pathExists: fs.existsSync(sourcePath(avatar.JsonPath)), matchingNameText: textByHash.get(avatar.AvatarName.Hash),
    candidateSkill: skill ? { SkillID: skill.SkillID, Level: skill.Level } : null },
  domainExamples: Object.fromEntries(Object.entries(rows).map(([name, records]) => [name, records[0]]))
};
writeArtifact('references.json', result);
console.log(JSON.stringify({ skills: result.skills, avatarExample: result.avatarExample }, null, 2));

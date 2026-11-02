// One-time provenance-preserving import of SVG text explicitly supplied by the user.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/ingest-sources.cjs <attachments-directory>');
const records = [
  ['5191788d-f054-4ad6-970b-528facec2c18', 'book', 'Книга', 'main'],
  ['69c0124f-0354-4483-82ab-3d424aa07f6b', 'phone', 'Телефон', 'main'],
  ['92793c23-ce0a-40fd-88a9-c6bbff638271', 'puzzle', 'Пазлы', 'main'],
  ['26c1177c-47e8-4501-95a9-7df66a8956e3', 'coin', 'Монета', 'main'],
  ['93278cc7-9b35-4924-8665-e5e17eee949e', 'headphones', 'Наушники', 'main'],
  ['29184d44-7d45-42d0-a3a8-a4e3f3126b57', 'lamp', 'Лампа', 'main'],
  ['77163406-9224-4d8d-91e6-27727efa0c44', 'flowers', 'Цветы', 'main'],
  ['1494148e-3177-4af0-a59a-03bbc4ec2dd6', 'wallet', 'Кошелек', 'main'],
  ['53d9f372-8d54-4c74-955f-8d3c134279dd', 'folder', 'Папка', 'main'],
  ['6f1a4cc5-ca89-4b03-9a81-99242ca3a56f', 'folder', 'Папка', 'main'],
  ['5c985132-3c1d-4573-8151-cfec8deef57a', 'book', 'Книга', 'background'],
  ['4485dcaa-4663-407f-a222-cb0544de70bb', 'phone', 'Телефон', 'background'],
  ['c03fd17e-de23-43ec-b7e8-e4791ee7c6e9', 'puzzle', 'Пазлы', 'background'],
  ['e77f7e93-fd51-4b70-b688-2b32af48652c', 'coin', 'Монета', 'background'],
  ['e3db4280-600a-45d7-96e3-3180cc7db9e3', 'headphones', 'Наушники', 'background'],
  ['de2e99bb-f398-40af-9612-f52412142575', 'lamp', 'Лампа', 'background'],
  ['230bb202-753c-4c56-a77e-82dbddadab5a', 'flowers', 'Цветы', 'background'],
  ['ddd13b36-095d-46f4-8c73-f5afe0bbee65', 'flowers', 'Цветы', 'background'],
  ['f12310a0-48db-44c7-863e-e6b23a8259af', 'folder', 'Папка', 'background'],
  ['22427559-c05a-4690-b542-526bb3fb34e8', 'pen', 'Ручка', 'background'],
  ['dbfff3ad-980d-46b2-a3bf-ce04e01a61dd', 'pen', 'Ручка', 'main'],
  ['b9a24759-8e6a-4f2a-a463-798aa5d6701c', 'wallet', 'Кошелек', 'background'],
  ['72c1d529-af31-4bb4-8214-8aaaed09538c', 'book', 'Книга', 'main', 'S'],
  ['cdf161e7-3e72-4f63-a047-2c6f650ad4d7', 'phone', 'Телефон', 'main', 'S'],
  ['56153235-10d3-4ce7-a426-857f115063a0', 'puzzle', 'Пазлы', 'main', 'S'],
  ['4536235a-adef-4d64-8351-e2cbff3aca4d', 'coin', 'Монета', 'main', 'S'],
  ['83a6a354-3d5f-4e27-99d0-3e817079d4a5', 'headphones', 'Наушники', 'main', 'S'],
  ['fc949d5b-f70e-4199-9c5f-a4c3c22038fa', 'headphones', 'Наушники', 'main', 'S'],
  ['c74647d8-528e-4dc0-9df0-4fa75e00f1fd', 'flowers', 'Цветы', 'main', 'S'],
  ['c38725a3-3b57-4bcf-8d2b-3143d1a5b996', 'lamp', 'Лампа', 'main', 'S'],
  ['1d294266-e1e9-4df8-8106-851b4eddc42f', 'wallet', 'Кошелек', 'main', 'S'],
  ['432007dc-e7e9-42d1-acfd-d9e5f579a3cc', 'folder', 'Папка', 'main', 'S'],
  ['0736e9da-530a-47a0-83ec-230b08b7c43f', 'pen', 'Ручка', 'main', 'S'],
  ['c278f08f-522f-4811-9478-da1d049fdad6', 'book', 'Книга', 'background', 'S'],
  ['791c5a46-794f-4cb9-8c14-ee0167364389', 'phone', 'Телефон', 'background', 'S'],
  ['d7f09b55-7cff-47bf-a50d-4a412c0ddb05', 'puzzle', 'Пазлы', 'background', 'S'],
  ['1bbe1667-fb8b-4704-b3c8-6309b7e92953', 'coin', 'Монета', 'background', 'S'],
  ['ca83f84f-ecee-47af-8b7b-4da8498491bc', 'headphones', 'Наушники', 'background', 'S'],
  ['af1ed113-c6c0-40be-b015-828c37c9092d', 'lamp', 'Лампа', 'background', 'S'],
  ['e0f1c444-1e8d-4a1e-bf20-96902215722f', 'flowers', 'Цветы', 'background', 'S'],
  ['67d92ef5-a5c8-4fe0-a9be-9f5c7e8ace2f', 'wallet', 'Кошелек', 'background', 'S'],
  ['bd29a02c-e571-45d9-a46b-74b553512321', 'folder', 'Папка', 'background', 'S'],
  ['5a956849-ef30-444b-8171-03f930353994', 'pen', 'Ручка', 'background', 'S'],
];
const out = path.join(root, 'assets/figma/svg');
fs.mkdirSync(out, { recursive: true });
const manifest = [];
const hashes = new Map();
for (const [attachment, family, name, role, detail = 'L'] of records) {
  const source = fs.readFileSync(path.join(input, attachment, 'Вставленный текст.txt'));
  const sha256 = crypto.createHash('sha256').update(source).digest('hex');
  if (hashes.has(sha256)) {
    manifest.push({ attachment, sha256, duplicateOf: hashes.get(sha256) });
    continue;
  }
  const file = `${detail}/${family}-${role}.svg`;
  hashes.set(sha256, file);
  fs.mkdirSync(path.join(out, detail), { recursive: true });
  fs.writeFileSync(path.join(out, file), source);
  manifest.push({ attachment, file, family, name, role, detail, sha256 });
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(
  `Saved ${hashes.size} unique originals; ${records.length - hashes.size} exact duplicates recorded.`,
);

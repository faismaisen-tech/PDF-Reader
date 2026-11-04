// تشغيل:  node build.js
// يكتب قائمة الملفات في sw.js ويحدّث رقم الإصدار حتى يتحدّث الكاش عند كل تعديل.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname;
const skip = new Set(['downloads', 'sw.js', 'build.js', 'README.md', '.git', '.github', 'node_modules', 'package.json', 'package-lock.json', '.nojekyll']);
const list = [];
(function walk(d) {
  for (const n of fs.readdirSync(d).sort()) {
    if (skip.has(n)) continue;
    const p = path.join(d, n);
    fs.statSync(p).isDirectory() ? walk(p) : list.push('./' + path.relative(root, p).split(path.sep).join('/'));
  }
})(root);
const h = crypto.createHash('sha1');
list.forEach((f) => h.update(f).update(fs.readFileSync(path.join(root, f))));
const ver = 'v' + h.digest('hex').slice(0, 10);
let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${ver}';`)
       .replace(/\/\*LIST_START\*\/[\s\S]*?\/\*LIST_END\*\//, `/*LIST_START*/\n  './',\n  ${list.map((f) => JSON.stringify(f)).join(',\n  ')}\n  /*LIST_END*/`);
fs.writeFileSync(path.join(root, 'sw.js'), sw);
console.log(`OK: ${list.length} ملف في الكاش — الإصدار ${ver}`);

const fs = require('fs');
const path = 'src/lib/recalculationService.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace("        estimateItems = Object.keys(val).map(k => ({ id: k, ...val[k] }));\n      }", "        estimateItems = Object.keys(val).map(k => ({ id: k, ...val[k] }));");
fs.writeFileSync(path, content);

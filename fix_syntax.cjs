const fs = require('fs');
let code = fs.readFileSync('src/lib/firebaseService.ts', 'utf8');

code = code.replace(/return null;\n    }\n  }\n  \},\n  fetchLichSu/g, "return null;\n    }\n  },\n  fetchLichSu");
fs.writeFileSync('src/lib/firebaseService.ts', code);

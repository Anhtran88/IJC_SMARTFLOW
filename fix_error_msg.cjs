const fs = require('fs');
let content = fs.readFileSync('src/lib/rtdbToFirestoreMigration.ts', 'utf8');

content = content.replace(
  "nodeReport.errors.push(e.message);",
  "if (e.message.includes('Missing or insufficient permissions')) {\n            nodeReport.errors.push('Lỗi quyền (Rules): Thiếu quyền ghi/đọc collection. Hãy thêm rule cho ' + col + ' trong Firebase Console.');\n          } else {\n            nodeReport.errors.push(e.message);\n          }"
);

content = content.replace(
  "nodeReport.errors.push(e.message);",
  "if (e.message.includes('Missing or insufficient permissions')) {\n        nodeReport.errors.push('Lỗi quyền (Rules): Thiếu quyền ghi/đọc. Hãy cập nhật firestore.rules cho ' + col);\n      } else {\n        nodeReport.errors.push(e.message);\n      }"
);


fs.writeFileSync('src/lib/rtdbToFirestoreMigration.ts', content);

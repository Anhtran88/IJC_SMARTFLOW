const fs = require('fs');
const path = 'src/components/RtdbToFirestoreMigrationTool.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/Công cụ Migration Dữ liệu \(Cloud Firestore → Realtime Database\)/g, 'CÔNG CỤ MIGRATION DỮ LIỆU (REALTIME DATABASE → CLOUD FIRESTORE)');
content = content.replace(/Công cụ quét toàn bộ 20 phân hệ dữ liệu trên Realtime Database/g, 'Công cụ quét toàn bộ 5 phân hệ dữ liệu trên Realtime Database');

fs.writeFileSync(path, content);

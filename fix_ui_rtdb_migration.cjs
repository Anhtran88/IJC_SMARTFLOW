const fs = require('fs');

const path = 'src/components/RtdbToFirestoreMigrationTool.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/FirestoreMigrationTool/g, 'RtdbToFirestoreMigrationTool');
content = content.replace(/Firestore -> RTDB/g, 'RTDB -> Firestore');
content = content.replace(/runFirestoreToRtdbMigration/g, 'runRtdbToFirestoreMigration');
content = content.replace(/FIRESTORE \u2192 REALTIME DATABASE/g, 'REALTIME DATABASE \u2192 CLOUD FIRESTORE');
content = content.replace(/Cloud Firestore, sao l\u01B0u RTDB/g, 'Realtime Database, sao l\u01B0u Firestore');
content = content.replace(/chuy\u1EC3n \u0111\u1ED5i sang Realtime Database/g, 'chuy\u1EC3n \u0111\u1ED5i sang Cloud Firestore');
content = content.replace(/sao l\u01B0u to\u00E0n b\u1ED9 d\u1EEF li\u1EC7u RTDB tr\u01B0\u1EDBc khi ghi/g, 'sao l\u01B0u to\u00E0n b\u1ED9 d\u1EEF li\u1EC7u Firestore tr\u01B0\u1EDBc khi ghi');
content = content.replace(/Firestore v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF nguy\u00EAn 100% \u0111\u1EC3 ph\u1EE5c v\u1EE5 Rollback n\u1EBFu c\u1EA7n/g, 'RTDB v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF nguy\u00EAn 100% \u0111\u1EC3 ph\u1EE5c v\u1EE5 Rollback n\u1EBFu c\u1EA7n');
content = content.replace(/Kh\u1EDFi t\u1EA1o Migration Firestore \u2192 RTDB/g, 'Kh\u1EDFi t\u1EA1o Migration RTDB \u2192 Firestore');
content = content.replace(/D\u1EEF li\u1EC7u Firestore c\u0169 \u0111\u01B0\u1EE3c gi\u1EEF nguy\u00EAn/g, 'D\u1EEF li\u1EC7u RTDB c\u0169 \u0111\u01B0\u1EE3c gi\u1EEF nguy\u00EAn');
content = content.replace(/Tổng bản ghi Firestore/g, 'Tổng bản ghi RTDB');
content = content.replace(/Trạng thái Storage Engine/g, 'Trạng thái Storage Engine');
content = content.replace(/RTDB ACTIVE 100%/g, 'FIRESTORE ACTIVE 100%');
content = content.replace(/Firestore Count/g, 'RTDB Count');
content = content.replace(/RTDB Tr\u01B0\u1EDBc/g, 'Firestore Trước');
content = content.replace(/RTDB Sau/g, 'Firestore Sau');

content = content.replace(/'\.\.\/lib\/firestoreToRtdbMigration'/g, "'../lib/rtdbToFirestoreMigration'");
fs.writeFileSync(path, content);

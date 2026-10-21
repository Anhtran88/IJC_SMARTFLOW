const fs = require('fs');
const path = 'src/lib/rtdbToFirestoreMigration.ts';
let content = fs.readFileSync(path, 'utf8');

// The file exports runFirestoreToRtdbMigration, exportFirestoreToJson, exportRtdbToJson.
// Let's modify runFirestoreToRtdbMigration -> runRtdbToFirestoreMigration

content = content.replace(/runFirestoreToRtdbMigration/g, 'runRtdbToFirestoreMigration');
content = content.replace(/Firestore -> RTDB/g, 'RTDB -> Firestore');
content = content.replace(/firestoreToRtdbMigration/g, 'rtdbToFirestoreMigration');
// Note: We need to invert the logic of reading from Firestore and writing to RTDB.

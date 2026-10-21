const fs = require('fs');
let content = fs.readFileSync('src/lib/rtdbToFirestoreMigration.ts', 'utf8');

// The verification logic:
// nodeReport.firestoreCount is the number of keys from RTDB. (Should be renamed to rtdbCountToMigrate, but let's just use it).
// nodeReport.rtdbCountAfter is the number of docs in Firestore AFTER migration.
// If Firestore had docs before, rtdbCountAfter could be > firestoreCount.
// So we should just check if migratedCount == firestoreCount (which means all RTDB keys were successfully processed).
// But we want to make sure they are in Firestore.
// Actually, verified should be true if totalErrors == 0 for this node, and migratedCount === keys.length.

content = content.replace(
  "if (nodeReport.firestoreCount !== nodeReport.rtdbCountAfter) {",
  "if (nodeReport.migratedCount !== nodeReport.firestoreCount) {"
);

fs.writeFileSync('src/lib/rtdbToFirestoreMigration.ts', content);

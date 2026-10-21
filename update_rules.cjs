const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

if (!rules.includes('/projects/')) {
  rules = rules.replace(/match \/system_backups/, "match /projects/{projectId} {\n      allow read, write: if true;\n    }\n    match /lichSu/{docId} {\n      allow read, write: if true;\n    }\n    match /system_backups");
  fs.writeFileSync('firestore.rules', rules);
  console.log('Updated firestore.rules');
} else {
  console.log('firestore.rules already updated');
}

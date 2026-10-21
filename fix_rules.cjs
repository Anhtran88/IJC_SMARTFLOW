const fs = require('fs');
let content = fs.readFileSync('firestore.rules', 'utf8');

if (!content.includes('/estimateGroups/')) {
  content = content.replace(
    /match \/estimateItems\/{itemId} {/,
    "match /estimateGroups/{groupId} {\n      allow read, write: if true;\n    }\n\n    match /estimateItems/{itemId} {"
  );
  fs.writeFileSync('firestore.rules', content);
}

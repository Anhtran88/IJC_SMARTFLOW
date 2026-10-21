const fs = require('fs');
const path = 'src/services/FirebaseListenerManager.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace("import { doc, collection, onSnapshot } from 'firebase/firestore';\n", '');
fs.writeFileSync(path, content);

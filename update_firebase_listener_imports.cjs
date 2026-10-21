const fs = require('fs');
const path = 'src/services/FirebaseListenerManager.ts';
let content = fs.readFileSync(path, 'utf8');
content = "import { doc, collection, onSnapshot } from 'firebase/firestore';\n" + content;
fs.writeFileSync(path, content);

const fs = require('fs');

const path = 'src/components/FirebaseConfigTab.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/<div className="mt-8 border-t border-slate-800 pt-6">[\s\S]*?Công cụ Migration \(RTDB ➔ Firestore\)[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, '      </div>\n    </div>');

fs.writeFileSync(path, content);

const fs = require('fs');

const path = 'src/components/FirebaseConfigTab.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/      <\/div>\n    <\/div>\n    <\/div>\n  \);\n\};/, "      </div>\n    </div>\n  );\n};");
fs.writeFileSync(path, content);

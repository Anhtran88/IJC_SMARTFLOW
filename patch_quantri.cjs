const fs = require('fs');

const path = 'src/components/QuanTriTab.tsx';
let content = fs.readFileSync(path, 'utf8');

// We need to import RtdbToFirestoreMigrationTool
if (!content.includes('RtdbToFirestoreMigrationTool')) {
  content = content.replace(
    "import { FirestoreMigrationTool } from './FirestoreMigrationTool';",
    "import { FirestoreMigrationTool } from './FirestoreMigrationTool';\nimport { RtdbToFirestoreMigrationTool } from './RtdbToFirestoreMigrationTool';"
  );
}

// Ensure the button is added
const newButton = `
          <button
            onClick={() => setActiveSubTab('migration_rtdb')}
            className={\`pb-1.5 px-0.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer \${
              activeSubTab === 'migration_rtdb' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }\`}
          >
            <Database size={14} />
            Migration RTDB → Firestore
          </button>
`;
if (!content.includes('Migration RTDB → Firestore')) {
  content = content.replace(
    /Migration Firestore → RTDB\s*<\/button>/,
    "Migration Firestore → RTDB\n          </button>\n" + newButton
  );
}

// Render the component
const newRender = `
      ) : activeSubTab === 'migration_rtdb' ? (
        <RtdbToFirestoreMigrationTool />
`;
if (!content.includes("<RtdbToFirestoreMigrationTool />")) {
  content = content.replace(
    /activeSubTab === 'migration' \? \(\s*<FirestoreMigrationTool \/>\s*\) : null/,
    "activeSubTab === 'migration' ? (\n        <FirestoreMigrationTool />\n" + newRender + "\n      ) : null"
  );
}

fs.writeFileSync(path, content);

const fs = require('fs');
const path = 'src/components/RtdbToFirestoreMigrationTool.tsx';
let content = fs.readFileSync(path, 'utf8');

// I might need to make sure the state is correct for activeSubTab
content = content.replace(/MigrationSummaryReport/g, 'MigrationSummaryReport');

fs.writeFileSync(path, content);

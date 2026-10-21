const fs = require('fs');
const path = 'src/lib/recalculationService.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "export const recalculateAllOrdersChain = async (): Promise<void> => {",
  "export const recalculateAllOrdersChain = async (): Promise<void> => {\n  const fsDb2 = getFirestoreDB();"
);

fs.writeFileSync(path, content);

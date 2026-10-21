const fs = require('fs');
let code = fs.readFileSync('src/lib/firebaseService.ts', 'utf8');

code = code.replace(/saveDonHang: async.*?return null;\s*\}/s,
"saveDonHang: async (loaiVatTu: string, data: any) => {\n" +
"    const fsDb = getFirestoreDB();\n" +
"    if (!fsDb) return null;\n" +
"    try {\n" +
"      const id = data.id || generateUUID();\n" +
"      const record = removeUndefined({ ...data, id, updatedAt: Date.now() });\n" +
"      record.loaiVatTu = loaiVatTu;\n" +
"      await setDoc(doc(fsDb, 'lichSu', id), record, { merge: true });\n" +
"      return record;\n" +
"    } catch (e) {\n" +
"      console.error('saveDonHang failed:', e);\n" +
"      return null;\n" +
"    }\n" +
"  }");

code = code.replace(/fetchLichSu: async.*?return \[\];\s*\}/s,
"fetchLichSu: async (loaiVatTu: string) => {\n" +
"    const fsDb = getFirestoreDB();\n" +
"    if (!fsDb) return [];\n" +
"    try {\n" +
"      const snapshot = await getDocs(query(collection(fsDb, 'lichSu'), where('loaiVatTu', '==', loaiVatTu)));\n" +
"      const records: any[] = [];\n" +
"      snapshot.forEach(docSnap => records.push({ ...docSnap.data(), id: docSnap.id }));\n" +
"      return records.sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));\n" +
"    } catch (e) {\n" +
"      console.error('fetchLichSu failed:', e);\n" +
"      return [];\n" +
"    }\n" +
"  }");

code = code.replace(/deleteDonHang: async.*?return null;\s*\}/s,
"deleteDonHang: async (loaiVatTu: string, id: string) => {\n" +
"    const fsDb = getFirestoreDB();\n" +
"    if (!fsDb) return null;\n" +
"    try {\n" +
"      await deleteDoc(doc(fsDb, 'lichSu', id));\n" +
"      return true;\n" +
"    } catch (e) {\n" +
"      console.error('deleteDonHang failed:', e);\n" +
"      return null;\n" +
"    }\n" +
"  }");

if (!code.includes("import { query, where }")) {
   code = "import { query, where } from 'firebase/firestore';\n" + code;
}

fs.writeFileSync('src/lib/firebaseService.ts', code);

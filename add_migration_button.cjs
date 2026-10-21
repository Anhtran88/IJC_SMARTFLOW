const fs = require('fs');

const path = 'src/components/FirebaseConfigTab.tsx';
let content = fs.readFileSync(path, 'utf8');

// We will add a new component or function for Migration.
const migrationCode = `
  const [migrationStatus, setMigrationStatus] = useState<string>('');
  const [isMigrating, setIsMigrating] = useState(false);

  const handleMigrateToFirestore = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn copy dữ liệu từ RTDB sang Firestore? Thao tác này KHÔNG xóa dữ liệu cũ.')) return;
    setIsMigrating(true);
    setMigrationStatus('Bắt đầu chuyển đổi...');
    try {
      const { get, ref } = await import('firebase/database');
      const { doc, setDoc, collection } = await import('firebase/firestore');
      const { getDB, getFirestoreDB } = await import('../lib/firebaseService');
      
      const db = getDB();
      const fsDb = getFirestoreDB();
      if (!db || !fsDb) {
        setMigrationStatus('Lỗi: Chưa kết nối Database!');
        setIsMigrating(false);
        return;
      }

      const collections = ['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'];
      
      for (const col of collections) {
        setMigrationStatus(\`Đang tải \${col} từ RTDB...\`);
        const snap = await get(ref(db, col));
        if (snap.exists()) {
          const val = snap.val();
          const keys = Object.keys(val);
          setMigrationStatus(\`Đang copy \${keys.length} records của \${col} sang Firestore...\`);
          
          let count = 0;
          for (const key of keys) {
            if (val[key]) {
              await setDoc(doc(fsDb, col, key), val[key]);
              count++;
            }
          }
          setMigrationStatus(\`Đã copy xong \${count} records cho \${col}.\`);
        } else {
          setMigrationStatus(\`Không có dữ liệu cho \${col}.\`);
        }
      }
      setMigrationStatus('✅ Copy dữ liệu RTDB -> Firestore thành công!');
    } catch (e: any) {
      console.error(e);
      setMigrationStatus('❌ Lỗi: ' + e.message);
    }
    setIsMigrating(false);
  };
`;

// Insert the state and function inside the component.
content = content.replace(/(const FirebaseConfigTab = \(\) => \{)/, "$1\n" + migrationCode);

// Insert the button in the UI
const buttonCode = `
        <div className="mt-8 border-t border-slate-800 pt-6">
          <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <Database size={20} className="text-blue-400" />
            Công cụ Migration (RTDB ➔ Firestore)
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Copy toàn bộ dữ liệu Dự toán, BM02, BM03.2, BM06 từ Realtime Database sang Firestore. Không làm mất dữ liệu cũ.
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={handleMigrateToFirestore}
              disabled={isMigrating}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded font-medium flex items-center gap-2 transition-colors"
            >
              {isMigrating ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
              {isMigrating ? 'Đang copy...' : 'Bắt đầu Copy Data'}
            </button>
            {migrationStatus && (
              <span className="text-sm text-slate-300 bg-slate-800 px-3 py-1.5 rounded">
                {migrationStatus}
              </span>
            )}
          </div>
        </div>
`;

content = content.replace(/(<\/div>\s*<\/div>\s*)$/, buttonCode + "\n$1");

fs.writeFileSync(path, content);

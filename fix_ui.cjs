const fs = require('fs');

const path = 'src/components/FirebaseConfigTab.tsx';
let content = fs.readFileSync(path, 'utf8');

// The buttonCode didn't inject because of the regex.
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

// Let's insert it before the closing of the main wrapper.
// The main wrapper ends with:
//       </div>
//     </div>
//   );
// };
content = content.replace(/(      <\/div>\s*    <\/div>\s*  \);\s*\};\s*)$/, buttonCode + "\n$1");

fs.writeFileSync(path, content);

import React, { useState, useEffect } from 'react';
import { fetchSystemFirebaseConfig, saveSystemFirebaseConfig, getSystemFirebaseConfigBackups, restoreSystemFirebaseConfig, getDB, getFirestoreDB } from '../lib/firebaseService';
import { get, ref, set, remove } from 'firebase/database';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { Save, RefreshCw, History, CheckCircle, AlertTriangle, Database, Activity, Lock, Unlock, Edit, X, Shield, Info, Settings } from 'lucide-react';

export const FirebaseConfigTab = () => {

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
        setMigrationStatus(`Đang tải ${col} từ RTDB...`);
        const snap = await get(ref(db, col));
        if (snap.exists()) {
          const val = snap.val();
          const keys = Object.keys(val);
          setMigrationStatus(`Đang copy ${keys.length} records của ${col} sang Firestore...`);
          
          let count = 0;
          for (const key of keys) {
            if (val[key]) {
              await setDoc(doc(fsDb, col, key), val[key]);
              count++;
            }
          }
          setMigrationStatus(`Đã copy xong ${count} records cho ${col}.`);
        } else {
          setMigrationStatus(`Không có dữ liệu cho ${col}.`);
        }
      }
      setMigrationStatus('✅ Copy dữ liệu RTDB -> Firestore thành công!');
    } catch (e: any) {
      console.error(e);
      setMigrationStatus('❌ Lỗi: ' + e.message);
    }
    setIsMigrating(false);
  };

  const [config, setConfig] = useState<any>({});
  const [rawText, setRawText] = useState<string>('');
  const [backups, setBackups] = useState<any[]>([]);
  const [status, setStatus] = useState<any>({ type: '', msg: '' });
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dataCounts, setDataCounts] = useState<any>({});
  const [permissions, setPermissions] = useState<any>({ rtdb: null, firestore: null });
  const [overviewStatus, setOverviewStatus] = useState<'loading' | 'online' | 'offline' | 'error'>('loading');
  const [lastUpdated, setLastUpdated] = useState<any>(null);

  useEffect(() => {
    loadOverview();
    loadBackups();
  }, []);

  const loadOverview = async () => {
    setOverviewStatus('loading');
    const sysConf = await fetchSystemFirebaseConfig();
    if (sysConf) {
      setConfig(sysConf);
      setRawText(JSON.stringify(sysConf, null, 2));
      setLastUpdated(sysConf.updatedAt ? new Date(sysConf.updatedAt) : null);
      setOverviewStatus('online');
      
      // Fetch data counts
      fetchDataCounts();
    } else {
      setOverviewStatus('offline');
    }
  };

  const loadBackups = async () => {
    const bks = await getSystemFirebaseConfigBackups();
    setBackups(bks);
  };

  const fetchDataCounts = async () => {
    const counts: any = {};
    const db = getDB();

    if (db) {
      try {
        const usersSnap = await get(ref(db, 'users'));
        counts.users = usersSnap.exists() ? Object.keys(usersSnap.val()).length : 0;
        
        const estSnap = await get(ref(db, 'estimateItems'));
        counts.estimateItemsRTDB = estSnap.exists() ? Object.keys(estSnap.val()).length : 0;
        
        const bm06Snap = await get(ref(db, 'bm06Orders'));
        counts.bm06RTDB = bm06Snap.exists() ? Object.keys(bm06Snap.val()).length : 0;

        const { rtDbProvider } = await import('../data/providers/RealtimeDatabaseProvider');
        const bm02Data = await rtDbProvider.get<Record<string, any>>('bm02Orders');
        if (bm02Data) counts.bm02 = Object.keys(bm02Data).length;
        
        const bm032Data = await rtDbProvider.get<Record<string, any>>('bm032Orders');
        if (bm032Data) counts.bm032 = Object.keys(bm032Data).length;
      } catch (e) {
        console.warn('Lỗi đọc dữ liệu RTDB', e);
      }
    }
    
    setDataCounts(counts);
  };

  const testPermissions = async () => {
    setLoading(true);
    const db = getDB();
    const fsDb = getFirestoreDB();
    const perms = {
      rtdb: { read: false, write: false },
      firestore: { read: false, write: false }
    };

    if (db) {
      try {
        perms.rtdb.read = true;
      } catch(e) {}
      try {
        await set(ref(db, 'test_write_permission'), { t: 1 });
        await remove(ref(db, 'test_write_permission'));
        perms.rtdb.write = true;
      } catch(e) {}
    }

    if (fsDb) {
      try {
        const testDocRef = doc(fsDb, 'system_backups', 'test_read_permission');
        await getDoc(testDocRef);
        perms.firestore.read = true;
      } catch(e) {
        perms.firestore.read = false;
      }
      
      try {
        const testDocRef = doc(fsDb, 'system_backups', 'test_write_permission');
        await setDoc(testDocRef, { t: 1 });
        await deleteDoc(testDocRef);
        perms.firestore.write = true;
      } catch(e) {
        perms.firestore.write = false;
      }
    }

    setPermissions(perms);
    setLoading(false);
  };

  const handleUpdate = async () => {
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed.apiKey || !parsed.databaseURL || !parsed.projectId) {
        setStatus({ type: 'error', msg: 'Cấu hình thiếu các trường bắt buộc (apiKey, databaseURL, projectId)' });
        return;
      }

      if (!window.confirm('CẢNH BÁO: Hành động này sẽ thay đổi cấu hình mặc định trên tất cả các thiết bị. Bạn có chắc chắn muốn lưu cấu hình này không?')) return;

      setLoading(true);
      setStatus({ type: 'loading', msg: 'Đang kiểm tra kết nối và lưu...' });
      
      const success = await saveSystemFirebaseConfig(parsed);
      if (success) {
        setStatus({ type: 'success', msg: 'Lưu cấu hình hệ thống và sao lưu thành công!' });
        loadBackups();
        setConfig(parsed);
        localStorage.setItem('firebase_config', JSON.stringify(parsed));
        setIsEditing(false);
        loadOverview();
      } else {
        setStatus({ type: 'error', msg: 'Lưu thất bại.' });
      }
    } catch (e) {
      setStatus({ type: 'error', msg: 'Cấu hình JSON không hợp lệ' });
    }
    setLoading(false);
  };

  const handleRestore = async (backupId: string) => {
    if (!window.confirm('Khôi phục lại cấu hình này?')) return;
    setLoading(true);
    const restored = await restoreSystemFirebaseConfig(backupId);
    if (restored) {
      setConfig(restored);
      setRawText(JSON.stringify(restored, null, 2));
      setStatus({ type: 'success', msg: 'Khôi phục thành công' });
      loadBackups();
      loadOverview();
    } else {
      setStatus({ type: 'error', msg: 'Khôi phục thất bại' });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 text-slate-200">
      
      {!isEditing ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold flex items-center gap-2 text-white">
              <Activity size={20} className={overviewStatus === 'online' ? "text-green-500" : "text-slate-500"} />
              Tổng quan kết nối Firebase hiện tại
            </h3>
            <div className={`px-3 py-1 rounded-full text-xs font-bold ${
              overviewStatus === 'online' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
              overviewStatus === 'loading' ? 'bg-blue-500/20 text-blue-400' :
              'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {overviewStatus === 'online' ? 'Đang trực tuyến' : overviewStatus === 'loading' ? 'Đang kiểm tra...' : 'Mất kết nối'}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Project ID</div>
                <div className="font-mono text-sm text-green-400">{config.projectId || 'Chưa có cấu hình'}</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Database URL (RTDB)</div>
                <div className="font-mono text-sm text-blue-400 break-all">{config.databaseURL || 'Chưa có cấu hình'}</div>
              </div>
              {config.databaseId && (
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-500 mb-1">Firestore Database ID</div>
                  <div className="font-mono text-sm text-yellow-400">{config.databaseId}</div>
                </div>
              )}
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Cập nhật lần cuối</div>
                  <div className="text-sm text-slate-300">
                    {lastUpdated ? lastUpdated.toLocaleString() : 'Chưa xác định'}
                  </div>
                </div>
                <Database size={20} className="text-slate-600" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h4 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2">
                  <Database size={16} /> Thống kê dữ liệu hiện có
                </h4>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div className="text-slate-500">Tài khoản User:</div>
                  <div className="font-bold text-slate-300 text-right">{dataCounts.users ?? '-'}</div>
                  <div className="text-slate-500">Dự toán/Hạng mục:</div>
                  <div className="font-bold text-slate-300 text-right">{dataCounts.estimateItemsRTDB ?? '-'}</div>
                  <div className="text-slate-500">Đơn hàng BM06:</div>
                  <div className="font-bold text-slate-300 text-right">{dataCounts.bm06RTDB ?? '-'}</div>
                  <div className="text-slate-500">Đơn hàng BM02:</div>
                  <div className="font-bold text-slate-300 text-right">{dataCounts.bm02 ?? '-'}</div>
                  <div className="text-slate-500">Đơn hàng BM03.2:</div>
                  <div className="font-bold text-slate-300 text-right">{dataCounts.bm032 ?? '-'}</div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-bold text-slate-400 flex items-center gap-2">
                    <Shield size={16} /> Trạng thái quyền (Rules)
                  </h4>
                  <button onClick={testPermissions} disabled={loading} className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors">
                    Kiểm tra lại
                  </button>
                </div>
                
                {permissions?.rtdb ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Realtime Database:</span>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${permissions?.rtdb?.read ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {permissions?.rtdb?.read ? <Unlock size={12}/> : <Lock size={12}/>} Đọc
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${permissions?.rtdb?.write ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {permissions?.rtdb?.write ? <Unlock size={12}/> : <Lock size={12}/>} Ghi
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Firestore:</span>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${permissions?.firestore?.read ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {permissions?.firestore?.read ? <Unlock size={12}/> : <Lock size={12}/>} Đọc
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${permissions?.firestore?.write ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {permissions?.firestore?.write ? <Unlock size={12}/> : <Lock size={12}/>} Ghi
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic">Bấm kiểm tra để xem trạng thái quyền</div>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-6">
            {overviewStatus === 'online' && permissions?.rtdb?.write && permissions?.rtdb?.read && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm flex items-center gap-2">
                <CheckCircle size={16} /> Firebase hiện tại đang hoạt động bình thường. Không cần thay đổi cấu hình.
              </div>
            )}
            {overviewStatus === 'offline' && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle size={16} /> Không thể kết nối Firebase hiện tại. Vui lòng kiểm tra mạng hoặc cập nhật cấu hình mới.
              </div>
            )}
            {overviewStatus === 'online' && permissions?.rtdb?.read && !permissions?.rtdb?.write && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm flex items-center gap-2">
                <AlertTriangle size={16} /> Firebase hiện tại đọc được nhưng không ghi được. Vui lòng kiểm tra Rules hoặc cấu hình quyền.
              </div>
            )}
            {overviewStatus === 'online' && (!config.apiKey || !config.databaseURL || !config.projectId) && (
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-orange-400 text-sm flex items-center gap-2">
                <AlertTriangle size={16} /> FirebaseConfig chưa đầy đủ. Vui lòng cập nhật lại cấu hình.
              </div>
            )}
          </div>

          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg flex items-start gap-3">
            <Info size={20} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-blue-400 mb-1">Khi nào cần thay đổi cấu hình Firebase?</p>
              <ul className="list-disc pl-5 text-slate-300 space-y-1 mb-3">
                <li>Chuyển sang Firebase Project mới (dữ liệu hiện tại sẽ không được mang theo tự động).</li>
                <li>Project cũ bị xóa hoặc không còn khả dụng.</li>
                <li>Database URL hoặc Firestore Database ID đã thay đổi.</li>
                <li>App báo mất kết nối Firebase liên tục.</li>
              </ul>
              <p className="font-bold text-slate-400 mb-1">Không nên thay đổi nếu:</p>
              <ul className="list-disc pl-5 text-slate-400 space-y-1">
                <li>Chỉ muốn xóa/reset dữ liệu (hãy dùng chức năng Reset Data).</li>
                <li>Kết nối vẫn đang báo "Đang trực tuyến" và hoạt động bình thường.</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 border-t border-slate-800 pt-6">
            <button 
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-lg font-bold text-white transition-colors"
            >
              <Settings size={18} /> Cập nhật cấu hình mới
            </button>
            <button 
              onClick={loadOverview}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold transition-colors"
            >
              <RefreshCw size={18} /> Tải lại dữ liệu
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative">
          <button 
            onClick={() => setIsEditing(false)}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-800 hover:text-white rounded-full transition-colors"
          >
            <X size={20} />
          </button>
          
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
            <Edit size={18} className="text-blue-500" />
            Thiết lập cấu hình Firebase mới
          </h3>
          
          <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg mb-6 flex items-start gap-3">
            <AlertTriangle size={20} className="text-orange-400 shrink-0 mt-0.5" />
            <div className="text-sm text-orange-200">
              <strong>Cảnh báo:</strong> Đổi cấu hình Firebase sẽ trỏ app sang một cơ sở dữ liệu mới. 
              Các dữ liệu từ Project cũ sẽ không hiển thị trên app trừ khi bạn có công cụ migrate data riêng. 
              Hãy chắc chắn cấu hình JSON bên dưới là chính xác!
            </div>
          </div>

          {status.msg && (
            <div className={`p-3 mb-4 rounded ${status.type === 'error' ? 'bg-red-500/10 text-red-400' : status.type === 'loading' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'}`}>
              {status.msg}
            </div>
          )}
          <div className="mb-4">
             <textarea
               className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-sm h-64 text-green-400 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-500"
               value={rawText}
               onChange={e => setRawText(e.target.value)}
               placeholder="Dán JSON cấu hình (firebaseConfig) vào đây..."
             ></textarea>
          </div>
          <div className="flex gap-4">
            <button onClick={handleUpdate} disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg font-bold shadow-lg shadow-blue-500/20 transition-all">
              <Save size={18} /> Lưu & Áp dụng cấu hình
            </button>
            <button onClick={() => setIsEditing(false)} disabled={loading} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-lg font-bold transition-all">
              Hủy bỏ
            </button>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
          <History size={18} className="text-blue-500" />
          Lịch sử các bản sao lưu cấu hình
        </h3>
        {backups.length === 0 ? (
          <p className="text-slate-500 text-sm">Chưa có bản sao lưu nào.</p>
        ) : (
          <div className="space-y-3">
            {backups.map(bk => (
              <div key={bk.backupId} className="flex items-center justify-between bg-slate-950 border border-slate-800 p-4 rounded-lg text-sm transition-colors hover:border-slate-700">
                <div>
                  <div className="font-bold text-slate-300">{new Date(bk.createdAt).toLocaleString()}</div>
                  <div className="text-xs text-slate-500 mt-1">ID: {bk.backupId} • {bk.note}</div>
                  <div className="text-xs text-slate-600 mt-1">Project ID: <span className="text-blue-400 font-mono">{bk.config?.projectId}</span></div>
                </div>
                <button 
                  onClick={() => handleRestore(bk.backupId)} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 text-orange-400 hover:bg-orange-600/40 rounded border border-orange-500/20 font-bold transition-colors"
                >
                  <RefreshCw size={14} /> Khôi phục
                </button>
              </div>
            ))}
          </div>
        )}

              </div>
    </div>
  );
};

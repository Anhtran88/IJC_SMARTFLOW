import React, { useState, useEffect } from 'react';
import { Users, History, Trash2, UserCog, RefreshCw, Search, Filter, CheckCircle, AlertOctagon, Edit, Eye, EyeOff, X, Key, UserPlus } from 'lucide-react';
import { 
  fetchActivityLogs, 
  fetchUserAccountsFromDB, 
  updateUserRoleInDB, 
  logActivity,
  registerUserInDB,
  deleteUserFromDB,
  updateUserDetailedInDB
} from '../lib/firebaseService';
import { UserAccount, ActivityLog, UserRole } from '../../types';
import { FirebaseConfigTab } from './FirebaseConfigTab';
import { Settings, Database } from 'lucide-react';
import { FirestoreMigrationTool } from './FirestoreMigrationTool';
import { RtdbToFirestoreMigrationTool } from './RtdbToFirestoreMigrationTool';

interface QuanTriTabProps {
  currentUser: UserAccount | null;
  initialSubTab?: 'logs' | 'users' | 'firebase_config' | 'migration';
  onClose?: () => void;
}

export const QuanTriTab: React.FC<QuanTriTabProps> = ({ currentUser, initialSubTab, onClose }) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'logs' | 'users' | 'firebase_config' | 'migration'>(initialSubTab || 'logs');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  
  // Form states for adding user
  const [addUsername, setAddUsername] = useState<string>('');
  const [addPassword, setAddPassword] = useState<string>('');
  const [addRole, setAddRole] = useState<UserRole>('viewer');
  
  // Form states for editing user
  const [editingOldUsername, setEditingOldUsername] = useState<string>('');
  const [editUsername, setEditUsername] = useState<string>('');
  const [editPassword, setEditPassword] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('viewer');
  
  // Eye toggles in the main table list for password viewing
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  const togglePasswordReveal = (username: string) => {
    setRevealedPasswords(prev => ({
      ...prev,
      [username]: !prev[username]
    }));
  };

  const handleOpenAddModal = () => {
    setAddUsername('');
    setAddPassword('');
    setAddRole('viewer');
    setIsAddModalOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = addUsername.trim();
    const trimmedPass = addPassword.trim();
    
    if (!trimmedUser || !trimmedPass) {
      setNotification({ type: 'error', message: 'Tên đăng nhập và mật khẩu không được trống!' });
      return;
    }

    if (trimmedUser.toLowerCase() === 'admin') {
      setNotification({ type: 'error', message: 'Không thể tạo thêm tài khoản admin hệ thống!' });
      return;
    }

    setIsProcessing(true);
    try {
      await registerUserInDB(trimmedUser, trimmedPass, addRole);
      
      await logActivity(
        currentUser?.username || 'admin',
        currentUser?.role || 'admin',
        'CREATE',
        'Cấu hình',
        `Thêm tài khoản người dùng mới: @${trimmedUser} với vai trò ${addRole.toUpperCase()}`,
        trimmedUser
      );
      
      setNotification({ type: 'success', message: `Thêm tài khoản @${trimmedUser} thành công!` });
      setIsAddModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err.message === 'USER_EXISTS') {
        setNotification({ type: 'error', message: 'Tên đăng nhập này đã tồn tại trên hệ thống!' });
      } else {
        setNotification({ type: 'error', message: 'Thêm tài khoản thất bại: ' + err.message });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenEditModal = (user: UserAccount) => {
    setEditingOldUsername(user.username);
    setEditUsername(user.username);
    setEditPassword(user.password || 'anhtran2261988');
    setEditRole(user.role);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = editUsername.trim();
    const trimmedPass = editPassword.trim();
    
    if (!trimmedUser || !trimmedPass) {
      setNotification({ type: 'error', message: 'Tên đăng nhập và mật khẩu không được trống!' });
      return;
    }

    setIsProcessing(true);
    try {
      await updateUserDetailedInDB(editingOldUsername, trimmedUser, trimmedPass, editRole);
      
      let desc = `Cập nhật tài khoản @${editingOldUsername}: `;
      if (editingOldUsername !== trimmedUser) desc += `đổi tên thành @${trimmedUser}, `;
      desc += `thiết lập vai trò ${editRole.toUpperCase()}`;
      
      await logActivity(
        currentUser?.username || 'admin',
        currentUser?.role || 'admin',
        'UPDATE',
        'Cấu hình',
        desc,
        trimmedUser
      );

      setNotification({ type: 'success', message: 'Cập nhật tài khoản thành công!' });
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err.message === 'USER_EXISTS') {
        setNotification({ type: 'error', message: 'Tên đăng nhập mới đã tồn tại trên hệ thống!' });
      } else {
        setNotification({ type: 'error', message: 'Cập nhật tài khoản thất bại: ' + err.message });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async (targetUsername: string) => {
    if (targetUsername === 'admin') {
      const msg = 'Tài khoản admin gốc không được phép xóa để đảm bảo hệ thống luôn có quyền quản trị.';
      setNotification({ type: 'error', message: msg });
      alert(msg);
      return;
    }

    const userObj = users.find(u => u.username === targetUsername);
    if (userObj) {
      setUserToDelete(userObj);
    } else {
      setNotification({ type: 'error', message: 'Không tìm thấy thông tin tài khoản cần xóa.' });
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    const targetUsername = userToDelete.username;

    if (targetUsername === 'admin') {
      const msg = 'Tài khoản admin gốc không được phép xóa để đảm bảo hệ thống luôn có quyền quản trị.';
      setNotification({ type: 'error', message: msg });
      alert(msg);
      setUserToDelete(null);
      return;
    }

    setIsProcessing(true);
    try {
      const success = await deleteUserFromDB(targetUsername);
      if (success) {
        await logActivity(
          currentUser?.username || 'admin',
          currentUser?.role || 'admin',
          'DELETE_USER' as any,
          'Quản lý tài khoản & Quyền hạn' as any,
          `Xóa vĩnh viễn tài khoản người dùng: @${targetUsername}`,
          targetUsername,
          userToDelete // beforeData
        );

        setNotification({ type: 'success', message: 'Đã xóa tài khoản thành công.' });
        setUserToDelete(null);
        loadData();
      } else {
        setNotification({ type: 'error', message: 'Xóa tài khoản thất bại từ database.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Có lỗi xảy ra: ' + err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper rendering function for visual detailed diff & created metadata audit log inspection
  const renderDataAuditDetail = (log: any) => {
    const before = log.beforeData;
    const after = log.afterData;

    if (!before && !after) return null;

    // Render newly created object details
    if (log.action === 'CREATE' && after) {
      return (
        <div id={`log-detail-create-${log.logId}`} className="mt-3 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 animate-fade-in text-xs text-slate-350">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5 font-bold text-blue-400 uppercase tracking-widest text-[10px]">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
            Nội dung thiết lập khởi tạo
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
            {after.title || after.tieuDe ? (
              <div><span className="text-slate-500">Tiêu đề:</span> <span className="text-slate-200 font-bold">{after.title || after.tieuDe}</span></div>
            ) : null}
            {after.docNumber || after.soPhieu ? (
              <div><span className="text-slate-500">Mã văn bản:</span> <span className="text-slate-200">{after.docNumber || after.soPhieu}</span></div>
            ) : null}
            {after.date || after.ngayLap || after.orderDate ? (
              <div><span className="text-slate-500">Ngày lập:</span> <span className="text-slate-200">{after.date || after.ngayLap || after.orderDate}</span></div>
            ) : null}
            {after.location || after.diaDiem ? (
              <div><span className="text-slate-500">Địa điểm:</span> <span className="text-slate-200">{after.location || after.diaDiem}</span></div>
            ) : null}
            {(after.totalWithTax !== undefined || after.tongTien !== undefined || after.totalAmount !== undefined) && (
              <div>
                <span className="text-slate-500">Tổng thanh toán:</span>{' '}
                <span className="text-emerald-400 font-extrabold">{Number(after.totalWithTax || after.tongTien || after.totalAmount || 0).toLocaleString('vi-VN')} đ</span>
              </div>
            )}
            {after.proposingCompany || after.nguoiLap ? (
              <div><span className="text-slate-500">Người đề xuất / Đơn vị:</span> <span className="text-slate-200">{after.proposingCompany || after.nguoiLap}</span></div>
            ) : null}
          </div>
        </div>
      );
    }

    // Render diff differences for an UPDATE event
    if (log.action === 'UPDATE' && before && after) {
      const diffs: { field: string; beforeVal: string; afterVal: string }[] = [];

      const stringifyValue = (val: any): string => {
        if (val === undefined || val === null) return 'Trống';
        if (typeof val === 'object') {
          if (Array.isArray(val)) return `Danh sách (${val.length} mục)`;
          return JSON.stringify(val);
        }
        return String(val);
      };

      const fieldMapping: Record<string, string> = {
        title: 'Tiêu đề',
        tieuDe: 'Tiêu đề',
        docNumber: 'Số văn bản',
        date: 'Ngày thực hiện',
        ngayLap: 'Ngày lập hồ sơ',
        orderDate: 'Ngày đặt hàng',
        location: 'Địa điểm',
        diaDiem: 'Địa điểm',
        totalWithTax: 'Tổng cộng (VAT)',
        tongTien: 'Tổng tiền thanh toán',
        totalAmount: 'Giá trị chưa VAT',
        taxRate: 'Thuế suất (%)',
        taxAmount: 'Số tiền thuế',
        proposingCompany: 'Đơn vị đề xuất',
        nguoiLap: 'Tên người lập',
        giamDoc: 'Giám đốc phê duyệt',
        phongKeToan: 'Kế toán trưởng kiểm soát',
        duyetHDTV: 'Hội đồng TV phê duyệt',
      };

      const keysToCompare = [
        'title', 'tieuDe', 'docNumber', 'date', 'ngayLap', 'orderDate',
        'location', 'diaDiem', 'totalWithTax', 'tongTien', 'totalAmount',
        'taxRate', 'taxAmount', 'proposingCompany', 'nguoiLap', 'giamDoc',
        'phongKeToan', 'duyetHDTV'
      ];

      keysToCompare.forEach(k => {
        const bVal = before[k];
        const aVal = after[k];
        if (bVal !== undefined && aVal !== undefined && stringifyValue(bVal) !== stringifyValue(aVal)) {
          const formatVal = (key: string, val: any) => {
            if (['totalWithTax', 'tongTien', 'totalAmount', 'taxAmount'].includes(key) && !isNaN(Number(val))) {
              return `${Number(val).toLocaleString('vi-VN')} đ`;
            }
            return stringifyValue(val);
          };

          diffs.push({
            field: fieldMapping[k] || k,
            beforeVal: formatVal(k, bVal),
            afterVal: formatVal(k, aVal)
          });
        }
      });

      // Diff items arrays to locate specific materials changed on qty or price level
      const beforeItems = before.items || before.selectedItems || before.danhSachVatTu || [];
      const afterItems = after.items || after.selectedItems || after.danhSachVatTu || [];
      const itemChanges: { name: string; beforeQty: number; afterQty: number; beforePrice: number; afterPrice: number }[] = [];

      afterItems.forEach((af: any, idx: number) => {
        const bf = beforeItems.find((b: any) => b.name === af.name || (b.itemId === af.itemId && af.itemId)) || beforeItems[idx];
        const bQty = bf ? Number(bf.quantity || bf.orderQty || 0) : 0;
        const aQty = Number(af.quantity || af.orderQty || 0);
        const bPrice = bf ? Number(bf.unitPrice || bf.price || 0) : 0;
        const aPrice = Number(af.unitPrice || af.price || 0);

        if (bQty !== aQty || bPrice !== aPrice) {
          itemChanges.push({
            name: af.name || af.itemText || `Sản phẩm dòng ${idx+1}`,
            beforeQty: bQty,
            afterQty: aQty,
            beforePrice: bPrice,
            afterPrice: aPrice
          });
        }
      });

      return (
        <div id={`log-detail-update-${log.logId}`} className="mt-3 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 animate-fade-in text-xs text-slate-350">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5 font-bold text-amber-400 uppercase tracking-widest text-[10px]">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
            Biến động thay đổi chi tiết trước &amp; sau khi sửa
          </div>

          {diffs.length === 0 ? (
            <div className="font-mono text-slate-500 italic text-[11px]">Không phát hiện chênh lệch chi tiết tại các trường dữ liệu lõi.</div>
          ) : (
            <div className="space-y-3">
              {diffs.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Thông tin thuộc tính thay đổi:</div>
                  <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                    {diffs.map((d, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 bg-slate-900/60 border border-slate-800/40 rounded-lg gap-2 text-left">
                        <span className="text-slate-400 font-bold shrink-0">{d.field}:</span>
                        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                          <span className="text-red-400 line-through bg-red-950/20 px-1.5 py-0.5 rounded text-[10px] font-bold">{d.beforeVal}</span>
                          <span className="text-slate-600">&rarr;</span>
                          <span className="text-emerald-400 font-extrabold bg-emerald-950/20 px-1.5 py-0.5 rounded text-[10px]">{d.afterVal}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // Render detailed backup capture before a deletion event occurred
    if (log.action === 'DELETE' && before) {
      return (
        <div id={`log-detail-delete-${log.logId}`} className="mt-3 p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-2 animate-fade-in text-xs text-slate-400">
          <div className="flex items-center gap-2 border-b border-slate-900 pb-1.5 font-bold text-rose-500 uppercase tracking-widest text-[10px]">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
            Bản ghi dữ liệu đã sao lưu và lưu giữ trước khi bị xóa
          </div>
          <div className="font-mono text-slate-400 text-[11px] bg-slate-900/80 p-3 rounded border border-slate-850 space-y-1">
            <div><span className="text-slate-500">Mã định danh:</span> <span className="text-slate-200">{before.id || log.targetId || 'N/A'}</span></div>
            <div><span className="text-slate-500">Tiêu đề:</span> <span className="text-slate-100 font-semibold">{before.title || before.tieuDe || 'N/A'}</span></div>
            <div><span className="text-slate-500">Ngày lập:</span> <span className="text-slate-300">{before.date || before.ngayLap || 'N/A'}</span></div>
            <div><span className="text-slate-500">Địa điểm:</span> <span className="text-slate-350">{before.location || before.diaDiem || 'N/A'}</span></div>
            <div><span className="text-slate-500">Tổng tiền bản lưu:</span> <span className="text-rose-400 font-bold">{Number(before.totalWithTax || before.tongTien || before.totalAmount || 0).toLocaleString('vi-VN')} đ</span></div>
          </div>
        </div>
      );
    }

    return null;
  };

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [timeRangeFilter, setTimeRangeFilter] = useState<string>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setIsProcessing(true);
    setNotification(null);
    try {
      const fetchedLogs = await fetchActivityLogs();
      const fetchedUsers = await fetchUserAccountsFromDB();
      setLogs(fetchedLogs);
      setUsers(fetchedUsers);
    } catch (e) {
      setNotification({ type: 'error', message: 'Không thể đồng bộ dữ liệu từ Database.' });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSubTab]);

  const handleRoleChange = async (targetUsername: string, newRole: UserRole) => {
    if (targetUsername === 'admin') {
      setNotification({ type: 'error', message: 'Tài khoản admin gốc không được đổi vai trò!' });
      return;
    }

    setIsProcessing(true);
    try {
      const success = await updateUserRoleInDB(targetUsername, newRole);
      if (success) {
        // Log the change
        await logActivity(
          currentUser?.username || 'admin',
          currentUser?.role || 'admin',
          'UPDATE',
          'Cấu hình',
          `Thay đổi phân quyền vai trò của người dùng @${targetUsername} thành: ${newRole.toUpperCase()}`,
          targetUsername
        );

        setNotification({ type: 'success', message: `Thay đổi quyền của @${targetUsername} thành ${newRole.toUpperCase()} thành công!` });
        
        // Refresh
        const updatedUsers = users.map(u => u.username === targetUsername ? { ...u, role: newRole } : u);
        setUsers(updatedUsers);
      } else {
        setNotification({ type: 'error', message: 'Đổi quyền thất bại.' });
      }
    } catch (err) {
      setNotification({ type: 'error', message: 'Đã có lỗi hệ thống xảy ra.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter logs logic
  const filteredLogs = logs.filter(log => {
    const textBase = `${log.username} ${log.description} ${log.targetId || ''}`.toLowerCase();
    const queryMatch = textBase.includes(searchQuery.toLowerCase());
    const actionMatch = actionFilter === 'all' || log.action === actionFilter;
    const moduleMatch = moduleFilter === 'all' || log.module === moduleFilter;

    // Time view range filters
    let timeMatch = true;
    if (log.createdAt) {
      const logDate = new Date(log.createdAt);
      const now = new Date();
      if (timeRangeFilter === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        timeMatch = logDate >= todayStart;
      } else if (timeRangeFilter === 'yesterday') {
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        timeMatch = logDate >= yesterdayStart && logDate < yesterdayEnd;
      } else if (timeRangeFilter === 'last7days') {
        const limit = new Date();
        limit.setDate(limit.getDate() - 7);
        timeMatch = logDate >= limit;
      } else if (timeRangeFilter === 'last30days') {
        const limit = new Date();
        limit.setDate(limit.getDate() - 30);
        timeMatch = logDate >= limit;
      } else if (timeRangeFilter === 'custom') {
        if (customStartDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          timeMatch = timeMatch && (logDate >= start);
        }
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          timeMatch = timeMatch && (logDate <= end);
        }
      }
    }

    return queryMatch && actionMatch && moduleMatch && timeMatch;
  });

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'LOGIN': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'LOGOUT': return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
      case 'CREATE': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'UPDATE': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'DELETE': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'IMPORT': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      case 'EXPORT': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
      default: return 'bg-slate-800 text-slate-400 border border-slate-700';
    }
  };

  const getModuleBadgeColor = (module: string) => {
    switch (module) {
      case 'Dự toán': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'BM06': return 'bg-pink-500/10 text-pink-400 border border-pink-500/20';
      case 'BM02': return 'bg-teal-500/10 text-teal-400 border border-teal-500/20';
      case 'BM03.2': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      case 'Báo cáo': return 'bg-indigo-505/10 text-indigo-400 border border-indigo-500/20';
      case 'Cấu hình': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
      default: return 'bg-slate-800 text-slate-400';
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('vi-VN');
  };

  return (
    <div className="flex-1 overflow-y-auto p-3.5 bg-slate-950 text-slate-100 space-y-3.5">
      
      {/* Notifications bar */}
      {notification && (
        <div className={`p-3 rounded-xl border flex items-center justify-between animate-in fade-in duration-200 ${
          notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle size={14} fill="currentColor" className="text-slate-950" /> : <AlertOctagon size={14} />}
            <span className="text-xs font-bold leading-normal">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-xs font-semibold opacity-60 hover:opacity-100">Đóng</button>
        </div>
      )}

      {/* Mini tabs options with bento background and sync button inline */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-900 pb-0.5">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveSubTab('logs')}
            className={`pb-1.5 px-0.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'logs' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History size={14} />
            Nhật ký kiểm toán thao tác ({logs.length})
          </button>
          <button
            onClick={() => setActiveSubTab('users')}
            className={`pb-1.5 px-0.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'users' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={14} />
            Quản lý tài khoản & Quyền hạn ({users.length})
          </button>
          <button
            onClick={() => setActiveSubTab('firebase_config')}
            className={`pb-1.5 px-0.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'firebase_config' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings size={14} />
            Cấu hình Firebase
          </button>
          <button
            onClick={() => setActiveSubTab('migration')}
            className={`pb-1.5 px-0.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'migration' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database size={14} />
            Migration Firestore → RTDB
          </button>

          <button
            onClick={() => setActiveSubTab('migration_rtdb')}
            className={`pb-1.5 px-0.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'migration_rtdb' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database size={14} />
            Migration RTDB → Firestore
          </button>

        </div>
        <button
          onClick={loadData}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 rounded text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-slate-300 self-end sm:self-auto"
        >
          <RefreshCw size={11} className={isProcessing ? "animate-spin text-blue-400" : "text-slate-455"} />
          Đồng bộ danh sách
        </button>
      </div>

      {activeSubTab === 'logs' ? (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="p-2 py-1.5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col gap-2">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
              {/* Search inputs */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
                <input
                  type="text"
                  placeholder="Tìm nội dung, tài khoản..."
                  className="w-full bg-slate-950 border border-slate-800/80 focus:border-slate-600 rounded-lg pl-7.5 pr-2.5 py-1 text-xs text-slate-205 outline-none placeholder:text-slate-600 font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Action Type */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider shrink-0">Hành động:</span>
                <select
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none font-semibold cursor-pointer"
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="all">Tất cả hành động</option>
                  <option value="LOGIN">LOGIN (Đăng nhập)</option>
                  <option value="LOGOUT">LOGOUT (Đăng xuất)</option>
                  <option value="CREATE">CREATE (Tạo mới)</option>
                  <option value="UPDATE">UPDATE (Cập nhật)</option>
                  <option value="DELETE">DELETE (Xóa dữ liệu)</option>
                  <option value="IMPORT">IMPORT (Nhập dữ liệu)</option>
                  <option value="EXPORT">EXPORT (Xuất file)</option>
                </select>
              </div>

              {/* Module Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider shrink-0">Phòng/Module:</span>
                <select
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none font-semibold cursor-pointer"
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                >
                  <option value="all">Tất cả module</option>
                  <option value="Dự toán">Dự toán</option>
                  <option value="BM06">BM06 (Đề xuất)</option>
                  <option value="BM02">BM02 (Đề nghị cung cấp)</option>
                  <option value="BM03.2">BM03.2 (Nghiệm thu)</option>
                  <option value="Báo cáo">Báo cáo</option>
                  <option value="Cấu hình">Cấu hình</option>
                </select>
              </div>

              {/* Time Range Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider shrink-0">Thời gian:</span>
                <select
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none font-semibold cursor-pointer"
                  value={timeRangeFilter}
                  onChange={(e) => setTimeRangeFilter(e.target.value)}
                >
                  <option value="today">Hôm nay</option>
                  <option value="yesterday">Hôm qua</option>
                  <option value="last7days">7 ngày qua</option>
                  <option value="last30days">30 ngày qua</option>
                  <option value="custom">Tùy chọn khoảng...</option>
                </select>
              </div>

              {/* Stats count */}
              <div className="flex items-center justify-end text-right">
                <span className="text-[11px] text-slate-400 font-bold uppercase">
                  Khớp: <span className="text-slate-205 text-sm font-black">{filteredLogs.length}</span> / {logs.length}
                </span>
              </div>
            </div>

            {/* Custom date range selection inputs */}
            {timeRangeFilter === 'custom' && (
              <div className="p-3 bg-slate-950 border border-slate-800/60 rounded-lg flex flex-col sm:flex-row items-center gap-3.5 animate-fade-in text-xs text-slate-300 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Từ ngày:</span>
                  <input
                    type="date"
                    className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-slate-600 font-medium whitespace-nowrap"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Đến ngày:</span>
                  <input
                    type="date"
                    className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-slate-600 font-medium"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
                {(customStartDate || customEndDate) && (
                  <button
                    onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                    className="text-[10px] uppercase font-bold text-rose-400 hover:text-rose-300 transition-colors select-none cursor-pointer self-start sm:self-center ml-auto"
                  >
                    Xóa lọc ngày
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Logs records tables layout */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden scrollbar-thin">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-2 px-1 uppercase tracking-wider text-[10px] text-center w-10">STT</th>
                    <th className="py-2 px-2 uppercase tracking-wider text-[10px]">Thời gian</th>
                    <th className="py-2 px-2 uppercase tracking-wider text-[10px]">Tài khoản</th>
                    <th className="py-2 px-2 uppercase tracking-wider text-[10px]">Vai trò</th>
                    <th className="py-2 px-2 uppercase tracking-wider text-[10px] text-center w-24">Hành động</th>
                    <th className="py-2 px-2 uppercase tracking-wider text-[10px] text-center w-24">Phân hệ</th>
                    <th className="py-2 px-2 uppercase tracking-wider text-[10px]">Nội dung kiểm toán</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-semibold">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                        Không lưu trữ hoặc không tìm thấy hành động thao tác nào khớp kết quả tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log, idx) => (
                      <tr key={log.logId} className="hover:bg-slate-800/20 transition-all">
                        <td className="py-1.5 px-1 text-center text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-1.5 px-2 text-slate-300 font-mono whitespace-nowrap">{formatTime(log.createdAt)}</td>
                        <td className="py-1.5 px-2 text-rose-300 font-bold">@{log.username}</td>
                        <td className="py-1.5 px-2 text-[11px] text-slate-400 uppercase tracking-widest">{log.role || 'viewer'}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wide uppercase ${getActionBadgeColor(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${getModuleBadgeColor(log.module)}`}>
                            {log.module}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <div className="text-slate-200 font-medium leading-relaxed">{log.description}</div>
                              {log.targetId && (
                                <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                  Đối tượng Id: <span className="text-blue-400">{log.targetId}</span>
                                </div>
                              )}
                            </div>
                            {(log.beforeData || log.afterData) && (
                              <button
                                onClick={() => setExpandedLogId(expandedLogId === log.logId ? null : log.logId)}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider select-none shrink-0 border transition-all cursor-pointer ${
                                  expandedLogId === log.logId
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    : 'bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800'
                                }`}
                              >
                                {expandedLogId === log.logId ? 'Đóng chi tiết' : 'Xem chi tiết'}
                              </button>
                            )}
                          </div>
                          {expandedLogId === log.logId && renderDataAuditDetail(log)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeSubTab === 'users' ? (
        <div className="space-y-4">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold text-rose-400 uppercase mb-1 flex items-center gap-1.5">
                <UserCog size={14} />
                Cơ cấu quản lý vai trò tài khoản
              </h2>
              <p className="text-[11px] text-slate-400 leading-normal">
                Admin có thể thăng cấp quyền hạn người dùng từ <strong className="text-slate-350">VIEWER (chỉ xem)</strong> lên <strong className="text-slate-350">EDITOR</strong> hoặc <strong className="text-slate-350">ADMIN</strong>, thêm/xóa/sửa thông tin tài khoản trực tiếp.
              </p>
            </div>
            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded text-[11px] font-bold transition-all flex items-center gap-1.5 shadow active:scale-95 cursor-pointer shrink-0"
              >
                + Thêm tài khoản mới
              </button>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                    <th className="py-2 px-1 uppercase tracking-wider text-[10px] w-10 text-center">STT</th>
                    <th className="py-2 px-2.5 uppercase tracking-wider text-[10px]">Tên đăng nhập hệ thống</th>
                    {currentUser?.role === 'admin' && (
                      <th className="py-2 px-2.5 uppercase tracking-wider text-[10px]">Mật khẩu</th>
                    )}
                    <th className="py-2 px-2.5 uppercase tracking-wider text-[10px]">Phân quyền vai trò hiện tại</th>
                    <th className="py-2 px-2.5 uppercase tracking-wider text-[10px]">Ngày đăng ký tài khoản</th>
                    <th className="py-2 px-2.5 uppercase tracking-wider text-[10px] text-center w-60">Cấp quyền hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-semibold text-slate-200">
                  {users.map((user, idx) => (
                    <tr key={user.username} className="hover:bg-slate-800/10 transition-colors">
                      <td className="py-1.5 px-1 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-1.5 px-2.5">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-white text-xs">
                            {user.username === 'admin' ? 'Hộc Hệ Thống — Quản Trị Viên Gốc' : `Nhân viên @${user.username}`}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">@{user.username}</span>
                        </div>
                      </td>
                      {currentUser?.role === 'admin' && (
                        <td className="py-1.5 px-2.5 text-slate-300 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-slate-950 px-2 py-0.5 border border-slate-800 rounded select-all">
                              {revealedPasswords[user.username] ? (user.password || 'anhtran2261988') : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePasswordReveal(user.username)}
                              className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                              title={revealedPasswords[user.username] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                            >
                              {revealedPasswords[user.username] ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="py-1.5 px-2.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-black ${
                          user.role === 'admin' ? 'bg-rose-500/10 text-rose-455 border border-rose-500/20' :
                          user.role === 'editor' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                        }`}>
                          {user.role === 'admin' ? 'admin' : user.role === 'editor' ? 'editor' : 'viewer'}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-400 font-mono">{formatTime(user.createdAt || 0) || 'Mặc định ban đầu'}</td>
                      <td className="py-1.5 px-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {user.username === 'admin' ? (
                            <button
                              type="button"
                              disabled={currentUser?.role !== 'admin'}
                              onClick={() => handleOpenEditModal(user)}
                              className={`flex items-center gap-1 px-2 py-1 border rounded text-[10px] font-bold transition-all shadow select-none ${
                                currentUser?.role === 'admin'
                                  ? 'bg-slate-950 hover:bg-slate-850 border-slate-800 hover:border-slate-755 text-slate-300 hover:text-white cursor-pointer'
                                  : 'bg-slate-900 border-slate-850 text-slate-655 cursor-not-allowed opacity-50'
                              }`}
                            >
                              <Key size={10} /> Đổi pass
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={currentUser?.role !== 'admin' && currentUser?.role !== 'editor'}
                                onClick={() => handleOpenEditModal(user)}
                                className={`flex items-center gap-1 px-2 py-1 border rounded text-[10px] font-bold transition-all shadow select-none ${
                                  currentUser?.role === 'admin' || currentUser?.role === 'editor'
                                    ? 'bg-slate-950 hover:bg-slate-850 border-slate-800 hover:border-slate-755 text-amber-400 hover:text-amber-350 cursor-pointer'
                                    : 'bg-slate-900 border-slate-850 text-slate-655 cursor-not-allowed opacity-50'
                                }`}
                              >
                                <Edit size={10} /> Sửa
                              </button>
                              <button
                                type="button"
                                disabled={currentUser?.role !== 'admin' || isProcessing}
                                onClick={() => handleDeleteUser(user.username)}
                                className={`flex items-center gap-1 px-2 py-1 border rounded text-[10px] font-bold transition-all shadow select-none ${
                                  currentUser?.role === 'admin'
                                    ? 'bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 hover:text-rose-350 border-rose-900/30 hover:border-rose-900/50 cursor-pointer'
                                    : 'bg-slate-900 border-slate-850 text-slate-655 cursor-not-allowed opacity-40'
                                }`}
                                title={currentUser?.role !== 'admin' ? 'Chỉ tài khoản ADMIN mới được phép xóa tài khoản người dùng khác' : undefined}
                              >
                                <Trash2 size={10} /> Xóa
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeSubTab === 'firebase_config' ? (
        <FirebaseConfigTab />
      ) : activeSubTab === 'migration' ? (
        <FirestoreMigrationTool />

      ) : activeSubTab === 'migration_rtdb' ? (
        <RtdbToFirestoreMigrationTool />

      ) : null}

      {/* ADD ACCOUNT MODAL */}
      {isAddModalOpen && (
        <div id="add-user-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-fade-in text-slate-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-rose-450 uppercase flex items-center gap-1.5">
                <UserPlus size={14} className="text-rose-550" />
                Thêm tài khoản mới
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên đăng nhập hệ thống</label>
                <input
                  type="text"
                  required
                  placeholder="Nhập viết liền không dấu, vd: nguyenvanb"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 font-semibold"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mật khẩu tài khoản</label>
                <input
                  type="text"
                  required
                  placeholder="Nhập mật khẩu"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 font-mono font-semibold"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phân quyền vai trò</label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none font-bold cursor-pointer"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as UserRole)}
                >
                  <option value="viewer">VIEWER (Tìm kiếm &amp; Chỉ xem)</option>
                  <option value="editor">EDITOR (Biên tập, Thêm &amp; Sửa)</option>
                  <option value="admin">ADMIN (Quản trị viên đặc quyền)</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-slate-200 rounded text-[11px] font-bold transition-all"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded text-[11px] font-bold transition-all shadow disabled:opacity-50"
                >
                  {isProcessing ? 'Đang thực hiện...' : 'Xác nhận tạo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ACCOUNT MODAL */}
      {isEditModalOpen && (
        <div id="edit-user-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-fade-in text-slate-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-rose-450 uppercase flex items-center gap-1.5">
                <UserCog size={14} className="text-rose-550" />
                Cập nhật tài khoản
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên đăng nhập hệ thống</label>
                <input
                  type="text"
                  required
                  disabled={editingOldUsername === 'admin'}
                  placeholder="vố, vd: nguyenvana"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mật khẩu tài khoản</label>
                <input
                  type="text"
                  required
                  placeholder="Nhập mật khẩu mới"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 font-mono font-semibold"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phân quyền vai trò</label>
                <select
                  disabled={editingOldUsername === 'admin'}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                >
                  <option value="viewer">VIEWER (Tìm kiếm &amp; Chỉ xem)</option>
                  <option value="editor">EDITOR (Biên tập, Thêm &amp; Sửa)</option>
                  <option value="admin">ADMIN (Quản trị viên đặc quyền)</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-slate-200 rounded text-[11px] font-bold transition-all"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded text-[11px] font-bold transition-all shadow disabled:opacity-50"
                >
                  {isProcessing ? 'Đang cập nhật...' : 'Xác nhận cập nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE USER CONFIRMATION MODAL */}
      {userToDelete && (
        <div id="delete-user-modal" className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-fade-in text-slate-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-black text-rose-400 uppercase flex items-center gap-1.5 tracking-wider">
                <AlertOctagon size={16} className="text-rose-500 animate-pulse" />
                Xác nhận xóa tài khoản
              </h3>
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-850 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <p className="text-slate-300 leading-normal font-medium">
                Bạn đang yêu cầu xóa vĩnh viễn tài khoản người dùng dưới đây khỏi hệ thống. Vui lòng xác nhận thông tin chi tiết:
              </p>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 space-y-2 font-semibold">
                <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Tên đăng nhập:</span>
                  <span className="text-white font-mono font-bold text-sm bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    @{userToDelete.username}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Vai trò hiện tại:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-black ${
                    userToDelete.role === 'admin' ? 'bg-rose-500/10 text-rose-455 border border-rose-500/20' :
                    userToDelete.role === 'editor' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                  }`}>
                    {userToDelete.role}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Ngày đăng ký:</span>
                  <span className="text-slate-300 font-mono">
                    {formatTime(userToDelete.createdAt || 0) || 'Mặc định ban đầu'}
                  </span>
                </div>
              </div>

              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2.5">
                <AlertOctagon size={16} className="text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-extrabold text-rose-400 uppercase text-[10px] tracking-wider">CẢNH BÁO THAO TÁC NGUY HIỂM</h4>
                  <p className="text-rose-300/90 text-[10.5px] leading-relaxed">
                    Thao tác xóa tài khoản này <strong>không thể hoàn tác</strong>. Người dùng sẽ bị tước bỏ toàn bộ quyền truy cập và không thể đăng nhập lại.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded text-xs font-bold transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={confirmDeleteUser}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
                {isProcessing ? 'Đang thực hiện...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Personnel } from '../../types';
import { 
  subscribePersonnelDirectory, addPersonnel, updatePersonnel, deletePersonnel, togglePersonnelActive 
} from '../lib/personnelService';
import { Search, Plus, Edit2, Trash2, Power, Building, UserCheck } from 'lucide-react';

interface PersonnelDirectoryManagerProps {
  className?: string;
  isCompact?: boolean;
}

export const PersonnelDirectoryManager: React.FC<PersonnelDirectoryManagerProps> = ({ 
  className = '',
  isCompact = false
}) => {
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  
  // Modal / Inline Edit Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null means creating new
  const [formData, setFormData] = useState<{
    gender: 'Ông' | 'Bà';
    fullName: string;
    defaultTitle: string;
    company: string;
    active: boolean;
  }>({
    gender: 'Ông',
    fullName: '',
    defaultTitle: '',
    company: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    active: true
  });

  // Deleting State
  const [deletingPersonnel, setDeletingPersonnel] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsub = subscribePersonnelDirectory((list) => {
      setPersonnelList(list);
    });
    return () => unsub();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      gender: 'Ông',
      fullName: '',
      defaultTitle: '',
      company: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
      active: true
    });
    setIsEditing(true);
    setMessage(null);
  };

  const handleOpenEdit = (p: Personnel) => {
    setEditingId(p.id);
    setFormData({
      gender: p.gender || 'Ông',
      fullName: p.fullName || '',
      defaultTitle: p.defaultTitle || '',
      company: p.company || 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
      active: p.active !== undefined ? p.active : true
    });
    setIsEditing(true);
    setMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim()) {
      setMessage({ text: 'Vui lòng nhập Họ và tên nhân sự!', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updatePersonnel(editingId, formData);
        setMessage({ text: 'Đã cập nhật thông tin nhân sự thành công!', type: 'success' });
      } else {
        await addPersonnel(formData);
        setMessage({ text: 'Đã thêm nhân sự mới vào Danh bạ thành công!', type: 'success' });
      }
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Có lỗi xảy ra khi lưu nhân sự!', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (id: string, name: string) => {
    setDeletingPersonnel({ id, name });
  };

  const confirmDelete = async () => {
    if (!deletingPersonnel) return;
    const { id, name } = deletingPersonnel;
    setIsDeleting(true);
    try {
      await deletePersonnel(id);
      setMessage({ text: `Đã xóa thành công nhân sự "${name}" khỏi Danh bạ!`, type: 'success' });
      setDeletingPersonnel(null);
    } catch (err) {
      console.error(err);
      setMessage({ text: `Lỗi khi xóa nhân sự "${name}"!`, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await togglePersonnelActive(id);
      const target = personnelList.find(p => p.id === id);
      const newStatus = target?.active ? 'Đã ẩn' : 'Đã bật';
      setMessage({ text: `${newStatus} nhân sự "${target?.fullName || ''}" thành công!`, type: 'success' });
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Lỗi khi thay đổi trạng thái hoạt động!', type: 'error' });
    }
  };

  // Filter list
  const filteredList = personnelList.filter(p => {
    const matchSearch = 
      p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.defaultTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.company.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'ACTIVE') return matchSearch && p.active;
    if (statusFilter === 'INACTIVE') return matchSearch && !p.active;
    return matchSearch;
  });

  return (
    <div className={`space-y-4 text-slate-100 ${className}`}>
      {/* HEADER & TOP BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="text-indigo-400" size={18} />
            <h3 className="font-bold text-sm uppercase tracking-wider text-white">DANH BẠ NHÂN SỰ BÊN NHẬN</h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Mô hình Danh bạ dùng chung cho các biểu mẫu (BM03.2, BM02,...). Không cố định thứ tự.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
        >
          <Plus size={16} /> Thêm nhân sự
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between ${
          message.type === 'success' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-rose-950/80 border border-rose-800 text-rose-300'
        }`}>
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* MODAL / FORM CHỈNH SỬA & THÊM */}
      {isEditing && (
        <form onSubmit={handleSave} className="bg-slate-900 border border-indigo-500/50 p-4 rounded-xl space-y-3.5 shadow-xl animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-300 flex items-center gap-2">
              {editingId ? <Edit2 size={14} /> : <Plus size={14} />}
              {editingId ? 'Chỉnh sửa nhân sự' : 'Thêm nhân sự mới vào Danh bạ'}
            </h4>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded"
            >
              Đóng
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Giới tính */}
            <div>
              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                Giới tính
              </label>
              <div className="flex gap-4 items-center bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-200">
                  <input
                    type="radio"
                    name="gender"
                    value="Ông"
                    checked={formData.gender === 'Ông'}
                    onChange={() => setFormData({ ...formData, gender: 'Ông' })}
                    className="accent-indigo-500"
                  />
                  <span>Ông</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-200">
                  <input
                    type="radio"
                    name="gender"
                    value="Bà"
                    checked={formData.gender === 'Bà'}
                    onChange={() => setFormData({ ...formData, gender: 'Bà' })}
                    className="accent-indigo-500"
                  />
                  <span>Bà</span>
                </label>
              </div>
            </div>

            {/* Họ và tên */}
            <div>
              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                Họ và tên <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Nhập họ và tên..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>

            {/* Chức vụ mặc định */}
            <div>
              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                Chức vụ mặc định
              </label>
              <input
                type="text"
                placeholder="VD: Chỉ huy trưởng, Giám sát thi công..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                value={formData.defaultTitle}
                onChange={(e) => setFormData({ ...formData, defaultTitle: e.target.value })}
              />
            </div>

            {/* Công ty */}
            <div>
              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                Công ty / Đơn vị
              </label>
              <input
                type="text"
                placeholder="Tên công ty..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <span>Cho phép sử dụng (Hoạt động)</span>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-xs"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow"
              >
                {saving ? 'Đang lưu...' : 'Lưu nhân sự'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Tìm theo tên, chức vụ..."
            className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
              statusFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Tất cả ({personnelList.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
              statusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Hoạt động ({personnelList.filter(p => p.active).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
              statusFilter === 'INACTIVE' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Đã tắt ({personnelList.filter(p => !p.active).length})
          </button>
        </div>
      </div>

      {/* LIST OF PERSONNEL */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/60 max-h-[380px] overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs italic">
            Không tìm thấy nhân sự phù hợp trong Danh bạ.
          </div>
        ) : (
          filteredList.map((p, idx) => (
            <div 
              key={p.id ? `personnel-${p.id}-${idx}` : `personnel-idx-${idx}`}
              className={`p-3 flex items-center justify-between gap-3 hover:bg-slate-900/60 transition-colors ${
                !p.active ? 'opacity-50 bg-slate-950/50' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                  p.gender === 'Bà' ? 'bg-pink-900/60 text-pink-300 border border-pink-700/50' : 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                }`}>
                  {p.gender === 'Bà' ? 'Bà' : 'Ông'}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-white truncate">{p.fullName}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                      p.active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80' : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {p.active ? 'Hoạt động' : 'Đã ẩn'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5 flex-wrap">
                    <span>Chức vụ: <strong className="text-slate-200">{p.defaultTitle || 'Chưa thiết lập'}</strong></span>
                    {p.company && (
                      <span className="text-slate-500 text-[11px] flex items-center gap-1">
                        <Building size={11} /> {p.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title={p.active ? 'Tắt nhân sự này' : 'Bật nhân sự này'}
                  onClick={() => handleToggle(p.id)}
                  className={`p-1.5 rounded-lg text-xs transition-colors ${
                    p.active ? 'text-emerald-400 hover:bg-emerald-950/60' : 'text-slate-500 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Power size={15} />
                </button>

                <button
                  type="button"
                  title="Sửa nhân sự"
                  onClick={() => handleOpenEdit(p)}
                  className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/60 rounded-lg transition-colors"
                >
                  <Edit2 size={15} />
                </button>

                <button
                  type="button"
                  title="Xóa nhân sự"
                  onClick={() => handleDeleteClick(p.id, p.fullName)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/60 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CONFIRMATION DIALOG MODAL */}
      {deletingPersonnel && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/50 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-950/80 rounded-xl border border-rose-800/80">
                <Trash2 size={22} />
              </div>
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wider text-white">XÁC NHẬN XÓA NHÂN SỰ</h4>
                <p className="text-xs text-slate-400 mt-0.5">Xóa nhân sự khỏi Danh bạ nhân sự bên nhận</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa nhân sự <strong className="text-white text-sm">{deletingPersonnel.name}</strong> khỏi Danh bạ không?
            </div>

            <p className="text-[11px] text-slate-400 italic bg-slate-950/50 p-2 rounded border border-slate-800/60">
              * Lưu ý: Thao tác này không ảnh hưởng đến các phiếu BM03.2 lịch sử đã lưu (Snapshot).
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingPersonnel(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all"
              >
                {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

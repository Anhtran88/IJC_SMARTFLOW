import React, { useState, useEffect } from 'react';
import { BM032Representative, Personnel } from '../../types';
import { subscribePersonnelDirectory, addPersonnel } from '../lib/personnelService';
import { 
  ArrowUp, ArrowDown, Trash2, Plus, BookmarkPlus, Check, ChevronDown, UserCheck 
} from 'lucide-react';

interface BM032ReceiverListEditorProps {
  label?: string;
  receiverList: BM032Representative[];
  onChange: (newList: BM032Representative[]) => void;
  receiverCompany: string;
  onReceiverCompanyChange: (company: string) => void;
}

export const BM032ReceiverListEditor: React.FC<BM032ReceiverListEditorProps> = ({
  label,
  receiverList = [],
  onChange,
  receiverCompany = '',
  onReceiverCompanyChange
}) => {
  const [directory, setDirectory] = useState<Personnel[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribePersonnelDirectory((list) => {
      // Filter active personnel only for the dropdown
      setDirectory(list.filter(p => p.active));
    });
    return () => unsub();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Helper to update a row
  const updateRow = (index: number, updates: Partial<BM032Representative>) => {
    const newList = [...receiverList];
    newList[index] = { ...newList[index], ...updates };
    onChange(newList);
  };

  // Move row up
  const moveUp = (index: number) => {
    if (index <= 0) return;
    const newList = [...receiverList];
    const temp = newList[index - 1];
    newList[index - 1] = newList[index];
    newList[index] = temp;
    onChange(newList);
  };

  // Move row down
  const moveDown = (index: number) => {
    if (index >= receiverList.length - 1) return;
    const newList = [...receiverList];
    const temp = newList[index + 1];
    newList[index + 1] = newList[index];
    newList[index] = temp;
    onChange(newList);
  };

  // Delete row
  const deleteRow = (index: number) => {
    const newList = [...receiverList];
    newList.splice(index, 1);
    onChange(newList);
  };

  // Add person (default: Người ngoài danh bạ)
  const handleAddPerson = () => {
    const newRow: BM032Representative = {
      salutation: 'Ông',
      name: '',
      position: '',
      isExternal: true
    };
    onChange([...receiverList, newRow]);
  };

  // Select personnel from dropdown
  const handleSelectPersonnel = (index: number, personnelId: string) => {
    if (personnelId === '__EXTERNAL__') {
      updateRow(index, {
        personnelId: undefined,
        isExternal: true,
        name: '',
        position: '',
        salutation: 'Ông'
      });
      return;
    }

    const selectedPerson = directory.find(p => p.id === personnelId);
    if (selectedPerson) {
      updateRow(index, {
        personnelId: selectedPerson.id,
        salutation: selectedPerson.gender || 'Ông',
        name: selectedPerson.fullName,
        position: selectedPerson.defaultTitle || '',
        company: selectedPerson.company || receiverCompany,
        isExternal: false
      });
    }
  };

  // Save external person to permanent Personnel Directory
  const handleSaveToDirectory = async (index: number) => {
    const row = receiverList[index];
    if (!row.name.trim()) {
      showToast('Vui lòng nhập Họ tên trước khi lưu vào Danh bạ!');
      return;
    }

    try {
      const savedPerson = await addPersonnel({
        gender: (row.salutation as 'Ông' | 'Bà') || 'Ông',
        fullName: row.name.trim(),
        defaultTitle: row.position.trim(),
        company: row.company || receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
        active: true
      });

      updateRow(index, {
        personnelId: savedPerson.id,
        isExternal: false
      });

      showToast(`Đã lưu "${savedPerson.fullName}" vào Danh bạ nhân sự!`);
    } catch (err) {
      console.error(err);
      showToast('Có lỗi xảy ra khi lưu vào Danh bạ!');
    }
  };

  return (
    <div className="space-y-1.5 border border-blue-200/80 bg-blue-50/30 p-2.5 rounded-lg text-slate-800 text-xs">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-indigo-500 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check size={15} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* RECEIVER COMPANY HEADER */}
      <div className="font-bold uppercase flex items-center gap-2 pb-1 border-b border-blue-200">
        <span className="underline text-blue-900 shrink-0">{label || 'BÊN NHẬN:'}</span>
        <input 
          className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 font-bold uppercase text-slate-900 focus:ring-1 focus:ring-blue-500 text-xs"
          value={receiverCompany} 
          onChange={(e) => onReceiverCompanyChange(e.target.value)} 
          placeholder="Tên công ty bên nhận..."
        />
      </div>

      {/* RECIPIENTS LIST (COMPACT CARDS) */}
      <div className="space-y-1.5 pt-0.5">
        {receiverList.length === 0 ? (
          <div className="text-center p-3 text-xs italic text-slate-500 bg-white/60 rounded border border-dashed border-slate-300">
            Chưa có nhân sự bên nhận. Bấm "+ Thêm người" bên dưới để chọn.
          </div>
        ) : (
          receiverList.map((row, i) => {
            // Find matched person in directory by ID or by Full Name (for backward compatibility)
            const matchedByDirectoryId = row.personnelId ? directory.find(p => p.id === row.personnelId) : null;
            const matchedByName = !matchedByDirectoryId && row.name ? directory.find(p => p.fullName === row.name) : null;
            const matchedPerson = matchedByDirectoryId || matchedByName;

            const isSavedInDirectory = !!matchedPerson;
            const selectedVal = matchedPerson ? matchedPerson.id : '__EXTERNAL__';

            return (
              <div 
                key={row.personnelId ? `rcv-${row.personnelId}-${i}` : `rcv-${i}`} 
                className="bg-white border border-slate-200 hover:border-blue-400 rounded-md p-1.5 shadow-sm transition-all flex flex-wrap lg:flex-nowrap items-center gap-2"
              >
                {/* INDEX */}
                <span className="font-extrabold text-xs text-blue-900 shrink-0 min-w-[20px]">#{i + 1}</span>

                {/* DROPDOWN CHỌN NHÂN SỰ */}
                <div className="relative min-w-[220px] flex-1">
                  <select
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-blue-500 pr-6 appearance-none"
                    value={selectedVal}
                    onChange={(e) => handleSelectPersonnel(i, e.target.value)}
                  >
                    <option value="__EXTERNAL__">-- Người ngoài danh bạ --</option>
                    {directory.map((p, idx) => (
                      <option key={p.id ? `dir-${p.id}-${idx}` : `dir-idx-${idx}`} value={p.id}>
                        {p.gender}: {p.fullName} ({p.defaultTitle || 'Chưa có chức vụ'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1.5 text-slate-400 pointer-events-none" />
                </div>

                {/* IF PERSON FROM DIRECTORY IS SELECTED */}
                {isSavedInDirectory ? (
                  <>
                    {/* CHỨC VỤ (EDITABLE FOR THIS FORM) */}
                    <div className="flex items-center gap-1 min-w-[180px] flex-1">
                      <span className="font-bold text-slate-600 shrink-0 text-xs">Chức vụ:</span>
                      <input
                        type="text"
                        placeholder="Chức vụ..."
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-semibold text-slate-900 focus:ring-1 focus:ring-blue-500 text-xs"
                        value={row.position || ''}
                        onChange={(e) => updateRow(i, { position: e.target.value })}
                      />
                    </div>

                    {/* STATUS BADGE */}
                    <span className="px-1.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded flex items-center gap-0.5 shrink-0" title="Đã có trong Danh bạ nhân sự">
                      <UserCheck size={12} />
                      <span>Danh bạ</span>
                    </span>
                  </>
                ) : (
                  /* IF EXTERNAL PERSON IS SELECTED */
                  <>
                    {/* GIỚI TÍNH */}
                    <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200 shrink-0">
                      <span className="font-bold text-[10px] text-slate-500 uppercase">Giới tính:</span>
                      <label className="flex items-center gap-0.5 cursor-pointer font-bold text-slate-700 text-xs">
                        <input
                          type="radio"
                          name={`gender_${i}`}
                          value="Ông"
                          checked={row.salutation === 'Ông'}
                          onChange={() => updateRow(i, { salutation: 'Ông' })}
                          className="accent-blue-600"
                        />
                        <span>Ông</span>
                      </label>
                      <label className="flex items-center gap-0.5 cursor-pointer font-bold text-slate-700 text-xs ml-1">
                        <input
                          type="radio"
                          name={`gender_${i}`}
                          value="Bà"
                          checked={row.salutation === 'Bà'}
                          onChange={() => updateRow(i, { salutation: 'Bà' })}
                          className="accent-blue-600"
                        />
                        <span>Bà</span>
                      </label>
                    </div>

                    {/* HỌ VÀ TÊN */}
                    <div className="flex items-center gap-1 min-w-[140px] flex-1">
                      <span className="font-bold text-slate-600 shrink-0 text-xs">Họ tên:</span>
                      <input
                        type="text"
                        placeholder="Họ và tên..."
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-semibold text-slate-900 focus:ring-1 focus:ring-blue-500 text-xs"
                        value={row.name || ''}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                      />
                    </div>

                    {/* CHỨC VỤ */}
                    <div className="flex items-center gap-1 min-w-[140px] flex-1">
                      <span className="font-bold text-slate-600 shrink-0 text-xs">Chức vụ:</span>
                      <input
                        type="text"
                        placeholder="Chức vụ..."
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-semibold text-slate-900 focus:ring-1 focus:ring-blue-500 text-xs"
                        value={row.position || ''}
                        onChange={(e) => updateRow(i, { position: e.target.value })}
                      />
                    </div>

                    {/* LƯU VÀO DANH BẠ BUTTON */}
                    <button
                      type="button"
                      onClick={() => handleSaveToDirectory(i)}
                      title="Lưu người này vào Danh bạ nhân sự lâu dài"
                      className="px-1.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold rounded flex items-center gap-1 transition-colors shrink-0"
                    >
                      <BookmarkPlus size={12} className="text-amber-600" />
                      <span>Lưu Danh bạ</span>
                    </button>
                  </>
                )}

                {/* ACTION BUTTONS (UP, DOWN, DELETE) AT THE RIGHT */}
                <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1 shrink-0 ml-auto">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => moveUp(i)}
                    title="Chuyển lên"
                    className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={i === receiverList.length - 1}
                    onClick={() => moveDown(i)}
                    title="Chuyển xuống"
                    className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRow(i)}
                    title="Xóa người này"
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ADD BUTTON AT BOTTOM */}
      <div className="pt-1.5 border-t border-blue-200 flex justify-start">
        <button
          type="button"
          onClick={handleAddPerson}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <Plus size={14} /> Thêm người
        </button>
      </div>
    </div>
  );
};

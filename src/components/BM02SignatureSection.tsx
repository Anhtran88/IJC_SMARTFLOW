import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, UserCheck, X, User, Edit3 } from 'lucide-react';
import { subscribePersonnelDirectory, getLocalPersonnelList } from '../lib/personnelService';
import { Personnel } from '../../types';

export interface BM02SignatureItem {
  id?: string;
  chucDanh: string;
  hoTen: string;
  viTri: number;
}

interface BM02SignatureSectionProps {
  kyTenList: BM02SignatureItem[];
  onChange: (updatedList: BM02SignatureItem[]) => void;
  readOnly?: boolean;
}

interface SingleSignatureDropdownProps {
  item: BM02SignatureItem;
  personnelList: Personnel[];
  onSelectPerson: (personName: string) => void;
  readOnly?: boolean;
}

const SingleSignatureDropdown: React.FC<SingleSignatureDropdownProps> = ({
  item,
  personnelList,
  onSelectPerson,
  readOnly = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCustomEditing, setIsCustomEditing] = useState(false);
  const [customName, setCustomName] = useState(item.hoTen || '');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomName(item.hoTen || '');
  }, [item.hoTen]);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCustomEditing(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activePersonnel = personnelList.filter(p => p && p.active !== false);

  const filteredPersonnel = activePersonnel.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      (p.fullName && p.fullName.toLowerCase().includes(q)) ||
      (p.defaultTitle && p.defaultTitle.toLowerCase().includes(q)) ||
      (p.company && p.company.toLowerCase().includes(q))
    );
  });

  const handleSelect = (name: string) => {
    onSelectPerson(name.trim());
    setCustomName(name.trim());
    setIsOpen(false);
    setIsCustomEditing(false);
    setSearch('');
  };

  const handleCustomSubmit = () => {
    onSelectPerson(customName.trim());
    setIsCustomEditing(false);
    setIsOpen(false);
  };

  const currentDisplayName = item.hoTen ? String(item.hoTen).toUpperCase() : '';

  return (
    <div className="relative flex flex-col items-center w-full" ref={dropdownRef}>
      {/* Title */}
      <span className="text-xs font-semibold text-slate-800 tracking-wider uppercase mb-1">
        {item.chucDanh}
      </span>

      {/* Signature Gap */}
      <div className="h-10 sm:h-12 w-full flex items-center justify-center pointer-events-none">
        {/* Subtle placeholder line for print / visual spacing */}
      </div>

      {/* Print View: Pure Text */}
      <div className="hidden print:block font-bold text-black uppercase text-sm sm:text-base tracking-wide text-center">
        {currentDisplayName || '................................'}
      </div>

      {/* Interactive Screen View */}
      {!readOnly ? (
        <div className="print:hidden w-full max-w-[260px] relative">
          {isCustomEditing ? (
            <div className="flex items-center gap-1 bg-white border-2 border-indigo-500 rounded-lg px-2 py-1 shadow-md">
              <input
                ref={inputRef}
                type="text"
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomSubmit();
                  if (e.key === 'Escape') {
                    setIsCustomEditing(false);
                    setCustomName(item.hoTen || '');
                  }
                }}
                placeholder="Nhập họ và tên..."
                className="w-full text-xs font-bold uppercase text-slate-900 focus:outline-none bg-transparent"
              />
              <button
                type="button"
                onClick={handleCustomSubmit}
                className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 transition"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCustomEditing(false);
                  setCustomName(item.hoTen || '');
                }}
                className="p-0.5 text-slate-400 hover:text-slate-600 rounded"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              id={`btn-signature-${item.id || item.chucDanh}`}
              onClick={() => setIsOpen(!isOpen)}
              className={`w-full group px-2.5 py-1.5 rounded-lg border text-center transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                isOpen 
                  ? 'border-indigo-500 bg-indigo-50/80 shadow-md ring-2 ring-indigo-500/20' 
                  : 'border-slate-200 hover:border-indigo-300 bg-white/70 hover:bg-white shadow-sm'
              }`}
            >
              <div className="flex-1 text-center min-w-0">
                <span className={`block truncate font-bold text-xs sm:text-sm uppercase tracking-wide ${
                  currentDisplayName ? 'text-slate-900' : 'text-slate-400 italic'
                }`}>
                  {currentDisplayName || '(Chọn người ký)'}
                </span>
              </div>
              <ChevronDown 
                size={14} 
                className={`text-slate-400 group-hover:text-indigo-600 shrink-0 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-indigo-600' : ''
                }`} 
              />
            </button>
          )}

          {/* Dropdown Popover */}
          {isOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="p-2.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <UserCheck size={14} className="text-indigo-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Chọn {item.chucDanh}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Search input */}
              <div className="p-2 border-b border-slate-100 bg-slate-50">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm tên nhân sự, chức vụ..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-800"
                    autoFocus
                  />
                </div>
              </div>

              {/* Personnel List */}
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                {filteredPersonnel.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 italic">
                    Không tìm thấy nhân sự phù hợp
                  </div>
                ) : (
                  filteredPersonnel.map((person) => {
                    const isSelected = item.hoTen && item.hoTen.toLowerCase().trim() === person.fullName.toLowerCase().trim();
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => handleSelect(person.fullName)}
                        className={`w-full p-2.5 text-left flex items-start gap-2.5 transition-colors cursor-pointer ${
                          isSelected 
                            ? 'bg-indigo-50/80 hover:bg-indigo-100/70 text-indigo-950 font-bold' 
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5 ${
                          person.gender === 'Bà' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {person.gender === 'Bà' ? 'Bà' : 'Ông'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold uppercase truncate text-slate-900">
                              {person.fullName}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] text-indigo-600 bg-indigo-100 px-1.5 py-0.2 rounded font-semibold shrink-0">
                                Đang chọn
                              </span>
                            )}
                          </div>
                          {person.defaultTitle && (
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {person.defaultTitle}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Bottom Custom Input Option */}
              <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomEditing(true);
                    setIsOpen(false);
                  }}
                  className="flex-1 text-center py-1.5 px-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs rounded-lg transition flex items-center justify-center gap-1.5"
                >
                  <Edit3 size={13} />
                  <span>Nhập tên tự do</span>
                </button>
                {item.hoTen && (
                  <button
                    type="button"
                    onClick={() => handleSelect('')}
                    className="py-1.5 px-2.5 text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold text-xs rounded-lg transition"
                    title="Xóa người ký"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="font-bold text-slate-900 uppercase text-sm sm:text-base tracking-wide text-center">
          {currentDisplayName || '................................'}
        </div>
      )}
    </div>
  );
};

export const BM02SignatureSection: React.FC<BM02SignatureSectionProps> = ({
  kyTenList,
  onChange,
  readOnly = false
}) => {
  const [personnelList, setPersonnelList] = useState<Personnel[]>(() => getLocalPersonnelList());

  useEffect(() => {
    const unsub = subscribePersonnelDirectory((list) => {
      if (Array.isArray(list)) {
        setPersonnelList(list);
      }
    });
    return () => unsub();
  }, []);

  const items = [...(kyTenList || [])].sort((a, b) => (a.viTri || 0) - (b.viTri || 0));

  const handleUpdateItem = (sigId: string | undefined, index: number, newName: string) => {
    const updated = items.map((item, idx) => {
      if ((sigId && item.id === sigId) || idx === index) {
        return { ...item, hoTen: newName };
      }
      return item;
    });
    onChange(updated);
  };

  if (!items || items.length === 0) return null;

  // Layout distribution:
  // If exactly 4 items: Row 1 has 3 items, Row 2 has 1 item centered (classic BM02 layout)
  if (items.length === 4) {
    const topRow = items.slice(0, 3);
    const bottomRow = items.slice(3, 4);

    return (
      <div className="mt-8 pt-4 space-y-8">
        {/* Row 1: 3 columns */}
        <div className="grid grid-cols-3 gap-4 text-center">
          {topRow.map((item, idx) => (
            <SingleSignatureDropdown
              key={item.id || `sig-top-${idx}`}
              item={item}
              personnelList={personnelList}
              onSelectPerson={(name) => handleUpdateItem(item.id, idx, name)}
              readOnly={readOnly}
            />
          ))}
        </div>

        {/* Row 2: 1 centered column */}
        <div className="flex justify-center text-center">
          <div className="w-full max-w-xs">
            {bottomRow.map((item, idx) => (
              <SingleSignatureDropdown
                key={item.id || `sig-bot-${idx}`}
                item={item}
                personnelList={personnelList}
                onSelectPerson={(name) => handleUpdateItem(item.id, 3 + idx, name)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Generic grouping for other counts (chunks of 3)
  const rows: BM02SignatureItem[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push(items.slice(i, i + 3));
  }

  return (
    <div className="mt-8 pt-4 space-y-8">
      {rows.map((row, rowIdx) => {
        const isSingleItemInLastRow = row.length === 1 && rows.length > 1;

        if (isSingleItemInLastRow) {
          return (
            <div key={`row-${rowIdx}`} className="flex justify-center text-center">
              <div className="w-full max-w-xs">
                {row.map((item, idx) => {
                  const globalIdx = rowIdx * 3 + idx;
                  return (
                    <SingleSignatureDropdown
                      key={item.id || `sig-${globalIdx}`}
                      item={item}
                      personnelList={personnelList}
                      onSelectPerson={(name) => handleUpdateItem(item.id, globalIdx, name)}
                      readOnly={readOnly}
                    />
                  );
                })}
              </div>
            </div>
          );
        }

        const gridColsClass = row.length === 1 
          ? 'grid-cols-1 max-w-xs mx-auto' 
          : row.length === 2 
            ? 'grid-cols-2 max-w-xl mx-auto' 
            : 'grid-cols-3';

        return (
          <div key={`row-${rowIdx}`} className={`grid ${gridColsClass} gap-4 text-center`}>
            {row.map((item, idx) => {
              const globalIdx = rowIdx * 3 + idx;
              return (
                <SingleSignatureDropdown
                  key={item.id || `sig-${globalIdx}`}
                  item={item}
                  personnelList={personnelList}
                  onSelectPerson={(name) => handleUpdateItem(item.id, globalIdx, name)}
                  readOnly={readOnly}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

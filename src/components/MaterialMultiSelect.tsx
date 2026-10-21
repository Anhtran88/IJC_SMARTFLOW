import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, CheckSquare, Square, X } from 'lucide-react';

export interface MaterialTypeItem {
  id: string;
  ten: string;
  icon?: string;
  trangThai?: string;
  [key: string]: any;
}

interface MaterialMultiSelectProps {
  materials: MaterialTypeItem[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
}

export const MaterialMultiSelect: React.FC<MaterialMultiSelectProps> = ({
  materials = [],
  selectedIds = [],
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeMaterials = materials.filter(item => item.trangThai !== 'hidden');
  const allIds = activeMaterials.map(m => m.id);

  const isAllSelected = selectedIds.length === 0 || selectedIds.includes('all');
  const isNoneSelected = selectedIds.includes('NONE');

  // Filter materials by search query inside dropdown
  const filteredMaterials = activeMaterials.filter(m =>
    (m.ten || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Determine button label text
  const getDisplayText = () => {
    if (isAllSelected) {
      return 'Tất cả loại vật tư';
    }
    if (isNoneSelected || selectedIds.length === 0) {
      return 'Chưa chọn loại nào';
    }
    if (selectedIds.length === 1) {
      const found = activeMaterials.find(m => m.id === selectedIds[0]);
      return found ? `${found.icon || '📦'} ${found.ten}` : '1 loại vật tư';
    }
    if (selectedIds.length === activeMaterials.length) {
      return 'Tất cả loại vật tư';
    }
    return `Đã chọn (${selectedIds.length}/${activeMaterials.length})`;
  };

  const handleToggleSelectAll = (checkAll: boolean) => {
    if (checkAll) {
      onChange([]); // [] represents all selected
    } else {
      onChange(['NONE']); // NONE represents none selected
    }
  };

  const handleToggleItem = (id: string) => {
    if (isAllSelected) {
      // Unchecking one item from 'all selected' state
      const newSelected = allIds.filter(item => item !== id);
      onChange(newSelected.length === 0 ? ['NONE'] : newSelected);
    } else if (isNoneSelected) {
      // Checking one item from 'none selected' state
      onChange([id]);
    } else {
      let newSelected: string[];
      if (selectedIds.includes(id)) {
        newSelected = selectedIds.filter(item => item !== id);
      } else {
        newSelected = [...selectedIds, id];
      }

      if (newSelected.length === 0) {
        onChange(['NONE']);
      } else if (newSelected.length === activeMaterials.length) {
        onChange([]); // Normalize back to [] for 'All'
      } else {
        onChange(newSelected);
      }
    }
  };

  const isItemChecked = (id: string) => {
    if (isAllSelected) return true;
    if (isNoneSelected) return false;
    return selectedIds.includes(id);
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-xs flex items-center justify-between gap-2 min-w-[170px] max-w-[240px] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all cursor-pointer"
      >
        <span className="truncate text-left flex-1">{getDisplayText()}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-1 w-72 rounded-xl shadow-xl bg-white border border-slate-200 ring-1 ring-black ring-opacity-5 z-50 overflow-hidden text-xs">
          {/* Quick Search */}
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm loại vật tư..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="p-2 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => handleToggleSelectAll(true)}
              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md transition-colors flex items-center gap-1 font-bold cursor-pointer"
            >
              <CheckSquare size={12} />
              <span>Chọn tất cả</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleSelectAll(false)}
              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition-colors flex items-center gap-1 font-bold cursor-pointer"
            >
              <Square size={12} />
              <span>Bỏ chọn tất cả</span>
            </button>
          </div>

          {/* Material Type Items List */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-slate-50">
            {/* 'Tất cả loại vật tư' special row */}
            <label
              className={`flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50/60 rounded-lg cursor-pointer transition-colors font-bold ${
                isAllSelected ? 'text-indigo-600 bg-indigo-50/40' : 'text-slate-700'
              }`}
            >
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={e => handleToggleSelectAll(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex-1 truncate">Tất cả loại vật tư</span>
            </label>

            {/* List of individual material types */}
            {filteredMaterials.length === 0 ? (
              <div className="p-3 text-center text-slate-400 font-medium italic">
                Không tìm thấy loại vật tư
              </div>
            ) : (
              filteredMaterials.map(vt => {
                const checked = isItemChecked(vt.id);
                return (
                  <label
                    key={vt.id}
                    className={`flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors font-medium ${
                      checked ? 'text-slate-900 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleItem(vt.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-base leading-none">{vt.icon || '📦'}</span>
                    <span className="flex-1 truncate">{vt.ten}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

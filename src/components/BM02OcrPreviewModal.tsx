import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Plus, 
  X, 
  FileText, 
  Building2, 
  Calendar, 
  MapPin, 
  Tag, 
  Layers, 
  ArrowRight,
  ShieldAlert,
  Info,
  Search,
  Database,
  RefreshCw,
  PlusCircle,
  ExternalLink
} from 'lucide-react';
import { numberToVietnameseWords } from '../utils/numberToWords';
import { MaterialMatchingService, MasterCatalogItem } from '../services/MaterialMatchingService';
import { cleanProposerName } from '../utils/proposerUtils';
import { formatBM02Currency, parseVNNumber } from '../lib/formatUtils';

export interface OcrItem {
  id: string;
  stt: number;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  note: string;
  needsCheck?: boolean;
  checkReason?: string;
  originalOcrName?: string;
  
  // Master Catalog Matching fields
  matchedCatalogId?: string;
  maVatTu?: string;
  nhomVatTu?: string;
  quyCach?: string;
  isMatchedWithCatalog?: boolean;
  matchedCatalogName?: string;
  proposedCatalogItem?: MasterCatalogItem;
  proposedConfidence?: number;
  originalCatalogData?: {
    name: string;
    unit: string;
    unitPrice: number;
    quyCach?: string;
    maVatTu?: string;
  };
}

export interface OcrPreviewData {
  fileName: string;
  fileType: string;
  maPhieu?: string;
  congTrinh: string;
  hangMuc: string;
  nhaCungCap: string;
  ngayBaoGia: string;
  diaDiem: string;
  proposingCompany: string;
  soTienBangChu: string;
  thoiHanThanhToan: string;
  nguoiDeNghi?: string;
  pBanDeNghi?: string;
  chiHuyTruong?: string;
  truongBoPhan?: string;
  thuKho?: string;
  items: OcrItem[];
  hasUncertainties?: boolean;
  summaryNotes?: string;
  rawResponse?: any;
}

interface BM02OcrPreviewModalProps {
  isOpen: boolean;
  ocrData: OcrPreviewData | null;
  onClose: () => void;
  onConfirm: (confirmedData: OcrPreviewData) => void;
}

export const BM02OcrPreviewModal: React.FC<BM02OcrPreviewModalProps> = ({
  isOpen,
  ocrData,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !ocrData) return null;

  // Master Catalog State
  const [catalog, setCatalog] = useState<MasterCatalogItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);

  // Search & Create modals for unmatched items
  const [searchModalIndex, setSearchModalIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  const [createModalIndex, setCreateModalIndex] = useState<number | null>(null);
  const [newMaterialName, setNewMaterialName] = useState<string>('');
  const [newMaterialUnit, setNewMaterialUnit] = useState<string>('m3');
  const [newMaterialSpec, setNewMaterialSpec] = useState<string>('');
  const [newMaterialPrice, setNewMaterialPrice] = useState<number>(0);
  const [isSubmittingNewMaterial, setIsSubmittingNewMaterial] = useState<boolean>(false);

  // Local state for live user edits in preview
  const [formData, setFormData] = useState<OcrPreviewData>(() => {
    const initialItems = (ocrData.items || []).map((item, idx) => {
      const q = parseVNNumber(item.quantity, 0, {
        rawStr: item.rawQuantity,
        unit: item.unit,
        total: item.total,
        unitPrice: item.unitPrice,
        fieldRole: 'quantity'
      });
      const p = parseVNNumber(item.unitPrice, 0, {
        rawStr: item.rawUnitPrice,
        unit: item.unit,
        fieldRole: 'unitPrice'
      });
      const tot = item.total > 0 ? item.total : Math.round(q * p * 100) / 100;
      return {
        ...item,
        id: item.id || `ocr-item-${idx}-${Date.now()}`,
        stt: idx + 1,
        quantity: q,
        unitPrice: p,
        total: tot,
        isMatchedWithCatalog: false,
        needsCheck: Boolean(item.needsCheck),
        checkReason: item.checkReason || 'Đang đối chiếu Danh mục vật tư...'
      };
    });

    return {
      ...ocrData,
      hangMuc: (ocrData.hangMuc || '').replace(/^[\s\-_*•]*(-?\s*Nội dung|-?\s*Hạng mục|V\/v)\s*[:：]\s*/i, '').trim(),
      nguoiDeNghi: cleanProposerName(ocrData.nguoiDeNghi || (ocrData as any).proposer || ''),
      items: initialItems
    };
  });

  // Load Master Catalog & Perform Initial Matching
  useEffect(() => {
    async function loadAndMatchCatalog() {
      setIsLoadingCatalog(true);
      const activeLoai = (window as any)._loaiVatTuHienTai || 'BeTong';
      const masterCatalog = await MaterialMatchingService.getMasterCatalog(activeLoai);
      setCatalog(masterCatalog);

      setFormData(prev => {
        const updatedItems = (prev.items || []).map((item) => {
          const rawOcrName = item.originalOcrName || item.name;
          const matchRes = MaterialMatchingService.matchItem(rawOcrName, masterCatalog);

          if (matchRes.matched && matchRes.confidence >= 90 && matchRes.catalogItem) {
            const cat = matchRes.catalogItem;
            const priceToUse = cat.giaHienHanh > 0 ? cat.giaHienHanh : item.unitPrice;
            const q = Number(item.quantity) || 0;
            return {
              ...item,
              originalOcrName: rawOcrName,
              name: cat.tenVatTu, // Standard Name from Master Data
              unit: cat.donVi || item.unit || 'm3', // Standard Unit
              quyCach: cat.quyCach || item.quyCach || '',
              unitPrice: priceToUse, // Current Price from Master Data
              total: Math.round(q * priceToUse * 100) / 100,
              maVatTu: cat.maVatTu || cat.id,
              nhomVatTu: cat.nhomVatTu || activeLoai,
              matchedCatalogId: cat.id,
              isMatchedWithCatalog: true,
              matchedCatalogName: cat.tenVatTu,
              proposedCatalogItem: undefined,
              proposedConfidence: undefined,
              originalCatalogData: {
                name: cat.tenVatTu,
                unit: cat.donVi,
                unitPrice: priceToUse,
                quyCach: cat.quyCach,
                maVatTu: cat.maVatTu || cat.id
              },
              needsCheck: priceToUse <= 0 || q <= 0,
              checkReason: priceToUse <= 0 ? 'Đã khớp Danh mục nhưng chưa có đơn giá' : undefined
            };
          } else if (matchRes.catalogItem && matchRes.confidence >= 70) {
            // Proposed match (70-89% confidence)
            const cat = matchRes.catalogItem;
            return {
              ...item,
              originalOcrName: rawOcrName,
              isMatchedWithCatalog: false,
              proposedCatalogItem: cat,
              proposedConfidence: matchRes.confidence,
              needsCheck: true,
              checkReason: `AI đề xuất (${matchRes.confidence}%): ${cat.tenVatTu}`
            };
          } else {
            return {
              ...item,
              originalOcrName: rawOcrName,
              isMatchedWithCatalog: false,
              proposedCatalogItem: undefined,
              proposedConfidence: undefined,
              needsCheck: true,
              checkReason: 'Chưa tìm thấy vật tư trong Danh mục'
            };
          }
        });
        return { ...prev, items: updatedItems };
      });

      setIsLoadingCatalog(false);
    }

    if (isOpen) {
      loadAndMatchCatalog();
    }
  }, [isOpen]);

  // Calculate overall totals & matching summary
  const totalAmount = Math.round(formData.items.reduce((sum, item) => sum + (Number(item.total) || 0), 0));
  const matchedCount = formData.items.filter(it => it.isMatchedWithCatalog).length;
  const unmatchedCount = formData.items.length - matchedCount;

  const handleHeaderChange = (field: keyof OcrPreviewData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index: number, field: keyof OcrItem, value: any) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      const target = { ...updatedItems[index], [field]: value };

      if (field === 'quantity' || field === 'unitPrice') {
        const q = field === 'quantity' ? Number(value) || 0 : Number(target.quantity) || 0;
        const p = field === 'unitPrice' ? Number(value) || 0 : Number(target.unitPrice) || 0;
        target.total = Math.round(q * p * 100) / 100;
      }

      // Re-evaluate check reason
      const q = Number(target.quantity) || 0;
      const p = Number(target.unitPrice) || 0;
      const nameMissing = !target.name || !target.name.trim();

      target.needsCheck = nameMissing || p <= 0 || q <= 0 || !target.isMatchedWithCatalog;
      if (!target.isMatchedWithCatalog) {
        target.checkReason = 'Chưa tìm thấy vật tư trong Danh mục';
      } else if (p <= 0) {
        target.checkReason = 'Chưa có đơn giá';
      } else {
        target.checkReason = undefined;
      }

      updatedItems[index] = target;
      return { ...prev, items: updatedItems };
    });
  };

  // Assign standard material from Master Catalog to row
  const handleSelectCatalogItem = (index: number, catalogItem: MasterCatalogItem) => {
    setFormData(prev => {
      const updated = [...prev.items];
      const cur = updated[index];
      const rawOcrName = cur.originalOcrName || cur.name;

      // Sprint 2 Requirement 4: Learn alias mapping when user selects or confirms a material
      MaterialMatchingService.saveAliasMapping(rawOcrName, catalogItem);

      const priceToUse = catalogItem.giaHienHanh > 0 ? catalogItem.giaHienHanh : cur.unitPrice;
      const q = Number(cur.quantity) || 0;

      updated[index] = {
        ...cur,
        name: catalogItem.tenVatTu,
        unit: catalogItem.donVi || cur.unit || 'm3',
        quyCach: catalogItem.quyCach || '',
        unitPrice: priceToUse,
        total: Math.round(q * priceToUse * 100) / 100,
        maVatTu: catalogItem.maVatTu || catalogItem.id,
        nhomVatTu: catalogItem.nhomVatTu || 'BeTong',
        matchedCatalogId: catalogItem.id,
        isMatchedWithCatalog: true,
        matchedCatalogName: catalogItem.tenVatTu,
        proposedCatalogItem: undefined,
        proposedConfidence: undefined,
        originalCatalogData: {
          name: catalogItem.tenVatTu,
          unit: catalogItem.donVi,
          unitPrice: priceToUse,
          quyCach: catalogItem.quyCach,
          maVatTu: catalogItem.maVatTu || catalogItem.id
        },
        needsCheck: priceToUse <= 0 || q <= 0,
        checkReason: priceToUse <= 0 ? 'Chưa có đơn giá' : undefined
      };

      return { ...prev, items: updated };
    });

    setSearchModalIndex(null);
  };

  // Register brand new material into Master Catalog
  const handleCreateNewMaterial = async () => {
    if (createModalIndex === null) return;

    const nameTrim = newMaterialName.trim();
    const unitTrim = newMaterialUnit.trim();
    const priceNum = Number(newMaterialPrice);

    if (!nameTrim) {
      alert('Bắt buộc nhập Tên vật tư!');
      return;
    }
    if (!unitTrim) {
      alert('Bắt buộc nhập Đơn vị tính (ĐVT)!');
      return;
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('Bắt buộc nhập Đơn giá hợp lệ lớn hơn 0!');
      return;
    }

    setIsSubmittingNewMaterial(true);

    try {
      const activeLoai = (window as any)._loaiVatTuHienTai || 'BeTong';
      const createdItem = await MaterialMatchingService.addNewMaterialToCatalog(activeLoai, {
        name: nameTrim,
        unit: unitTrim,
        quyCach: newMaterialSpec.trim(),
        unitPrice: priceNum
      });

      if (createdItem) {
        // Save alias mapping for current OCR name -> created Master Material
        if (createModalIndex !== null && formData.items[createModalIndex]) {
          const cur = formData.items[createModalIndex];
          const rawOcrName = cur.originalOcrName || cur.name || nameTrim;
          MaterialMatchingService.saveAliasMapping(rawOcrName, createdItem);
        }

        // Refresh catalog state
        const updatedCat = await MaterialMatchingService.getMasterCatalog(activeLoai);
        setCatalog(updatedCat);

        // Auto-assign created item to current row
        handleSelectCatalogItem(createModalIndex, createdItem);

        // Reset creation form
        setCreateModalIndex(null);
        setNewMaterialName('');
        setNewMaterialSpec('');
        setNewMaterialPrice(0);
      } else {
        alert('Không thể lưu vật tư mới vào Danh mục. Vui lòng thử lại!');
      }
    } catch (e) {
      console.error(e);
      alert('Đã xảy ra lỗi khi tạo vật tư mới!');
    } finally {
      setIsSubmittingNewMaterial(false);
    }
  };

  const handleAddItem = () => {
    setFormData(prev => {
      const newStt = prev.items.length + 1;
      const newItem: OcrItem = {
        id: `custom-item-${Date.now()}`,
        stt: newStt,
        name: '',
        unit: 'm3',
        quantity: 1,
        unitPrice: 0,
        total: 0,
        note: '',
        isMatchedWithCatalog: false,
        needsCheck: true,
        checkReason: 'Chưa chọn vật tư trong Danh mục'
      };
      return { ...prev, items: [...prev.items, newItem] };
    });
  };

  const handleDeleteItem = (index: number) => {
    setFormData(prev => {
      const filtered = prev.items.filter((_, i) => i !== index);
      const reIndexed = filtered.map((item, i) => ({ ...item, stt: i + 1 }));
      return { ...prev, items: reIndexed };
    });
  };

  const handleToggleCheck = (index: number) => {
    setFormData(prev => {
      const updated = [...prev.items];
      updated[index].needsCheck = !updated[index].needsCheck;
      return { ...prev, items: updated };
    });
  };

  const handleReMatchAll = async () => {
    setIsLoadingCatalog(true);
    const activeLoai = (window as any)._loaiVatTuHienTai || 'BeTong';
    const masterCatalog = await MaterialMatchingService.getMasterCatalog(activeLoai);
    setCatalog(masterCatalog);

    setFormData(prev => {
      const updated = prev.items.map(item => {
        const res = MaterialMatchingService.matchItem(item.name, masterCatalog);
        if (res.matched && res.catalogItem) {
          const cat = res.catalogItem;
          const price = cat.giaHienHanh > 0 ? cat.giaHienHanh : item.unitPrice;
          const q = Number(item.quantity) || 0;
          return {
            ...item,
            name: cat.tenVatTu,
            unit: cat.donVi,
            unitPrice: price,
            total: Math.round(q * price * 100) / 100,
            maVatTu: cat.maVatTu || cat.id,
            isMatchedWithCatalog: true,
            matchedCatalogName: cat.tenVatTu,
            originalCatalogData: {
              name: cat.tenVatTu,
              unit: cat.donVi,
              unitPrice: price,
              quyCach: cat.quyCach,
              maVatTu: cat.maVatTu || cat.id
            },
            needsCheck: false,
            checkReason: undefined
          };
        }
        return item;
      });
      return { ...prev, items: updated };
    });
    setIsLoadingCatalog(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-hidden animate-fade-in text-slate-100">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* MODAL HEADER */}
        <header className="px-6 py-4 bg-[#1e293b] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-blue-500/20">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">AI OCR + ĐỐI CHIẾU DANH MỤC VẬT TƯ</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  BM02 Standard
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Xem trước kết quả OCR & kiểm tra dữ liệu chuẩn được lấy từ Ngân hàng danh mục quản lý vật tư.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReMatchAll}
              disabled={isLoadingCatalog}
              title="Thực hiện đối chiếu lại với Danh mục"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              <RefreshCw size={13} className={isLoadingCatalog ? 'animate-spin' : ''} />
              <span>Đối chiếu lại</span>
            </button>

            <button 
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* MATCHING SUMMARY STATS */}
        <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-bold text-emerald-400 bg-emerald-950/40 px-3 py-1 rounded-lg border border-emerald-800/50">
              <CheckCircle2 size={14} />
              <span>Đã khớp Danh mục: {matchedCount} vật tư</span>
            </div>

            {unmatchedCount > 0 ? (
              <div className="flex items-center gap-1.5 font-bold text-amber-400 bg-amber-950/40 px-3 py-1 rounded-lg border border-amber-800/50">
                <AlertTriangle size={14} />
                <span>Chưa tìm thấy trong Danh mục: {unmatchedCount} vật tư</span>
              </div>
            ) : (
              <div className="text-slate-400 flex items-center gap-1">
                <Database size={13} className="text-blue-400" />
                <span>100% vật tư đã được lấy từ Danh mục quản lý chuẩn!</span>
              </div>
            )}
          </div>

          <div className="text-slate-400 text-[11px] font-medium">
            Tệp gốc: <span className="text-slate-200 font-bold">{formData.fileName}</span>
          </div>
        </div>

        {/* BODY CONTENT - SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

          {/* SECTION 1: HEADER METADATA */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={14} />
                <span>Thông tin chứng từ đề nghị (BM02)</span>
              </h3>
              <span className="text-[11px] text-slate-400">Có thể chỉnh sửa trước khi đổ vào biểu mẫu</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Công trình / Dự án</label>
                <input
                  type="text"
                  value={formData.congTrinh}
                  onChange={e => handleHeaderChange('congTrinh', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  placeholder="Nhập tên công trình..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Hạng mục / Nội dung công việc</label>
                <textarea
                  value={formData.hangMuc}
                  onChange={e => handleHeaderChange('hangMuc', e.target.value)}
                  rows={Math.max(1, (formData.hangMuc || '').split('\n').length)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 resize-none whitespace-pre-wrap break-words leading-relaxed"
                  placeholder="Nhập hạng mục / nội dung..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Nhà cung cấp / Đơn vị trình</label>
                <input
                  type="text"
                  value={formData.nhaCungCap}
                  onChange={e => handleHeaderChange('nhaCungCap', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  placeholder="Nhập nhà cung cấp..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center justify-between">
                  <span>Người đề nghị (Chỉ huy trưởng)</span>
                  <span className="text-[10px] text-amber-400 font-bold">P.BAN ĐỀ NGHỊ</span>
                </label>
                <input
                  type="text"
                  value={formData.nguoiDeNghi || ''}
                  onChange={e => handleHeaderChange('nguoiDeNghi', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-bold text-amber-300"
                  placeholder="VD: Đỗ Thế Viễn..."
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: ITEMS TABLE WITH CATALOG MATCHING */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-blue-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Danh sách vật tư đề nghị ({formData.items.length})
                </h3>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                <Plus size={14} />
                <span>Thêm dòng vật tư</span>
              </button>
            </div>

            {/* TABLE CONTAINER */}
            <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-lg">
              <table className="w-full text-left text-xs text-slate-200">
                <thead className="bg-[#1e293b] text-slate-300 font-bold uppercase tracking-wider text-[10.5pt] border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-2 w-10 text-center">STT</th>
                    <th className="py-2.5 px-3 min-w-[280px]">Vật tư OCR & Đối chiếu Danh mục</th>
                    <th className="py-2.5 px-2 w-20 text-center">ĐVT</th>
                    <th className="py-2.5 px-2 w-24 text-right">Số lượng</th>
                    <th className="py-2.5 px-2 w-32 text-right">Đơn giá Danh mục (đ)</th>
                    <th className="py-2.5 px-2 w-36 text-right">Thành tiền (đ)</th>
                    <th className="py-2.5 px-2 w-44 text-center">Trạng thái Khớp</th>
                    <th className="py-2.5 px-2 w-10 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-[#0f172a]">
                  {formData.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                        Chưa có dòng vật tư nào. Nhấn "Thêm dòng vật tư" để tạo mới.
                      </td>
                    </tr>
                  ) : (
                    formData.items.map((item, index) => (
                      <tr 
                        key={item.id} 
                        className={`transition-colors ${
                          !item.isMatchedWithCatalog 
                            ? 'bg-amber-950/20 hover:bg-amber-900/30 border-l-4 border-l-amber-500' 
                            : 'hover:bg-slate-800/50'
                        }`}
                      >
                        {/* STT */}
                        <td className="py-2.5 px-2 text-center font-mono text-slate-400 font-bold">
                          {index + 1}
                        </td>

                        {/* Tên vật tư + Dropdown/Search manual selection */}
                        <td className="py-2.5 px-3 space-y-1">
                          <div className="flex flex-col gap-1">
                            <textarea
                              value={item.name || ''}
                              onChange={e => handleItemChange(index, 'name', e.target.value)}
                              placeholder="Tên vật tư / Nội dung..."
                              rows={Math.max(1, (item.name || '').split('\n').length)}
                              className={`w-full bg-slate-900 border rounded px-2.5 py-1.5 text-white font-semibold focus:outline-none text-xs resize-none whitespace-pre-wrap break-words leading-relaxed ${
                                !item.isMatchedWithCatalog 
                                  ? 'border-amber-500/80 bg-amber-950/30 text-amber-200' 
                                  : 'border-slate-700 focus:border-blue-500 text-emerald-200'
                              }`}
                            />
                            {item.originalOcrName && item.originalOcrName !== item.name && (
                              <div className="text-[10px] text-amber-300/90 font-medium break-words leading-tight bg-amber-950/40 px-2 py-0.5 rounded border border-amber-600/30 whitespace-pre-wrap">
                                <strong>OCR gốc:</strong> {item.originalOcrName}
                              </div>
                            )}
                          </div>

                          {/* Matching options for unmatched items */}
                          {!item.isMatchedWithCatalog ? (
                            <div className="space-y-1.5 pt-0.5">
                              {/* 70-89% AI Candidate proposal banner */}
                              {item.proposedCatalogItem && (
                                <div className="flex items-center gap-2 p-1.5 bg-blue-950/70 border border-blue-500/50 rounded-lg text-[11px] text-blue-200">
                                  <Sparkles size={13} className="text-blue-400 shrink-0 animate-pulse" />
                                  <div className="flex-1 truncate">
                                    <span>AI đề xuất ({item.proposedConfidence}%): </span>
                                    <strong className="text-white font-bold">{item.proposedCatalogItem.tenVatTu}</strong>
                                    <span className="text-slate-400 font-mono ml-1">({item.proposedCatalogItem.donVi} - {item.proposedCatalogItem.giaHienHanh.toLocaleString('vi-VN')} đ)</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectCatalogItem(index, item.proposedCatalogItem!)}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded text-[10px] shadow transition-all shrink-0 cursor-pointer active:scale-95"
                                  >
                                    Xác nhận vật tư này
                                  </button>
                                </div>
                              )}

                              <div className="flex items-center gap-1.5">
                                {/* Quick Dropdown Picker */}
                                <select
                                  className="bg-slate-800 text-amber-300 border border-amber-600/50 rounded px-2 py-0.5 text-[10px] font-bold outline-none max-w-[200px] truncate"
                                  onChange={(e) => {
                                    const selectedCat = catalog.find(c => c.id === e.target.value);
                                    if (selectedCat) handleSelectCatalogItem(index, selectedCat);
                                  }}
                                  value=""
                                >
                                  <option value="" disabled>-- Chọn từ Danh mục --</option>
                                  {catalog.map(cat => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.tenVatTu} ({cat.donVi} - {cat.giaHienHanh.toLocaleString('vi-VN')} đ)
                                    </option>
                                  ))}
                                </select>

                                {/* Search Dialog Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSearchTerm(item.name || '');
                                    setSearchModalIndex(index);
                                  }}
                                  className="px-2 py-0.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Search size={10} />
                                  <span>Tìm kiếm</span>
                                </button>

                                {/* Add New Material Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewMaterialName(item.name || '');
                                    setNewMaterialUnit(item.unit || 'm3');
                                    setNewMaterialPrice(item.unitPrice || 0);
                                    setCreateModalIndex(index);
                                  }}
                                  className="px-2 py-0.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <PlusCircle size={10} />
                                  <span>Tạo vật tư mới</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                              <CheckCircle2 size={11} />
                              <span>Lấy dữ liệu chuẩn: <strong>{item.matchedCatalogName}</strong></span>
                            </div>
                          )}
                        </td>

                        {/* ĐVT */}
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            value={item.unit || ''}
                            onChange={e => handleItemChange(index, 'unit', e.target.value)}
                            placeholder="ĐVT"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-center focus:outline-none focus:border-blue-500 text-xs font-semibold"
                          />
                        </td>

                        {/* Số lượng */}
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            step="any"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={e => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-right focus:outline-none focus:border-blue-500 text-xs font-mono font-bold"
                          />
                        </td>

                        {/* Đơn giá */}
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            step="any"
                            value={item.unitPrice === 0 ? '' : item.unitPrice}
                            onChange={e => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className={`w-full bg-slate-900 border rounded px-2 py-1.5 text-white text-right focus:outline-none text-xs font-mono font-bold ${
                              item.unitPrice <= 0 ? 'border-amber-500/80 bg-amber-950/30 text-amber-300' : 'border-slate-700 focus:border-blue-500'
                            }`}
                          />
                        </td>

                        {/* Thành tiền */}
                        <td className="py-2.5 px-2 text-right font-mono font-extrabold text-blue-300 text-xs">
                          {formatBM02Currency(item.total)} đ
                        </td>

                        {/* Trạng thái Khớp */}
                        <td className="py-2.5 px-2 text-center">
                          {item.isMatchedWithCatalog ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <CheckCircle2 size={11} />
                              <span>Đã khớp Danh mục</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              <AlertTriangle size={11} />
                              <span>Chưa tìm thấy</span>
                            </span>
                          )}
                        </td>

                        {/* Action - Delete */}
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => handleDeleteItem(index)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                            title="Xóa dòng này"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* SUMMARY BAR */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-900/80 p-3.5 rounded-xl border border-slate-700/80">
              <div className="text-slate-400 flex items-center gap-2">
                <Info size={14} className="text-blue-400 shrink-0" />
                <span>Số tiền bằng chữ (tự động): <strong className="text-slate-200">{numberToVietnameseWords(totalAmount)}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400 font-medium">Tổng tiền hàng BM02:</span>
                <span className="font-extrabold font-mono text-emerald-400 text-base">{totalAmount.toLocaleString('vi-VN')} đ</span>
              </div>
            </div>

          </div>

        </div>

        {/* MODAL FOOTER */}
        <footer className="px-6 py-4 bg-[#1e293b] border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Database size={14} className="text-blue-400" />
            <span>
              Tự động điền dữ liệu chuẩn từ Master Data vào BM02 sau khi xác nhận.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
            >
              Hủy bỏ
            </button>

            <button
              type="button"
              onClick={() => onConfirm(formData)}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-blue-500/25 transition-all cursor-pointer active:scale-95"
            >
              <span>Xác nhận & Đổ vào BM02</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </footer>

      </div>

      {/* SEARCH MATERIAL MODAL DIALOG */}
      {searchModalIndex !== null && (
        <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[80vh]">
            <header className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold text-sm text-white">
                <Search size={16} className="text-blue-400" />
                <span>Tìm kiếm trong Danh mục quản lý vật tư</span>
              </div>
              <button onClick={() => setSearchModalIndex(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </header>

            <div className="p-4 space-y-3 flex-1 overflow-y-auto custom-scrollbar">
              <input
                type="text"
                autoFocus
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Nhập tên vật tư, quy cách hoặc mã..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />

              <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {catalog
                  .filter(cat => 
                    !searchTerm || 
                    cat.tenVatTu.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    (cat.quyCach && cat.quyCach.toLowerCase().includes(searchTerm.toLowerCase()))
                  )
                  .map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCatalogItem(searchModalIndex, cat)}
                      className="w-full text-left p-3 hover:bg-slate-800 transition-colors flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-xs text-white">{cat.tenVatTu}</div>
                        <div className="text-[10px] text-slate-400">{cat.quyCach ? `Quy cách: ${cat.quyCach} • ` : ''}ĐVT: {cat.donVi}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-xs text-emerald-400">{cat.giaHienHanh.toLocaleString('vi-VN')} đ</div>
                        <span className="text-[9px] text-blue-400 font-semibold">Chọn vật tư này →</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW MATERIAL MODAL DIALOG */}
      {createModalIndex !== null && (
        <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <header className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-400">
                <PlusCircle size={18} />
                <span>Tạo mới & Thêm vào Danh mục Quản lý</span>
              </div>
              <button onClick={() => setCreateModalIndex(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </header>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Tên vật tư chuẩn *</label>
                <input
                  type="text"
                  value={newMaterialName}
                  onChange={e => setNewMaterialName(e.target.value)}
                  placeholder="Ví dụ: Bê tông M300"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Đơn vị tính *</label>
                  <input
                    type="text"
                    value={newMaterialUnit}
                    onChange={e => setNewMaterialUnit(e.target.value)}
                    placeholder="m3, tấn, kg..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Đơn giá hiện hành (đ) *</label>
                  <input
                    type="number"
                    value={newMaterialPrice === 0 ? '' : newMaterialPrice}
                    onChange={e => setNewMaterialPrice(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-emerald-500 text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Quy cách kỹ thuật (nếu có)</label>
                <input
                  type="text"
                  value={newMaterialSpec}
                  onChange={e => setNewMaterialSpec(e.target.value)}
                  placeholder="Ví dụ: R28, Độ sụt 12±2..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalIndex(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isSubmittingNewMaterial || !newMaterialName.trim() || !newMaterialUnit.trim() || !newMaterialPrice || Number(newMaterialPrice) <= 0}
                  onClick={handleCreateNewMaterial}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-extrabold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingNewMaterial ? 'Đang lưu...' : 'Lưu vào Danh mục & Áp dụng'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

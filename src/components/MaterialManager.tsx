import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, Search, Settings, Save, X, Eye, EyeOff, Layers, Package, Hash, Check, Activity, Loader2, Info, FileSpreadsheet, Upload, AlertCircle, CheckCircle2, Download, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { getDB, logActivity } from '../lib/firebaseService';
import { materialCache } from '../services/MaterialCache';
import { ref, get, set, remove } from 'firebase/database';
import { MaterialType, UNIT_OPTIONS, UserAccount } from '../../types';
import { canCreate, canEdit, canDelete } from '../lib/authService';
import { read, utils, writeFile } from 'xlsx';
import { exportMaterialCatalogQuotationToExcel } from '../../services/excelExport';
import { MaterialTypeService } from '../services/MaterialTypeService';
import { parseSmartNumber } from '../lib/formatUtils';

interface MaterialManagerProps {
  danhSachVatTu: MaterialType[];
  setDanhSachVatTu: React.Dispatch<React.SetStateAction<MaterialType[]>>;
  luuVatTuMoi: (data: any) => Promise<any>;
  sapXepVatTu?: (newList: MaterialType[]) => Promise<void>;
  anVatTu: (id: string) => Promise<any>;
  hienVatTu: (id: string) => Promise<any>;
  currentUser: UserAccount | null;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;
  onClose?: () => void;
}

export interface MasterItem {
  id: string;
  name: string;        // Tên mặt hàng
  unit: string;        // Đvt
  specification: string; // Quy cách
  unitPrice: number;   // Đơn giá
  updatedAt?: number;
}

export default function MaterialManager({
  danhSachVatTu,
  setDanhSachVatTu,
  luuVatTuMoi,
  sapXepVatTu,
  anVatTu,
  hienVatTu,
  currentUser,
  setToast,
  onClose
}: MaterialManagerProps) {
  // Drag and drop states for material types reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // State for selected MaterialType
  const [selectedTypeId, setSelectedTypeId] = useState<string>(() => {
    const activeTypes = danhSachVatTu.filter(t => t.trangThai !== 'hidden' && !(t as any).hidden);
    return activeTypes.length > 0 ? activeTypes[0].id : (danhSachVatTu.length > 0 ? danhSachVatTu[0].id : '');
  });

  // Master items state for selected MaterialType
  const [items, setItems] = useState<MasterItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals for material item (right-side detail table)
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MasterItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    unit: 'm3',
    specification: '',
    unitPrice: ''
  });

  // Modals for material type (left-side master list)
  const [isTypeModalOpen, setIsTypeModalOpen] = useState<boolean>(false);
  const [editingType, setEditingType] = useState<MaterialType | null>(null);
  const [typeForm, setTypeForm] = useState({
    id: '',
    ten: '',
    tenVietTat: '',
    icon: '📦',
    mauNen: '#3b82f6',
    tieuDeBM02: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ',
    bm06_truongBoPhan: 'Trần Thành Tài',
    bm06_thuKho: 'Áp dụng đối với hoạt động thi công xây dựng',
    bm06_nguoiDeNghi: 'Trần Nam Anh'
  });

  const [savingType, setSavingType] = useState<boolean>(false);
  const [savingItem, setSavingItem] = useState<boolean>(false);

  // Import Excel modal states
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [importSaving, setImportSaving] = useState<boolean>(false);
  const [importRows, setImportRows] = useState<any[]>([]); // Parsed rows
  const [conflictOption, setConflictOption] = useState<'skip' | 'update'>('skip');
  const [dragOverImport, setDragOverImport] = useState<boolean>(false);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);

  // Export Quote modal states
  const [isExportQuoteModalOpen, setIsExportQuoteModalOpen] = useState<boolean>(false);
  const [exportQuoteScope, setExportQuoteScope] = useState<'all' | 'filtered'>('all');
  const [exportIncludePreTax, setExportIncludePreTax] = useState<boolean>(true);
  const [exportIncludePostTax, setExportIncludePostTax] = useState<boolean>(true);
  const [exportIncludeNotes, setExportIncludeNotes] = useState<boolean>(true);
  const [exportVatRate, setExportVatRate] = useState<number>(8);
  const [exportSupplierName, setExportSupplierName] = useState<string>('');
  const [exportExporterName, setExportExporterName] = useState<string>('');
  const [isExportingQuote, setIsExportingQuote] = useState<boolean>(false);

  // States for custom delete/archive/hide confirmation popup
  const [deleteConfirmationData, setDeleteConfirmationData] = useState<{
    isOpen: boolean;
    itemId: string;
    itemName: string;
    unit: string;
    specification: string;
    unitPrice: number;
    typeName: string;
    itemObject: any;
    checking: boolean;
    estimateCount: number;
    bm06Count: number;
    bm02Count: number;
    bm032Count: number;
    totalUsage: number;
    showForceDeleteInput: boolean;
    forceDeleteInputText: string;
    isDoubleConfirmed: boolean;
  } | null>(null);

  // Check material usage across modules in real-time
  const checkMaterialUsage = async (itemName: string) => {
    const db = getDB();
    const normName = itemName.trim().toLowerCase();

    let estimateCount = 0;
    let bm06Count = 0;
    let bm02Count = 0;
    let bm032Count = 0;

    // 1. Check Quản lý dự toán (estimateItems in RTDB)
    if (db) {
      try {
        const estSnap = await get(ref(db, 'estimateItems'));
        if (estSnap.exists()) {
          const data = estSnap.val();
          Object.keys(data).forEach(k => {
            const it = data[k];
            if (it && it.name && it.name.trim().toLowerCase() === normName) {
              estimateCount++;
            }
          });
        }
      } catch (e) {
        console.warn("Lỗi check estimateItems:", e);
      }
    }

    // 2. Check BM06 (bm06Orders in RTDB)
    if (db) {
      try {
        const bm06Snap = await get(ref(db, 'bm06Orders'));
        if (bm06Snap.exists()) {
          const data = bm06Snap.val();
          Object.keys(data).forEach(k => {
            const order = data[k];
            if (order && order.selectedItems && Array.isArray(order.selectedItems)) {
              const hasItem = order.selectedItems.some((it: any) => it.name && it.name.trim().toLowerCase() === normName);
              if (hasItem) {
                bm06Count++;
              }
            }
          });
        }
      } catch (e) {
        console.warn("Lỗi check bm06Orders:", e);
      }
    }

    // 3. Check BM02 and BM03.2
    if (db) {
      try {
        const { rtDbProvider } = await import('../data/providers/RealtimeDatabaseProvider');
        const [bm02Data, bm032Data] = await Promise.all([
          rtDbProvider.get<Record<string, any>>('bm02Orders'),
          rtDbProvider.get<Record<string, any>>('bm032Orders')
        ]);
        
        // Check BM02 (bm02Orders)
        if (bm02Data) {
          Object.values(bm02Data).forEach(order => {
            if (order && order.items && Array.isArray(order.items)) {
              const hasItem = order.items.some((it: any) => it.name && it.name.trim().toLowerCase() === normName);
              if (hasItem) bm02Count++;
            } else if (order && order.selectedItems && Array.isArray(order.selectedItems)) {
              const hasItem = order.selectedItems.some((it: any) => it.name && it.name.trim().toLowerCase() === normName);
              if (hasItem) bm02Count++;
            }
          });
        }

        // Check BM03.2 (bm032Orders)
        if (bm032Data) {
          Object.values(bm032Data).forEach(order => {
            if (order && order.items && Array.isArray(order.items)) {
              const hasItem = order.items.some((it: any) => it.name && it.name.trim().toLowerCase() === normName);
              if (hasItem) bm032Count++;
            } else if (order && order.selectedItems && Array.isArray(order.selectedItems)) {
              const hasItem = order.selectedItems.some((it: any) => it.name && it.name.trim().toLowerCase() === normName);
              if (hasItem) bm032Count++;
            }
          });
        }
      } catch (e) {
        console.warn("Lỗi check bm02/032 RTDB:", e);
      }
    }

    return {
      estimateCount,
      bm06Count,
      bm02Count,
      bm032Count,
      totalUsage: estimateCount + bm06Count + bm02Count + bm032Count
    };
  };

  // Open the customized double-verification delete modal
  const initiateDeleteItem = async (item: MasterItem) => {
    if (!canDelete(currentUser)) {
      setToast({ message: 'Bạn không có quyền xóa vật tư! Thao tác này chỉ dành cho Admin.', type: 'error' });
      return;
    }

    setDeleteConfirmationData({
      isOpen: true,
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      specification: item.specification,
      unitPrice: item.unitPrice,
      typeName: selectedType?.ten || 'Chưa phân loại',
      itemObject: item,
      checking: true,
      estimateCount: 0,
      bm06Count: 0,
      bm02Count: 0,
      bm032Count: 0,
      totalUsage: 0,
      showForceDeleteInput: false,
      forceDeleteInputText: '',
      isDoubleConfirmed: false
    });

    try {
      const counts = await checkMaterialUsage(item.name);
      setDeleteConfirmationData(prev => {
        if (!prev || prev.itemId !== item.id) return prev;
        return {
          ...prev,
          checking: false,
          estimateCount: counts.estimateCount,
          bm06Count: counts.bm06Count,
          bm02Count: counts.bm02Count,
          bm032Count: counts.bm032Count,
          totalUsage: counts.totalUsage
        };
      });
    } catch (err: any) {
      console.error("Lỗi khi kiểm tra dữ liệu phát sinh của vật tư:", err);
      setDeleteConfirmationData(prev => {
        if (!prev) return null;
        return { ...prev, checking: false };
      });
    }
  };

  // Download Excel template function
  const handleDownloadTemplate = () => {
    if (!selectedType) {
      setToast({ message: 'Vui lòng chọn danh mục vật tư!', type: 'error' });
      return;
    }
    
    try {
      const wb = utils.book_new();
      
      // Add sample rows based on selected type to make template helpful
      let samples: any[] = [];
      const typeId = selectedType.id;
      if (typeId === 'Gach' || typeId.toLowerCase().includes('gach')) {
        samples = [
          [1, "Gạch ống Tuynel 8x8x18 Bình Dương", "viên", "Mác 75, nhà máy Becamex", 1200, "Becamex Bình Dương", "Gạch xây tường ngăn"],
          [2, "Gạch đinh Tuynel 4x8x18", "viên", "Mác 100, nhà máy Bình Dương", 1400, "Becamex Bình Dương", "Xây chân tường, hộp kỹ thuật"]
        ];
      } else if (typeId === 'XiMang' || typeId.toLowerCase().includes('xi')) {
        samples = [
          [1, "Xi măng Portland hỗn hợp PCB40 Trung Kiên", "bao", "Bao 50kg, tiêu chuẩn TCVN 6260", 88000, "Vật liệu Trung Kiên", "Dùng cho xây tô dầm sàn"],
          [2, "Xi măng trắng Fico PCw50.I", "bao", "Bao 40kg", 145000, "Fico Tây Ninh", "Dùng cho chà ron, hoàn thiện"]
        ];
      } else if (typeId === 'SatThep' || typeId.toLowerCase().includes('sat') || typeId.toLowerCase().includes('thep')) {
        samples = [
          [1, "Thép cuộn trơn phi 6 Pomina", "kg", "Mác thép CT3-Đ, tiêu chuẩn Việt Nam", 16500, "Thép Nhân Luật", "Thép đai cột dầm sàn"],
          [2, "Thép cây vằn phi 12 Việt Nhật", "cây", "Chiều dài 11.7m, mác thép SD295", 195000, "Thép Nhân Luật", "Thép cốt dọc cột dầm sàn"]
        ];
      } else if (typeId === 'Cat' || typeId.toLowerCase().includes('cat') || typeId.toLowerCase().includes('da')) {
        samples = [
          [1, "Cát bê tông Phong Tiến Phát", "m3", "Mô đun độ lớn từ 2.0 - 2.5, sạch không lẫn bùn", 320000, "Phong Tiến Phát", "Cát đổ bê tông tươi"],
          [2, "Cát xây tô Phong Tiến Phát", "m3", "Cát mịn, mô đun độ lớn từ 1.5 - 2.0", 240000, "Phong Tiến Phát", "Cát tô trát tường dầm"]
        ];
      } else {
        samples = [
          [1, `Vật tư ${selectedType.ten} mẫu 1`, "m3", "Quy cách kỹ thuật mẫu", 120000, "Nhà cung cấp chính", "Ghi chú chi tiết"],
          [2, `Vật tư ${selectedType.ten} mẫu 2`, "bao", "Quy cách kỹ thuật khác", 85000, "Nhà cung cấp phụ", ""]
        ];
      }
      
      const wsData = [
        ["STT", "Tên vật tư", "ĐVT", "Quy cách", "Đơn giá", "Nhà cung cấp", "Ghi chú"],
        ...samples
      ];
      
      const ws = utils.aoa_to_sheet(wsData);
      
      // Set nice column widths for the Excel template
      ws['!cols'] = [
        { wch: 6 },  // STT
        { wch: 40 }, // Tên vật tư
        { wch: 10 }, // ĐVT
        { wch: 30 }, // Quy cách
        { wch: 15 }, // Đơn giá
        { wch: 25 }, // Nhà cung cấp
        { wch: 30 }  // Ghi chú
      ];
      
      utils.book_append_sheet(wb, ws, "Danh_muc_mau");
      writeFile(wb, `Mau_Import_${selectedType.id}.xlsx`);
      setToast({ message: `Đã tải xuống file mẫu cho danh mục ${selectedType.ten}!`, type: 'success' });
    } catch (err: any) {
      console.error("Lỗi khi tạo file mẫu:", err);
      setToast({ message: "Không thể tạo file mẫu: " + err.message, type: 'error' });
    }
  };

  // Process selected file
  const handleProcessImportFile = async (selectedFile: File) => {
    if (!selectedType) return;
    
    // Check file extension
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setToast({ message: 'Định dạng file không hỗ trợ. Chỉ hỗ trợ .xlsx, .xls!', type: 'error' });
      return;
    }

    setImportFile(selectedFile);
    setImportLoading(true);
    setImportRows([]);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error('Không đọc được dữ liệu file');
        
        const workbook = read(data, { type: 'array' });
        if (workbook.SheetNames.length === 0) {
          throw new Error('File Excel trống');
        }
        
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error('Không tìm thấy sheet dữ liệu');
        
        const refVal = sheet['!ref'];
        if (!refVal) throw new Error('Sheet không có dữ liệu');
        
        const range = utils.decode_range(refVal);
        const parsedRows: any[] = [];
        
        // Find header columns
        let headerRowIdx = -1;
        let colName = -1;
        let colUnit = -1;
        let colSpec = -1;
        let colPrice = -1;
        let colSupplier = -1;
        let colNote = -1;
        
        // Scan first 15 rows for header keywords
        const maxScanRows = Math.min(15, range.e.r);
        for (let r = range.s.r; r <= maxScanRows; r++) {
          let hasName = false;
          let hasUnit = false;
          
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = sheet[utils.encode_cell({ r, c })];
            if (!cell || cell.v === undefined) continue;
            const val = String(cell.v).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            
            if (val.includes('ten vat tu') || val === 'ten' || val.includes('ten mat hang') || val.includes('vật tư')) {
              colName = c;
              hasName = true;
            } else if (val === 'dvt' || val === 'don vi' || val.includes('don vi tinh') || val.includes('đơn vị')) {
              colUnit = c;
              hasUnit = true;
            } else if (val.includes('quy cach') || val === 'specs' || val.includes('chi tiet') || val.includes('quy cách')) {
              colSpec = c;
            } else if (val.includes('don gia') || val === 'gia' || val === 'price' || val === 'unitprice' || val.includes('đơn giá')) {
              colPrice = c;
            } else if (val.includes('nha cung cap') || val === 'ncc' || val === 'supplier' || val.includes('nhà cung cấp')) {
              colSupplier = c;
            } else if (val.includes('ghi chu') || val === 'note' || val.includes('ghi chú')) {
              colNote = c;
            }
          }
          
          if (hasName && hasUnit) {
            headerRowIdx = r;
            break;
          }
        }
        
        // If not found by keywords, fallback to columns A, B, C, D, E, F, G (or indices 0, 1, 2, 3, 4, 5, 6)
        if (headerRowIdx === -1) {
          headerRowIdx = 0; // Assume first row is header
          colName = 1;
          colUnit = 2;
          colSpec = 3;
          colPrice = 4;
          colSupplier = 5;
          colNote = 6;
        }
        
        // Read data rows starting from headerRowIdx + 1
        const startRow = headerRowIdx + 1;
        for (let r = startRow; r <= range.e.r; r++) {
          // Get values
          const getVal = (colIdx: number) => {
            if (colIdx === -1) return '';
            const cell = sheet[utils.encode_cell({ r, c: colIdx })];
            return cell && cell.v !== undefined ? String(cell.v).trim() : '';
          };
          
          const nameVal = getVal(colName);
          const unitVal = getVal(colUnit);
          const specVal = getVal(colSpec);
          const priceRaw = getVal(colPrice);
          const supplierVal = getVal(colSupplier);
          const noteVal = getVal(colNote);
          
          // Skip completely empty rows
          if (!nameVal && !unitVal && !specVal && !priceRaw) {
            continue;
          }
          
          // Validation:
          const errors: string[] = [];
          if (!nameVal) {
            errors.push('Thiếu Tên vật tư');
          }
          if (!unitVal) {
            errors.push('Thiếu ĐVT');
          }
          
          let parsedPrice = 0;
          let isPriceError = false;
          
          if (priceRaw !== '') {
            const pRes = parseSmartNumber(priceRaw, {
              rawStr: priceRaw,
              unit: unitVal,
              fieldRole: 'unitPrice'
            });
            if (isNaN(pRes.value)) {
              errors.push('Đơn giá không phải là số hợp lệ');
              isPriceError = true;
              parsedPrice = 0;
            } else {
              parsedPrice = pRes.value;
            }
          } else {
            parsedPrice = 0; // Empty unit price defaults to 0
          }
          
          // Check duplicate against existing items in current category
          const normText = (txt: string) => (txt || '').toLowerCase().trim().replace(/\s+/g, ' ');
          const isDuplicate = items.some(existing => 
            normText(existing.name) === normText(nameVal) &&
            normText(existing.unit) === normText(unitVal) &&
            normText(existing.specification) === normText(specVal)
          );
          
          const matchedItem = isDuplicate ? items.find(existing => 
            normText(existing.name) === normText(nameVal) &&
            normText(existing.unit) === normText(unitVal) &&
            normText(existing.specification) === normText(specVal)
          ) : null;
          
          parsedRows.push({
            tempId: `row_${r}_${Math.random().toString(36).substr(2, 5)}`,
            name: nameVal,
            unit: unitVal,
            specification: specVal,
            unitPrice: parsedPrice,
            priceRawInput: priceRaw,
            supplier: supplierVal,
            note: noteVal,
            errors,
            isPriceError,
            isDuplicate,
            matchedItemId: matchedItem?.id || null,
            isValid: errors.length === 0
          });
        }
        
        if (parsedRows.length === 0) {
          throw new Error('Không tìm thấy dòng dữ liệu hợp lệ nào trong file Excel.');
        }
        
        setImportRows(parsedRows);
        setToast({ message: `Đã đọc thành công ${parsedRows.length} dòng từ file Excel!`, type: 'success' });
      } catch (err: any) {
        console.error('Error parsing Excel:', err);
        setToast({ message: `Lỗi đọc file: ${err.message}`, type: 'error' });
        setImportFile(null);
        setImportRows([]);
      } finally {
        setImportLoading(false);
      }
    };
    
    reader.onerror = () => {
      setToast({ message: 'Lỗi đọc file từ thiết bị', type: 'error' });
      setImportLoading(false);
    };
    
    reader.readAsArrayBuffer(selectedFile);
  };

  // Update row price directly in preview
  const handleUpdateRowPrice = (tempId: string, value: string) => {
    setImportRows(prev => prev.map(row => {
      if (row.tempId === tempId) {
        const num = Number(value.replace(/[^0-9.-]/g, ''));
        const errors = row.errors.filter((e: string) => e !== 'Đơn giá không phải là số hợp lệ');
        let isPriceError = false;
        
        if (value.trim() !== '' && isNaN(num)) {
          errors.push('Đơn giá không phải là số hợp lệ');
          isPriceError = true;
        }
        
        return {
          ...row,
          priceRawInput: value,
          unitPrice: isNaN(num) ? 0 : num,
          isPriceError,
          errors,
          isValid: errors.length === 0
        };
      }
      return row;
    }));
  };

  // Get active stats reactively
  const importStats = useMemo(() => {
    const total = importRows.length;
    const errors = importRows.filter(r => !r.isValid).length;
    const valid = importRows.filter(r => r.isValid).length;
    const duplicates = importRows.filter(r => r.isValid && r.isDuplicate).length;
    const toAdd = importRows.filter(r => r.isValid && !r.isDuplicate).length;
    const toUpdate = conflictOption === 'update' ? duplicates : 0;
    const willSave = toAdd + toUpdate;
    
    return {
      total,
      errors,
      valid,
      duplicates,
      toAdd,
      toUpdate,
      willSave
    };
  }, [importRows, conflictOption]);

  // Handle saving the imported list
  const handleSaveImport = async () => {
    if (!selectedType) return;
    if (currentUser?.role === 'viewer') {
      setToast({ message: 'Tài khoản Viewer không có quyền thực hiện chức năng này!', type: 'error' });
      return;
    }
    
    if (conflictOption === 'update' && currentUser?.role !== 'admin') {
      setToast({ message: 'Chỉ Admin mới có quyền cập nhật vật tư trùng!', type: 'error' });
      return;
    }

    const validRows = importRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setToast({ message: 'Không có dòng dữ liệu hợp lệ nào để lưu!', type: 'error' });
      return;
    }

    const db = getDB();
    if (!db) {
      setToast({ message: 'Database không kết nối', type: 'error' });
      return;
    }

    setImportSaving(true);
    try {
      const updates: Record<string, any> = {};
      const firestoreItems: any[] = [];
      
      let countAdded = 0;
      let countUpdated = 0;
      const now = Date.now();
      
      validRows.forEach(row => {
        if (row.isDuplicate) {
          if (conflictOption === 'skip') {
            return;
          }
          
          const itemId = row.matchedItemId;
          countUpdated++;
          
          const itemData = {
            id: itemId,
            name: row.name,
            unit: row.unit,
            specification: row.specification || "",
            unitPrice: Number(row.unitPrice) || 0,
            updatedAt: now
          };
          
          const catalogData = {
            materialId: itemId,
            materialTypeId: selectedTypeId,
            materialTypeName: selectedType.ten,
            name: row.name,
            unit: row.unit,
            specification: row.specification || "",
            unitPrice: Number(row.unitPrice) || 0,
            supplier: row.supplier || "",
            note: row.note || "",
            createdAt: now,
            updatedAt: now
          };
          
          updates[`cauHinh/materialItems/${selectedTypeId}/${itemId}`] = itemData;
          updates[`materialCatalog/${itemId}`] = catalogData;
          
          firestoreItems.push({
            itemId,
            isNew: false,
            data: catalogData
          });
        } else {
          const itemId = `mat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          countAdded++;
          
          const itemData = {
            id: itemId,
            name: row.name,
            unit: row.unit,
            specification: row.specification || "",
            unitPrice: Number(row.unitPrice) || 0,
            updatedAt: now
          };
          
          const catalogData = {
            materialId: itemId,
            materialTypeId: selectedTypeId,
            materialTypeName: selectedType.ten,
            name: row.name,
            unit: row.unit,
            specification: row.specification || "",
            unitPrice: Number(row.unitPrice) || 0,
            supplier: row.supplier || "",
            note: row.note || "",
            createdAt: now,
            updatedAt: now
          };
          
          updates[`cauHinh/materialItems/${selectedTypeId}/${itemId}`] = itemData;
          updates[`materialCatalog/${itemId}`] = catalogData;
          
          firestoreItems.push({
            itemId,
            isNew: true,
            data: catalogData
          });
        }
      });

      if (Object.keys(updates).length > 0) {
        const { update: dbUpdate, ref: dbRef } = await import('firebase/database');
        await dbUpdate(dbRef(db), updates);
      }

      await logActivity(
        currentUser?.username || 'khách',
        currentUser?.role || 'editor',
        'IMPORT',
        'Cấu hình',
        `Import thành công file Excel "${importFile?.name || 'N/A'}" vào danh mục "${selectedType.ten}": Đã đọc ${importRows.length} dòng. Thêm mới ${countAdded}, Cập nhật trùng ${countUpdated}, Bỏ qua ${importRows.length - countAdded - countUpdated} dòng (trùng/lỗi).`
      );

      setToast({
        message: `Import thành công! Đã thêm mới ${countAdded} mặt hàng, cập nhật ${countUpdated} mặt hàng trùng.`,
        type: 'success'
      });
      
      setIsImportModalOpen(false);
      setImportFile(null);
      setImportRows([]);
      loadItems(selectedTypeId);
    } catch (err: any) {
      console.error('Error saving imported materials:', err);
      setToast({ message: `Lỗi lưu dữ liệu import: ${err.message}`, type: 'error' });
    } finally {
      setImportSaving(false);
    }
  };

  // Active MaterialType object
  const selectedType = useMemo(() => {
    return danhSachVatTu.find(t => t.id === selectedTypeId) || null;
  }, [danhSachVatTu, selectedTypeId]);

  // Handlers for Exporting Quote Excel
  const handleOpenExportQuoteModal = () => {
    if (!selectedType) {
      setToast({ message: 'Vui lòng chọn danh mục vật tư!', type: 'error' });
      return;
    }
    setExportSupplierName(selectedType.bm06_thuKho || selectedType.ten || '');
    setExportExporterName(currentUser?.hoTen || currentUser?.username || 'Hệ thống Quản lý');
    setExportQuoteScope(searchQuery.trim() ? 'filtered' : 'all');
    setIsExportQuoteModalOpen(true);
  };

  const handleExecuteExportQuote = async () => {
    if (!selectedType) return;

    const itemsToExport = exportQuoteScope === 'filtered' ? filteredItems : items;

    if (itemsToExport.length === 0) {
      setToast({ message: 'Không có mặt hàng nào để xuất Excel!', type: 'error' });
      return;
    }

    setIsExportingQuote(true);
    try {
      await exportMaterialCatalogQuotationToExcel({
        categoryName: selectedType.ten,
        categoryId: selectedType.id,
        supplierName: exportSupplierName.trim(),
        exporterName: exportExporterName.trim(),
        vatRate: exportVatRate,
        items: itemsToExport.map(it => ({
          id: it.id,
          name: it.name,
          unit: it.unit,
          specification: it.specification,
          unitPrice: it.unitPrice,
          supplier: exportSupplierName.trim(),
          note: (it as any).note || ''
        })),
        includePreTaxPrice: exportIncludePreTax,
        includePostTaxPrice: exportIncludePostTax,
        includeNotes: exportIncludeNotes
      });

      await logActivity(
        currentUser?.username || 'khách',
        currentUser?.role || 'editor',
        'EXPORT',
        'Cấu hình',
        `Xuất Excel Báo giá danh mục "${selectedType.ten}" (${itemsToExport.length} mặt hàng).`
      );

      setToast({
        message: `Đã xuất thành công file Báo giá cho danh mục ${selectedType.ten}!`,
        type: 'success'
      });
      setIsExportQuoteModalOpen(false);
    } catch (err: any) {
      console.error('Error exporting quote Excel:', err);
      setToast({ message: `Lỗi khi xuất file Excel: ${err.message}`, type: 'error' });
    } finally {
      setIsExportingQuote(false);
    }
  };

  // Load items from RTDB or MaterialCache
  const loadItems = async (typeId: string) => {
    if (!typeId) return;
    setIsLoadingItems(true);

    try {
      await materialCache.ensureLoaded();
      const cachedList = materialCache.getMasterItems(typeId);
      if (cachedList && cachedList.length > 0) {
        setItems(cachedList as MasterItem[]);
      } else {
        const db = getDB();
        if (db) {
          const itemsRef = ref(db, `cauHinh/materialItems/${typeId}`);
          const snapshot = await get(itemsRef);
          const list: MasterItem[] = [];
          if (snapshot.exists()) {
            const data = snapshot.val();
            if (typeof data === 'object') {
              Object.keys(data).forEach(key => {
                const val = data[key];
                if (val) {
                  list.push({
                    id: key,
                    name: val.name || '',
                    unit: val.unit || 'm3',
                    specification: val.specification || '',
                    unitPrice: Number(val.unitPrice || 0),
                    updatedAt: val.updatedAt,
                    archived: val.archived === true || val.active === false,
                    active: val.active !== false && !val.archived
                  } as any);
                }
              });
            }
          }
          list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
          setItems(list);
        } else {
          setItems([]);
        }
      }
    } catch (err: any) {
      console.error('Error loading master items:', err);
      setToast({ message: 'Không thể tải danh sách mặt hàng', type: 'error' });
    } finally {
      setIsLoadingItems(false);
    }
  };

  useEffect(() => {
    if (selectedTypeId) {
      loadItems(selectedTypeId);
    }
  }, [selectedTypeId]);

  // Handle selected MaterialType changes when database updates
  useEffect(() => {
    if (!selectedTypeId && danhSachVatTu.length > 0) {
      const activeTypes = danhSachVatTu.filter(t => t.trangThai !== 'hidden' && !(t as any).hidden);
      setSelectedTypeId(activeTypes.length > 0 ? activeTypes[0].id : danhSachVatTu[0].id);
    }
  }, [danhSachVatTu]);

  // ----------------------------------------------------
  // MATERIAL TYPE ACTIONS (LEFT SIDEBAR)
  // ----------------------------------------------------
  const handleOpenTypeModal = (type: MaterialType | null = null) => {
    if (!canCreate(currentUser) && !canEdit(currentUser)) {
      setToast({ message: 'Bạn không có quyền quản trị!', type: 'error' });
      return;
    }
    
    if (type) {
      setEditingType(type);
      setTypeForm({
        id: type.id,
        ten: type.ten,
        tenVietTat: type.tenVietTat || type.id,
        icon: type.icon || '📦',
        mauNen: type.mauNen || '#3b82f6',
        tieuDeBM02: type.tieuDeBM02 || '',
        bm06_truongBoPhan: type.bm06_truongBoPhan || '',
        bm06_thuKho: type.bm06_thuKho || '',
        bm06_nguoiDeNghi: type.bm06_nguoiDeNghi || ''
      });
    } else {
      setEditingType(null);
      setTypeForm({
        id: '',
        ten: '',
        tenVietTat: '',
        icon: '📦',
        mauNen: '#3b82f6',
        tieuDeBM02: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ',
        bm06_truongBoPhan: 'Trần Thành Tài',
        bm06_thuKho: 'Áp dụng đối với hoạt động thi công xây dựng',
        bm06_nguoiDeNghi: 'Trần Nam Anh'
      });
    }
    setIsTypeModalOpen(true);
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeForm.ten.trim()) {
      setToast({ message: 'Vui lòng nhập tên loại vật tư!', type: 'error' });
      return;
    }

    setSavingType(true);
    try {
      const isEdit = !!editingType;
      const targetId = isEdit ? editingType!.id : (typeForm.id.trim() || Math.random().toString(36).substr(2, 9));
      
      const payload = {
        ...typeForm,
        id: targetId,
        tenVietTat: typeForm.tenVietTat.trim() || targetId
      };

      await luuVatTuMoi(payload);
      setIsTypeModalOpen(false);
      setEditingType(null);
      setSelectedTypeId(targetId);
    } catch (err: any) {
      console.error('Error saving material type:', err);
    } finally {
      setSavingType(false);
    }
  };

  const handleToggleTypeStatus = async (type: MaterialType) => {
    if (!canEdit(currentUser)) {
      setToast({ message: 'Bạn không có quyền thực hiện thao tác này!', type: 'error' });
      return;
    }
    const isHidden = type.trangThai === 'hidden' || (type as any).hidden;
    try {
      if (isHidden) {
        await hienVatTu(type.id);
      } else {
        if (type.id === 'BeTong') {
          setToast({ message: 'Không thể ẩn loại vật tư Bê Tông mặc định!', type: 'error' });
          return;
        }
        await anVatTu(type.id);
      }
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  // ----------------------------------------------------
  // DRAG & DROP REORDER MATERIAL TYPES
  // ----------------------------------------------------
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!canEdit(currentUser)) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceIndex = draggedIndex;
    setDraggedIndex(null);
    setDragOverIndex(null);

    if (sourceIndex === null || sourceIndex === targetIndex) return;

    const reordered = [...danhSachVatTu];
    const [movedItem] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);

    // Gán lại trường sortOrder chuẩn hóa cho từng loại vật tư
    const listWithSortOrder = reordered.map((item, idx) => ({
      ...item,
      sortOrder: idx
    }));

    // Cập nhật ngay lập tức state danhSachVatTu để dropdown CHỌN VẬT TƯ và giao diện hiển thị đúng thứ tự mới không cần tải lại trang
    setDanhSachVatTu(listWithSortOrder);
    if ((window as any)._danhSachVatTu) {
      (window as any)._danhSachVatTu = listWithSortOrder;
    }

    try {
      if (sapXepVatTu) {
        await sapXepVatTu(listWithSortOrder);
      } else {
        await MaterialTypeService.saveMaterialTypes(listWithSortOrder);
        setToast({ message: 'Đã lưu thứ tự phân loại vật tư!', type: 'success' });
      }
    } catch (err: any) {
      console.error('Lỗi khi lưu thứ tự phân loại vật tư:', err);
      setToast({ message: 'Lỗi khi lưu thứ tự vật tư', type: 'error' });
    }
  };

  const handleMoveType = async (index: number, direction: 'up' | 'down') => {
    if (!canEdit(currentUser)) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= danhSachVatTu.length) return;

    const reordered = [...danhSachVatTu];
    const [movedItem] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, movedItem);

    const listWithSortOrder = reordered.map((item, idx) => ({
      ...item,
      sortOrder: idx
    }));

    setDanhSachVatTu(listWithSortOrder);
    if ((window as any)._danhSachVatTu) {
      (window as any)._danhSachVatTu = listWithSortOrder;
    }

    try {
      if (sapXepVatTu) {
        await sapXepVatTu(listWithSortOrder);
      } else {
        await MaterialTypeService.saveMaterialTypes(listWithSortOrder);
        setToast({ message: 'Đã lưu thứ tự phân loại vật tư!', type: 'success' });
      }
    } catch (err: any) {
      console.error('Lỗi khi lưu thứ tự phân loại vật tư:', err);
      setToast({ message: 'Lỗi khi lưu thứ tự vật tư', type: 'error' });
    }
  };

  // ----------------------------------------------------
  // MATERIAL ITEM ACTIONS (RIGHT DETAIL TABLE)
  // ----------------------------------------------------
  const handleOpenItemModal = (item: MasterItem | null = null) => {
    if (!canCreate(currentUser) && !canEdit(currentUser)) {
      setToast({ message: 'Bạn không có quyền quản lý vật tư!', type: 'error' });
      return;
    }

    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name,
        unit: item.unit,
        specification: item.specification,
        unitPrice: String(item.unitPrice)
      });
    } else {
      setEditingItem(null);
      setItemForm({
        name: '',
        unit: 'm3',
        specification: '',
        unitPrice: ''
      });
    }
    setIsItemModalOpen(true);
  };

  const handleSyncToEstimates = async () => {
    if (!editingItem) return;
    if (!itemForm.name.trim()) return;

    if (!confirm('Bạn có chắc chắn muốn cập nhật toàn bộ các dự toán đang dùng vật tư này sang thông tin mới (Tên, ĐVT, Quy cách) không? Các phiếu BM06 đã tạo sẽ không bị ảnh hưởng.')) {
      return;
    }

    setSavingItem(true);
    const db = getDB();
    if (!db) return;

    try {
      const { get, ref: dbRef, update } = await import('firebase/database');
      const estimatesSnapshot = await get(dbRef(db, 'estimateItems'));
      
      if (estimatesSnapshot.exists()) {
        const estimates = estimatesSnapshot.val();
        const updates: Record<string, any> = {};
        let count = 0;
        
        // Find all estimateItems with the OLD name exactly
        Object.keys(estimates).forEach(estId => {
          const est = estimates[estId];
          const oldNameNorm = (editingItem.name || '').trim().toLowerCase();
          const currentNameNorm = (est.name || '').trim().toLowerCase();
          
          if (oldNameNorm === currentNameNorm) {
            updates[`estimateItems/${estId}/name`] = itemForm.name.trim();
            updates[`estimateItems/${estId}/unit`] = itemForm.unit;
            updates[`estimateItems/${estId}/specs`] = itemForm.specification.trim();
            
            // Note: we don't sync price or estimates, as those might be project specific
            count++;
          }
        });

        if (count > 0) {
          await update(dbRef(db), updates);
          setToast({ message: `Đã đồng bộ thành công ${count} dự toán!`, type: 'success' });
        } else {
          setToast({ message: `Không tìm thấy dự toán nào đang sử dụng tên vật tư cũ để đồng bộ.`, type: 'success' });
        }
      }
    } catch (err: any) {
      console.error('Error syncing to estimates:', err);
      setToast({ message: 'Lỗi khi đồng bộ: ' + err.message, type: 'error' });
    } finally {
      setSavingItem(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTypeId) {
      setToast({ message: 'Vui lòng chọn loại vật tư ở cột bên trái trước!', type: 'error' });
      return;
    }
    if (!itemForm.name.trim()) {
      setToast({ message: 'Vui lòng nhập tên mặt hàng!', type: 'error' });
      return;
    }

    setSavingItem(true);
    const db = getDB();
    if (!db) {
      setToast({ message: 'Database không kết nối được', type: 'error' });
      setSavingItem(false);
      return;
    }

    try {
      const isEdit = !!editingItem;
      const itemId = isEdit ? editingItem!.id : Math.random().toString(36).substr(2, 9);
      
      const itemData = {
        id: itemId,
        name: itemForm.name.trim(),
        unit: itemForm.unit,
        specification: itemForm.specification.trim(),
        unitPrice: Number(itemForm.unitPrice) || 0,
        updatedAt: Date.now()
      };

      const itemRef = ref(db, `cauHinh/materialItems/${selectedTypeId}/${itemId}`);
      await set(itemRef, itemData);

      setToast({ 
        message: isEdit ? 'Đã cập nhật thông tin mặt hàng!' : 'Đã thêm mặt hàng thành công!', 
        type: 'success' 
      });
      
      setIsItemModalOpen(false);
      setEditingItem(null);
      loadItems(selectedTypeId);
    } catch (err: any) {
      console.error('Error saving material item:', err);
      setToast({ message: `Lỗi: ${err.message}`, type: 'error' });
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const item = items.find(it => it.id === itemId);
    if (item) {
      initiateDeleteItem(item);
    } else {
      setToast({ message: 'Không tìm thấy vật tư yêu cầu!', type: 'error' });
    }
  };

  // Filter items in right table
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return items;
    return items.filter(it => 
      it.name.toLowerCase().includes(q) || 
      it.specification.toLowerCase().includes(q) ||
      it.unit.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] text-slate-100 overflow-hidden animate-fade-in relative">
      {/* Background Gradient Orbs */}
      <div className="absolute w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none -top-40 -left-40"></div>
      <div className="absolute w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none -bottom-40 -right-40"></div>

      {/* Header Bar */}
      <div className="p-4 md:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
            <Settings className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
              DANH MỤC QUẢN LÝ VẬT TƯ CHÍNH
            </h1>
            <p className="text-[11px] text-slate-400 font-bold">
              Thiết lập danh mục vật tư chuẩn, đồng bộ hóa sang hệ thống dự toán, đề nghị và báo cáo
            </p>
          </div>
        </div>
        
        {onClose && (
          <button 
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <X size={15} /> Đóng lại
          </button>
        )}
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 z-10">
        
        {/* LEFT COLUMN: MATERIAL TYPE LIST */}
        <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col shrink-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3.5 flex-shrink-0">
            <div>
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" />
                Phân loại vật tư ({danhSachVatTu.length})
              </h2>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">Kéo thả hoặc bấm mũi tên để đổi thứ tự</p>
            </div>
            {canCreate(currentUser) && (
              <button 
                onClick={() => handleOpenTypeModal()}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all text-xs flex items-center gap-1 shadow-md shadow-blue-900/30 cursor-pointer"
                title="Thêm loại vật tư mới"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          {/* List of Material Types */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-0">
            {danhSachVatTu.map((type, index) => {
              const isSelected = type.id === selectedTypeId;
              const isHidden = type.trangThai === 'hidden' || (type as any).hidden;
              const isDragging = draggedIndex === index;
              const isDropTarget = dragOverIndex === index;

              return (
                <div 
                  key={type.id}
                  onClick={() => setSelectedTypeId(type.id)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={() => handleDragLeave(index)}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`w-full text-left rounded-xl p-3 border transition-all cursor-pointer flex flex-col gap-2 relative group select-none ${
                    isDropTarget 
                      ? 'border-blue-400 bg-blue-950/60 ring-2 ring-blue-500 shadow-lg scale-[1.01]' 
                      : isDragging
                      ? 'opacity-40 border-dashed border-blue-400/80 bg-slate-900/40 scale-[0.98]'
                      : isSelected 
                      ? 'bg-slate-800 border-blue-500 text-white shadow-lg' 
                      : 'bg-slate-950/40 hover:bg-slate-800/40 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Biểu tượng sắp xếp kéo thả (Drag Handle) */}
                      {canEdit(currentUser) && (
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragEnd={() => {
                            setDraggedIndex(null);
                            setDragOverIndex(null);
                          }}
                          className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors shrink-0 flex items-center justify-center"
                          title="Kéo biểu tượng này để thay đổi thứ tự phân loại"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <GripVertical size={16} />
                        </div>
                      )}
                      <span className="text-xl shrink-0">{type.icon || '📦'}</span>
                      <div className="font-extrabold text-sm tracking-tight truncate">{type.ten}</div>
                    </div>
                    {isHidden && (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/20 text-red-400 font-extrabold text-[9px] uppercase tracking-wide shrink-0">
                        Ẩn
                      </span>
                    )}
                  </div>

                  {/* Description / Actions footer inside the card */}
                  <div className="flex items-center justify-between border-t border-slate-800/50 pt-2 text-[10px] text-slate-400">
                    <span className="font-mono font-medium">{type.id}</span>
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {canEdit(currentUser) && (
                        <div className="flex items-center gap-0.5 mr-0.5">
                          <button
                            disabled={index === 0}
                            onClick={() => handleMoveType(index, 'up')}
                            className="p-1 hover:bg-slate-700 hover:text-blue-400 rounded transition-colors text-slate-500 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-500 cursor-pointer disabled:cursor-not-allowed"
                            title="Di chuyển lên trên"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            disabled={index === danhSachVatTu.length - 1}
                            onClick={() => handleMoveType(index, 'down')}
                            className="p-1 hover:bg-slate-700 hover:text-blue-400 rounded transition-colors text-slate-500 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-500 cursor-pointer disabled:cursor-not-allowed"
                            title="Di chuyển xuống dưới"
                          >
                            <ChevronDown size={13} />
                          </button>
                        </div>
                      )}
                      <button 
                        onClick={() => handleOpenTypeModal(type)}
                        className="p-1 hover:bg-slate-700 hover:text-blue-400 rounded transition-colors text-slate-500"
                        title="Sửa cấu hình loại"
                      >
                        <Edit size={12} />
                      </button>
                      {type.id !== 'BeTong' && (
                        <button 
                          onClick={() => handleToggleTypeStatus(type)}
                          className={`p-1 hover:bg-slate-700 rounded transition-colors ${isHidden ? 'text-emerald-500 hover:text-emerald-400' : 'text-red-500 hover:text-red-400'}`}
                          title={isHidden ? "Kích hoạt trở lại" : "Ẩn loại này"}
                        >
                          {isHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILED ITEMS TABLE */}
        <div className="flex-1 bg-slate-950/20 p-4 md:p-6 flex flex-col overflow-hidden">
          
          {selectedType ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              
              {/* Material Type Meta & Search bar */}
              <div className="mb-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 h-full w-24 opacity-10 pointer-events-none flex items-center justify-end pr-4">
                  <span className="text-7xl">{selectedType.icon}</span>
                </div>
                
                <div className="space-y-1.5 z-10">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{selectedType.icon}</span>
                    <h2 className="text-base font-black text-white tracking-tight uppercase">
                      Danh mục: {selectedType.ten}
                    </h2>
                    <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-slate-800 border border-slate-700 rounded-lg text-blue-400">
                      ID: {selectedType.id}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-semibold max-w-xl">
                    Tiêu đề BM02: <span className="text-slate-300 font-medium">{selectedType.tieuDeBM02 || 'Chưa định nghĩa'}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 z-10">
                  {/* Search Bar */}
                  <div className="relative w-full sm:w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5" />
                    <input 
                      type="text" 
                      placeholder="Tìm mặt hàng..."
                      className="w-full bg-slate-950/50 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-8.5 pr-3.5 py-1.5 text-[11px] font-bold outline-none text-slate-200 placeholder:text-slate-500"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <button 
                    onClick={handleDownloadTemplate}
                    className="px-2.5 py-1.5 bg-slate-850 hover:bg-slate-750 text-emerald-400 border border-slate-750 hover:border-slate-700 rounded-xl font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap active:scale-[0.98]"
                    title="Tải file mẫu Excel"
                  >
                    <FileSpreadsheet size={13} /> Mẫu Excel
                  </button>

                  {currentUser?.role !== 'viewer' && (
                    <button 
                      onClick={() => {
                        setImportFile(null);
                        setImportRows([]);
                        setIsImportModalOpen(true);
                      }}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-[11px] transition-all flex items-center gap-1 tracking-wide uppercase cursor-pointer whitespace-nowrap active:scale-[0.98]"
                      title="Import Excel"
                    >
                      <Upload size={13} /> Import Excel
                    </button>
                  )}

                  <button 
                    onClick={handleOpenExportQuoteModal}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-[11px] transition-all flex items-center gap-1 tracking-wide uppercase cursor-pointer whitespace-nowrap shadow-md shadow-indigo-900/30 active:scale-[0.98]"
                    title="Xuất Excel Báo giá cho danh mục đang chọn"
                  >
                    <Download size={13} /> 📤 Xuất Excel Báo giá
                  </button>

                  {canCreate(currentUser) && (
                    <button 
                      onClick={() => handleOpenItemModal()}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[11px] transition-all flex items-center gap-1 tracking-wide shadow-md shadow-blue-900/40 uppercase cursor-pointer whitespace-nowrap active:scale-[0.98]"
                    >
                      <Plus size={13} /> Thêm vật tư
                    </button>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xl min-h-0">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {isLoadingItems ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-400 font-bold text-sm gap-2">
                      <Loader2 className="animate-spin text-blue-500" size={24} />
                      Đang tải danh sách mặt hàng...
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-500 font-bold text-xs p-6 text-center gap-2">
                      <Package size={36} className="text-slate-700" />
                      <div>Không tìm thấy mặt hàng nào trong danh mục `{selectedType.ten}`.</div>
                      <p className="font-normal text-[10px] text-slate-600 max-w-sm">Chọn nút "Thêm vật tư" ở góc trên bên phải để bắt đầu khai báo các chi tiết về mặt hàng này.</p>
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left text-xs font-semibold">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 tracking-wider font-extrabold text-[10px] uppercase">
                          <th className="py-3.5 px-4 text-center w-12"><Hash size={13} className="mx-auto" /></th>
                          <th className="py-3.5 px-4">Tên mặt hàng / Quy cách</th>
                          <th className="py-3.5 px-4 text-center w-24">Đơn vị tính</th>
                          <th className="py-3.5 px-4 text-right w-36">Đơn giá định mức</th>
                          <th className="py-3.5 px-4 text-center w-28">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {filteredItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 text-center text-slate-500 font-mono font-bold">{idx + 1}</td>
                            <td className="py-3 px-4">
                              <div className="font-black text-white text-[13px] flex items-center gap-2 flex-wrap">
                                {item.name}
                                {(item as any).archived && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-black uppercase tracking-wider">
                                    Đã lưu trữ
                                  </span>
                                )}
                              </div>
                              {item.specification && (
                                <div className="text-[10px] text-slate-400 font-medium mt-0.5">{item.specification}</div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 font-bold font-mono text-[10px]">
                                {item.unit}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-amber-500 text-[13px]">
                              {item.unitPrice ? item.unitPrice.toLocaleString('vi-VN') + ' đ' : '0 đ'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {currentUser?.role === 'admin' || currentUser?.role === 'editor' ? (
                                  <button 
                                    onClick={() => handleOpenItemModal(item)}
                                    className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg border border-slate-800 hover:border-blue-500/30 transition-all cursor-pointer"
                                    title="Chỉnh sửa"
                                  >
                                    <Edit size={13} />
                                  </button>
                                ) : null}

                                {currentUser?.role === 'admin' ? (
                                  <button 
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg border border-slate-800 hover:border-red-500/30 transition-all cursor-pointer"
                                    title="Xóa vật tư"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                ) : currentUser?.role === 'editor' ? (
                                  <button 
                                    disabled
                                    className="p-1.5 text-slate-600 rounded-lg border border-slate-800 opacity-40 cursor-not-allowed"
                                    title="Bạn không có quyền xóa (Chỉ Admin mới được xóa)"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                
                {/* Table Footer Summary */}
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <span>Tổng số mặt hàng: {filteredItems.length}</span>
                  <span>Đồng bộ hóa: Toàn cục</span>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2">
              <Package size={48} className="text-slate-700 animate-pulse" />
              <div className="text-slate-400 font-bold text-sm">Chưa có loại vật tư nào hoạt động</div>
              <p className="text-xs text-slate-500 font-normal max-w-sm">Vui lòng nhấp vào nút "Thêm loại" ở cột bên trái để thiết lập các loại vật tư đầu tiên cho công trình của bạn.</p>
            </div>
          )}

        </div>

      </div>

      {/* ====================================================
          MODAL: THÊM / SỬA LOẠI VẬT TƯ (MATERIAL TYPE)
         ==================================================== */}
      {isTypeModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-slate-200">
            <header className="p-4 border-b border-slate-850 bg-slate-950 flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" />
                {editingType ? 'CẬP NHẬT PHÂN LOẠI VẬT TƯ' : 'TẠO PHÂN LOẠI VẬT TƯ MỚI'}
              </h3>
              <button 
                onClick={() => setIsTypeModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </header>

            <form onSubmit={handleSaveType} className="p-5 space-y-4 text-xs">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Mã định danh ID (*)</label>
                  <input 
                    type="text" 
                    required
                    disabled={!!editingType}
                    placeholder="Vd: XiMang, CatDa, BeTong..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-white font-bold outline-none disabled:opacity-50"
                    value={typeForm.id}
                    onChange={e => setTypeForm(prev => ({ ...prev, id: e.target.value.replace(/[^a-zA-Z0-9]/g, '') }))}
                  />
                  {!editingType && (
                    <p className="text-[9px] text-slate-500 font-medium">Viết liền không dấu, không có ký tự đặc biệt.</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tên loại vật tư (*)</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Vd: Bê Tông, Xi Măng..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-white font-bold outline-none"
                    value={typeForm.ten}
                    onChange={e => setTypeForm(prev => ({ ...prev, ten: e.target.value, tenVietTat: prev.tenVietTat || e.target.value.replace(/[^a-zA-Z0-9]/g, '') }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Icon đại diện</label>
                  <input 
                    type="text" 
                    placeholder="Emoji vd: 🏭, 🪵, 🏗️"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-white font-bold text-center outline-none"
                    value={typeForm.icon}
                    onChange={e => setTypeForm(prev => ({ ...prev, icon: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Màu sắc chủ đạo</label>
                  <div className="flex gap-2">
                    <input 
                      type="color" 
                      className="w-10 h-8 rounded-lg bg-transparent border border-slate-800 cursor-pointer"
                      value={typeForm.mauNen}
                      onChange={e => setTypeForm(prev => ({ ...prev, mauNen: e.target.value }))}
                    />
                    <input 
                      type="text" 
                      placeholder="#3b82f6"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-2 py-2 text-white font-bold outline-none font-mono text-[11px]"
                      value={typeForm.mauNen}
                      onChange={e => setTypeForm(prev => ({ ...prev, mauNen: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tên viết tắt</label>
                  <input 
                    type="text" 
                    placeholder="Vd: XiMang"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-white font-bold outline-none font-mono"
                    value={typeForm.tenVietTat}
                    onChange={e => setTypeForm(prev => ({ ...prev, tenVietTat: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tiêu đề Biểu Mẫu (BM02)</label>
                <textarea 
                  rows={2}
                  placeholder="Tiêu đề đề nghị cấp vật tư..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-slate-200 outline-none leading-relaxed font-medium"
                  value={typeForm.tieuDeBM02}
                  onChange={e => setTypeForm(prev => ({ ...prev, tieuDeBM02: e.target.value }))}
                />
              </div>

              <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl space-y-3">
                <div className="font-extrabold text-[10px] text-blue-400 uppercase tracking-wider">Thông tin nhân sự BM06</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-450 block font-bold uppercase">Người đề nghị</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
                      value={typeForm.bm06_nguoiDeNghi}
                      onChange={e => setTypeForm(prev => ({ ...prev, bm06_nguoiDeNghi: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-450 block font-bold uppercase">Trưởng bộ phận</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
                      value={typeForm.bm06_truongBoPhan}
                      onChange={e => setTypeForm(prev => ({ ...prev, bm06_truongBoPhan: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-450 block font-bold uppercase">Thủ kho / Mục đích</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
                      value={typeForm.bm06_thuKho}
                      onChange={e => setTypeForm(prev => ({ ...prev, bm06_thuKho: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsTypeModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase transition-all tracking-wider cursor-pointer text-center"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="submit"
                  disabled={savingType}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase transition-all tracking-wider cursor-pointer text-center flex items-center justify-center gap-1 shadow-lg shadow-blue-900/40"
                >
                  {savingType ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Lưu thay đổi
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL: THÊM / SỬA CHI TIẾT VẬT TƯ (MATERIAL ITEM)
         ==================================================== */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-slate-200">
            <header className="p-4 border-b border-slate-850 bg-slate-950 flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                {editingItem ? 'CHỈNH SỬA MẶT HÀNG' : `THÊM MẶT HÀNG CHO ${selectedType?.ten}`}
              </h3>
              <button 
                onClick={() => setIsItemModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </header>

            <form onSubmit={handleSaveItem} className="p-5 space-y-4 text-xs">
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tên mặt hàng (*)</label>
                <input 
                  type="text" 
                  required
                  placeholder="Vd: Thép Hòa Phát D10, Bê tông thương phẩm mác 250..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2.5 text-white font-bold outline-none text-[13px]"
                  value={itemForm.name}
                  onChange={e => setItemForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Đơn vị tính (ĐVT) (*)</label>
                  <select
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2.5 text-white font-bold outline-none cursor-pointer"
                    value={itemForm.unit}
                    onChange={e => setItemForm(prev => ({ ...prev, unit: e.target.value }))}
                  >
                    {Array.from(new Set(UNIT_OPTIONS)).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Đơn giá định mức (VND)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="Vd: 1250000"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-3 pr-8 py-2.5 text-white font-bold font-mono outline-none"
                      value={itemForm.unitPrice}
                      onChange={e => setItemForm(prev => ({ ...prev, unitPrice: e.target.value }))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">đ</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Quy cách kỹ thuật / Chi tiết</label>
                <input 
                  type="text" 
                  placeholder="Vd: Nhà máy liên doanh, mác 250, độ sụt 12+-2..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2.5 text-white font-semibold outline-none"
                  value={itemForm.specification}
                  onChange={e => setItemForm(prev => ({ ...prev, specification: e.target.value }))}
                />
              </div>

              <div className="p-3 bg-blue-950/20 border border-blue-900/30 rounded-xl flex items-start gap-2.5">
                <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                  Mặt hàng sau khi tạo sẽ lập tức được ghi nhận vào kho vật tư dùng chung và đồng bộ hóa tự động để bạn chọn khi làm dự toán hoặc đặt hàng cho bất kỳ công trình nào.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase transition-all tracking-wider cursor-pointer text-center"
                >
                  Hủy bỏ
                </button>
                {editingItem && (
                  <button
                    type="button"
                    onClick={handleSyncToEstimates}
                    disabled={savingItem}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-600/30 hover:border-emerald-600 font-bold uppercase transition-all tracking-wider cursor-pointer text-center flex items-center justify-center gap-1"
                    title="Đồng bộ thông tin vật tư sang dự toán hiện có"
                  >
                    Đồng bộ DT
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={savingItem}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase transition-all tracking-wider cursor-pointer text-center flex items-center justify-center gap-1 shadow-lg shadow-blue-900/40"
                >
                  {savingItem ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Xác nhận lưu
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL: CUSTOM CONFIRM DELETE / ARCHIVE MATERIAL
         ==================================================== */}
      {deleteConfirmationData && deleteConfirmationData.isOpen && (
        <div className="fixed inset-0 z-[300] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-slate-200">
            <header className="p-4 border-b border-slate-850 bg-slate-950 flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                XÁC NHẬN XÓA / LƯU TRỮ VẬT TƯ
              </h3>
              <button 
                onClick={() => setDeleteConfirmationData(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </header>

            <div className="p-5 space-y-4 text-xs">
              {/* Material Details Table */}
              <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 p-4 space-y-2.5">
                <div className="grid grid-cols-3 border-b border-slate-850/50 pb-2">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tên vật tư:</span>
                  <span className="col-span-2 text-white font-extrabold text-sm">{deleteConfirmationData.itemName}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-850/50 pb-2">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Loại vật tư:</span>
                  <span className="col-span-2 text-slate-300 font-bold">{deleteConfirmationData.typeName}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-850/50 pb-2">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">ĐVT:</span>
                  <span className="col-span-2 text-indigo-400 font-black">{deleteConfirmationData.unit}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-850/50 pb-2">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Quy cách:</span>
                  <span className="col-span-2 text-slate-300 font-mono">{deleteConfirmationData.specification || '(Trống)'}</span>
                </div>
                <div className="grid grid-cols-3">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Đơn giá hiện tại:</span>
                  <span className="col-span-2 text-rose-400 font-black text-sm">
                    {deleteConfirmationData.unitPrice ? `${deleteConfirmationData.unitPrice.toLocaleString('vi-VN')} đ` : '0 đ'}
                  </span>
                </div>
              </div>

              {/* Data Dependencies Checking */}
              {deleteConfirmationData.checking ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <span className="font-bold">Đang kiểm tra dữ liệu liên kết trên hệ thống...</span>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                    <h4 className="font-extrabold text-slate-300 uppercase text-[10px] tracking-wider border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-blue-400" />
                      Tình trạng phát sinh dữ liệu
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-[11px] pt-1">
                      <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 font-bold">Số dự toán sử dụng:</span>
                        <span className={`font-black ${deleteConfirmationData.estimateCount > 0 ? 'text-amber-500' : 'text-slate-500'}`}>
                          {deleteConfirmationData.estimateCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 font-bold">Số biểu mẫu phát sinh:</span>
                        <span className={`font-black ${deleteConfirmationData.bm06Count + deleteConfirmationData.bm02Count + deleteConfirmationData.bm032Count > 0 ? 'text-amber-500' : 'text-slate-500'}`}>
                          {deleteConfirmationData.bm06Count + deleteConfirmationData.bm02Count + deleteConfirmationData.bm032Count}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warning message if the material has been used */}
                  {deleteConfirmationData.totalUsage > 0 ? (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-3.5 rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 font-black text-[11px] uppercase tracking-wide">
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                        CẢNH BÁO LIÊN KẾT DỮ LIỆU
                      </div>
                      <p className="text-[11px] font-medium leading-relaxed">
                        Vật tư này đã được sử dụng trong dự toán/biểu mẫu/báo cáo. Xóa trực tiếp có thể làm lệch dữ liệu lịch sử hoặc gây lỗi hiển thị các biểu mẫu cũ.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-xl flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-black text-[11px] uppercase tracking-wide">VẬT TƯ AN TOÀN ĐỂ XÓA</div>
                        <p className="text-[11px] font-medium leading-relaxed mt-0.5 text-slate-300">
                          Vật tư này chưa từng phát sinh dữ liệu ở bất kỳ dự toán hay biểu mẫu nào. Bạn có thể xóa vĩnh viễn (hard delete) một cách an toàn.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Double Confirmation input for Force Delete */}
                  {deleteConfirmationData.showForceDeleteInput && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-black text-[11.5px] uppercase tracking-wide text-rose-400">XÁC NHẬN CƯỠNG BỨC (2/2)</div>
                          <p className="text-[10.5px] leading-relaxed mt-0.5 text-slate-300">
                            Hệ thống sẽ xóa vĩnh viễn dòng vật tư này. Việc này có nguy cơ làm mất liên kết thông tin vật tư trong các biểu mẫu lưu trữ lịch sử.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9.5px] font-black uppercase text-slate-400 tracking-wider">Vui lòng nhập <strong className="text-rose-400">XÓA</strong> vào ô dưới đây để xác nhận:</label>
                        <input
                          type="text"
                          className="w-full bg-slate-950 border border-rose-500/30 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl px-3 py-2 text-white font-extrabold outline-none text-[12px] uppercase text-center"
                          placeholder="Nhập chữ XÓA..."
                          value={deleteConfirmationData.forceDeleteInputText}
                          onChange={e => setDeleteConfirmationData(prev => prev ? { ...prev, forceDeleteInputText: e.target.value } : null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer with Dynamic Action Controls */}
            {!deleteConfirmationData.checking && (
              <footer className="p-4 border-t border-slate-850 bg-slate-950 flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => setDeleteConfirmationData(null)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-bold transition-all text-xs cursor-pointer"
                >
                  Hủy bỏ
                </button>

                {/* 1. Archive / Hide button (Soft Delete) - Always available, recommended */}
                <button
                  onClick={async () => {
                    const db = getDB();
                    if (!db) return;
                    try {
                      const itemRef = ref(db, `cauHinh/materialItems/${selectedTypeId}/${deleteConfirmationData.itemId}`);
                      const snap = await get(itemRef);
                      const currentVal = snap.exists() ? snap.val() : {};
                      
                      const updatedVal = {
                        ...currentVal,
                        archived: true,
                        active: false,
                        updatedAt: Date.now()
                      };
                      await set(itemRef, updatedVal);

                      await logActivity(
                        currentUser?.username || 'N/A',
                        currentUser?.role || 'admin',
                        'UPDATE' as any,
                        'Cấu hình',
                        `Lưu trữ / Ẩn vật tư [${deleteConfirmationData.itemName}] khỏi danh mục chuẩn`,
                        deleteConfirmationData.itemId,
                        currentVal,
                        updatedVal
                      );

                      setToast({ message: 'Đã lưu trữ / ẩn vật tư thành công!', type: 'success' });
                      setDeleteConfirmationData(null);
                      loadItems(selectedTypeId);
                    } catch (err: any) {
                      console.error('Error archiving material item:', err);
                      setToast({ message: `Lỗi: ${err.message}`, type: 'error' });
                    }
                  }}
                  className="px-4 py-2 bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 hover:text-amber-300 rounded-xl font-black transition-all text-xs cursor-pointer"
                >
                  Ẩn & Lưu trữ vật tư
                </button>

                {/* 2. Permanent/Force Delete button (Hard Delete) */}
                {deleteConfirmationData.totalUsage === 0 ? (
                  // Safe Hard Delete if usage is 0
                  <button
                    onClick={async () => {
                      const db = getDB();
                      if (!db) return;
                      try {
                        const itemRef = ref(db, `cauHinh/materialItems/${selectedTypeId}/${deleteConfirmationData.itemId}`);
                        const snap = await get(itemRef);
                        const currentVal = snap.exists() ? snap.val() : {};

                        await remove(itemRef);

                        await logActivity(
                          currentUser?.username || 'N/A',
                          currentUser?.role || 'admin',
                          'DELETE' as any,
                          'Cấu hình',
                          `Xóa vĩnh viễn vật tư [${deleteConfirmationData.itemName}] chưa có dữ liệu`,
                          deleteConfirmationData.itemId,
                          currentVal,
                          null
                        );

                        setToast({ message: 'Đã xóa vĩnh viễn vật tư thành công!', type: 'success' });
                        setDeleteConfirmationData(null);
                        loadItems(selectedTypeId);
                      } catch (err: any) {
                        console.error('Error hard deleting material item:', err);
                        setToast({ message: `Lỗi: ${err.message}`, type: 'error' });
                      }
                    }}
                    className="px-4 py-2 bg-rose-600 text-white hover:bg-rose-500 rounded-xl font-black transition-all text-xs cursor-pointer"
                  >
                    Xóa vĩnh viễn
                  </button>
                ) : (
                  // Admin Only Force Delete if usage > 0 (requires double confirmation & text typing)
                  <>
                    {!deleteConfirmationData.showForceDeleteInput ? (
                      <button
                        onClick={() => {
                          setDeleteConfirmationData(prev => prev ? { ...prev, showForceDeleteInput: true } : null);
                        }}
                        className="px-4 py-2 bg-rose-950 text-rose-400 hover:bg-rose-900 border border-rose-500/30 rounded-xl font-black transition-all text-xs cursor-pointer"
                      >
                        Vẫn muốn xóa cứng
                      </button>
                    ) : (
                      <button
                        disabled={deleteConfirmationData.forceDeleteInputText.trim().toUpperCase() !== 'XÓA'}
                        onClick={async () => {
                          const db = getDB();
                          if (!db) return;
                          try {
                            const itemRef = ref(db, `cauHinh/materialItems/${selectedTypeId}/${deleteConfirmationData.itemId}`);
                            const snap = await get(itemRef);
                            const currentVal = snap.exists() ? snap.val() : {};

                            await remove(itemRef);

                            await logActivity(
                              currentUser?.username || 'N/A',
                              currentUser?.role || 'admin',
                              'DELETE' as any,
                              'Cấu hình',
                              `Xóa cưỡng bức (vĩnh viễn) vật tư [${deleteConfirmationData.itemName}] khỏi hệ thống`,
                              deleteConfirmationData.itemId,
                              currentVal,
                              null
                            );

                            setToast({ message: 'Đã xóa cưỡng bức vật tư khỏi hệ thống!', type: 'success' });
                            setDeleteConfirmationData(null);
                            loadItems(selectedTypeId);
                          } catch (err: any) {
                            console.error('Error force deleting material item:', err);
                            setToast({ message: `Lỗi: ${err.message}`, type: 'error' });
                          }
                        }}
                        className={`px-4 py-2 rounded-xl font-black transition-all text-xs cursor-pointer ${
                          deleteConfirmationData.forceDeleteInputText.trim().toUpperCase() === 'XÓA'
                            ? 'bg-rose-600 text-white hover:bg-rose-500'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                        }`}
                      >
                        Xác nhận xóa cưỡng bức
                      </button>
                    )}
                  </>
                )}
              </footer>
            )}
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL: IMPORT VẬT TƯ HÀNG LOẠT TỪ EXCEL
         ==================================================== */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden max-h-[90vh] animate-in zoom-in-95 duration-150 text-slate-200">
            <header className="p-4 border-b border-slate-850 bg-slate-950 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-500" />
                  IMPORT HÀNG LOẠT CHO DANH MỤC: {selectedType?.ten}
                </h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                  Lưu ý: Chỉ import vật tư thuộc loại <span className="text-slate-300 underline font-bold">{selectedType?.ten}</span>. Hệ thống không cho phép import lẫn lộn loại vật tư.
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setImportRows([]);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              
              {/* STEP 1: UPLOAD FILE AREA (if no file parsed yet) */}
              {importRows.length === 0 ? (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-950/20 border border-blue-900/30 rounded-xl flex items-start gap-2.5">
                    <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                      <p className="text-blue-300 font-bold mb-1">Quy định cột trong file Excel mẫu:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        <li>Cột bắt buộc phải có giá trị: <strong className="text-white">Tên vật tư</strong> và <strong className="text-white">ĐVT</strong>.</li>
                        <li>Cột tùy chọn: <strong className="text-white">Quy cách, Đơn giá, Nhà cung cấp, Ghi chú</strong>.</li>
                        <li>Nếu bỏ trống <strong className="text-emerald-400">Đơn giá</strong>, hệ thống sẽ lưu mặc định là 0 và nhắc nhập đơn giá khi tạo phiếu BM02.</li>
                        <li>Không hỗ trợ các cột định mức hay tiến độ tại đây.</li>
                      </ul>
                    </div>
                  </div>

                  <div 
                    onDragOver={(e) => { e.preventDefault(); setDragOverImport(true); }}
                    onDragLeave={() => setDragOverImport(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverImport(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleProcessImportFile(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => importFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      dragOverImport 
                        ? 'border-emerald-500 bg-emerald-950/20 text-white scale-[0.99]' 
                        : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={importFileInputRef}
                      className="hidden"
                      accept=".xlsx, .xls"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleProcessImportFile(e.target.files[0]);
                        }
                      }}
                    />
                    {importLoading ? (
                      <div className="space-y-2">
                        <Loader2 className="animate-spin text-emerald-500 mx-auto" size={32} />
                        <p className="text-xs font-bold text-slate-300">Đang đọc và kiểm tra dữ liệu file Excel...</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl w-fit mx-auto text-emerald-400 group-hover:scale-105 transition-transform">
                          <FileSpreadsheet size={28} />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-slate-300">Kéo thả file Excel vào đây hoặc click để chọn file</p>
                          <p className="text-[10px] text-slate-500 font-semibold mt-1">Hỗ trợ các file định dạng Excel (.xlsx, .xls)</p>
                        </div>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadTemplate();
                          }}
                          className="px-3.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-emerald-400 hover:text-emerald-300 rounded-xl font-bold text-[10px] transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
                        >
                          <FileSpreadsheet size={13} /> Tải file Excel mẫu tại đây
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                
                // STEP 2: REVIEW & VALIDATION PREVIEW
                <div className="space-y-4">
                  {/* Stats Overview */}
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 text-center space-y-0.5">
                      <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Tổng số dòng</div>
                      <div className="text-lg font-black text-white font-mono">{importStats.total}</div>
                    </div>
                    <div className="bg-emerald-950/10 border border-emerald-900/20 rounded-xl p-3 text-center space-y-0.5">
                      <div className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-wider">Hợp lệ</div>
                      <div className="text-lg font-black text-emerald-400 font-mono">{importStats.valid}</div>
                    </div>
                    <div className="bg-red-950/15 border border-red-900/20 rounded-xl p-3 text-center space-y-0.5">
                      <div className="text-[10px] text-red-500 font-extrabold uppercase tracking-wider">Lỗi bỏ qua</div>
                      <div className="text-lg font-black text-red-400 font-mono">{importStats.errors}</div>
                    </div>
                    <div className="bg-amber-950/10 border border-amber-900/20 rounded-xl p-3 text-center space-y-0.5">
                      <div className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider">Trùng lặp</div>
                      <div className="text-lg font-black text-amber-400 font-mono">{importStats.duplicates}</div>
                    </div>
                    <div className="bg-blue-950/15 border border-blue-900/20 rounded-xl p-3 text-center space-y-0.5">
                      <div className="text-[10px] text-blue-500 font-extrabold uppercase tracking-wider">Sẽ thêm mới</div>
                      <div className="text-lg font-black text-blue-400 font-mono">{importStats.toAdd}</div>
                    </div>
                    <div className="bg-purple-950/15 border border-purple-900/20 rounded-xl p-3 text-center space-y-0.5">
                      <div className="text-[10px] text-purple-500 font-extrabold uppercase tracking-wider">Sẽ cập nhật</div>
                      <div className="text-lg font-black text-purple-400 font-mono">{importStats.toUpdate}</div>
                    </div>
                  </div>

                  {/* Conflict Resolution Settings */}
                  <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Settings className="w-3.5 h-3.5 text-blue-400" />
                        XỬ LÝ TRÙNG VẬT TƯ (TRÙNG TÊN, ĐVT & QUY CÁCH)
                      </div>
                      <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                        Tùy chọn hành động khi phát hiện vật tư trong file Excel trùng khớp với vật tư đã tồn tại trong danh mục này.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setConflictOption('skip')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          conflictOption === 'skip' 
                            ? 'bg-slate-800 border border-slate-700 text-white font-extrabold' 
                            : 'bg-slate-950/30 border border-slate-900 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        Bỏ qua dòng trùng
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          if (currentUser?.role === 'admin') {
                            setConflictOption('update');
                          } else {
                            setToast({ message: 'Quyền hạn: Chỉ tài khoản Admin mới có quyền cập nhật đè vật tư trùng!', type: 'error' });
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          conflictOption === 'update' 
                            ? 'bg-purple-600 border border-purple-500 text-white font-extrabold' 
                            : 'bg-slate-950/30 border border-slate-900 text-slate-500 hover:text-slate-300'
                        } ${currentUser?.role !== 'admin' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        title={currentUser?.role !== 'admin' ? "Chỉ dành cho Admin" : "Cập nhật dữ liệu đè lên vật tư cũ"}
                      >
                        {currentUser?.role !== 'admin' && <AlertCircle size={12} className="text-slate-500" />}
                        Cập nhật vật tư trùng
                      </button>
                    </div>
                  </div>

                  {/* Preview Table Header */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Xem trước bảng dữ liệu kiểm tra</div>
                    
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/20">
                      <div className="overflow-x-auto max-h-80 custom-scrollbar">
                        <table className="w-full text-[11px] text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] font-black uppercase tracking-wider sticky top-0">
                              <th className="py-2.5 px-3 w-10 text-center">STT</th>
                              <th className="py-2.5 px-3 w-28 text-center">Kết quả</th>
                              <th className="py-2.5 px-3">Tên vật tư</th>
                              <th className="py-2.5 px-3 w-20">ĐVT</th>
                              <th className="py-2.5 px-3">Quy cách kỹ thuật</th>
                              <th className="py-2.5 px-3 w-28">Đơn giá (VND)</th>
                              <th className="py-2.5 px-3">Nhà cung cấp</th>
                              <th className="py-2.5 px-3">Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850">
                            {importRows.map((row, idx) => {
                              const hasErrors = !row.isValid;
                              const isDup = row.isValid && row.isDuplicate;
                              let statusBadge = null;
                              
                              if (hasErrors) {
                                statusBadge = (
                                  <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/20 text-red-400 font-extrabold text-[9px] uppercase tracking-wide">
                                    Lỗi dữ liệu
                                  </span>
                                );
                              } else if (isDup) {
                                statusBadge = (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-400 font-extrabold text-[9px] uppercase tracking-wide">
                                    Trùng lặp
                                  </span>
                                );
                              } else {
                                statusBadge = (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 font-extrabold text-[9px] uppercase tracking-wide">
                                    Hợp lệ
                                  </span>
                                );
                              }

                              return (
                                <tr key={row.tempId} className={`hover:bg-slate-900/40 ${hasErrors ? 'bg-red-950/5' : isDup ? 'bg-amber-950/5' : ''}`}>
                                  <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                                  <td className="py-2.5 px-3 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      {statusBadge}
                                      {hasErrors && (
                                        <div className="text-[8px] text-red-400 font-semibold max-w-[120px] leading-tight text-center">
                                          {row.errors.join(', ')}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 font-bold text-slate-200">{row.name || <span className="text-red-500 italic">Thiếu</span>}</td>
                                  <td className="py-2.5 px-3 text-slate-300 font-semibold">{row.unit || <span className="text-red-500 italic">Thiếu</span>}</td>
                                  <td className="py-2.5 px-3 text-slate-400">{row.specification || <span className="text-slate-600 italic">Không có</span>}</td>
                                  <td className="py-2.5 px-3">
                                    {row.isPriceError ? (
                                      <div className="relative">
                                        <input 
                                          type="text"
                                          className="w-full bg-red-950/40 border border-red-500 rounded px-2 py-1 font-mono text-white text-xs font-bold outline-none"
                                          value={row.priceRawInput}
                                          onChange={(e) => handleUpdateRowPrice(row.tempId, e.target.value)}
                                          placeholder="Nhập số"
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <input 
                                          type="text"
                                          className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-2 py-0.5 font-mono text-emerald-400 text-xs font-bold outline-none text-right"
                                          value={row.unitPrice}
                                          onChange={(e) => handleUpdateRowPrice(row.tempId, e.target.value)}
                                        />
                                        <span className="text-slate-600 text-[9px] font-bold">đ</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-400">{row.supplier || <span className="text-slate-600 italic">Mặc định</span>}</td>
                                  <td className="py-2.5 px-3 text-slate-400 max-w-[150px] truncate" title={row.note}>{row.note || <span className="text-slate-600 italic">Trống</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <footer className="p-4 bg-slate-950 border-t border-slate-850 flex items-center justify-between">
              <div>
                {importRows.length > 0 && (
                  <p className="text-[10px] text-slate-500 font-semibold">
                    File: <span className="text-slate-300 font-bold">{importFile?.name}</span> ({Math.round((importFile?.size || 0) / 1024)} KB)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportFile(null);
                    setImportRows([]);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-wider transition-all text-xs cursor-pointer"
                >
                  Hủy bỏ
                </button>

                {importRows.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => {
                      setImportFile(null);
                      setImportRows([]);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-wider transition-all text-xs cursor-pointer"
                  >
                    Chọn file khác
                  </button>
                )}

                {importRows.length > 0 && (
                  <button 
                    type="button"
                    onClick={handleSaveImport}
                    disabled={importSaving || importStats.willSave === 0}
                    className={`px-5 py-2 rounded-xl font-bold uppercase tracking-wider transition-all text-xs flex items-center gap-1.5 shadow-lg ${
                      importStats.willSave === 0 
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed shadow-none border border-slate-850' 
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-900/30'
                    }`}
                  >
                    {importSaving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Lưu vào danh mục ({importStats.willSave})
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL: XUẤT EXCEL BÁO GIÁ VẬT TƯ
         ==================================================== */}
      {isExportQuoteModalOpen && selectedType && (
        <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-slate-200">
            <header className="p-4 border-b border-slate-850 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    XUẤT EXCEL BÁO GIÁ VẬT TƯ
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Danh mục: <span className="text-indigo-300 font-bold">{selectedType.ten}</span> ({items.length} mặt hàng)
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsExportQuoteModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </header>

            <div className="p-5 space-y-4 text-xs">
              
              {/* Phạm vi xuất */}
              <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Phạm vi Export
                </label>
                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2.5 cursor-pointer text-slate-200 font-bold text-xs">
                    <input 
                      type="radio"
                      name="exportScope"
                      checked={exportQuoteScope === 'all'}
                      onChange={() => setExportQuoteScope('all')}
                      className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500"
                    />
                    <span>Xuất toàn bộ danh mục <span className="text-slate-400 font-normal">({items.length} mặt hàng)</span></span>
                  </label>

                  <label className={`flex items-center gap-2.5 text-xs font-bold ${searchQuery.trim() ? 'cursor-pointer text-slate-200' : 'opacity-50 cursor-not-allowed text-slate-500'}`}>
                    <input 
                      type="radio"
                      name="exportScope"
                      disabled={!searchQuery.trim()}
                      checked={exportQuoteScope === 'filtered'}
                      onChange={() => setExportQuoteScope('filtered')}
                      className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500"
                    />
                    <span>Chỉ xuất vật tư đang hiển thị sau tìm kiếm <span className="text-slate-400 font-normal">({filteredItems.length} mặt hàng)</span></span>
                  </label>
                </div>
              </div>

              {/* Tùy chọn cột & Đơn giá */}
              <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Cấu hình các cột hiển thị
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-bold text-xs">
                    <input 
                      type="checkbox"
                      checked={exportIncludePreTax}
                      onChange={e => setExportIncludePreTax(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500"
                    />
                    <span>Giá trước thuế</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-bold text-xs">
                    <input 
                      type="checkbox"
                      checked={exportIncludePostTax}
                      onChange={e => setExportIncludePostTax(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500"
                    />
                    <span>Giá sau thuế</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-bold text-xs">
                    <input 
                      type="checkbox"
                      checked={exportIncludeNotes}
                      onChange={e => setExportIncludeNotes(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500"
                    />
                    <span>Ghi chú</span>
                  </label>
                </div>
              </div>

              {/* Bổ sung thông tin báo giá */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Thuế VAT (%)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    value={exportVatRate}
                    onChange={e => setExportVatRate(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-white font-bold outline-none"
                    placeholder="Mặc định 8%"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Người xuất file</label>
                  <input 
                    type="text" 
                    value={exportExporterName}
                    onChange={e => setExportExporterName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-white font-bold outline-none"
                    placeholder="Tên người tạo báo giá"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Nhà cung cấp / Đơn vị báo giá</label>
                <input 
                  type="text" 
                  value={exportSupplierName}
                  onChange={e => setExportSupplierName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-white font-bold outline-none"
                  placeholder="Vd: Công ty Cổ phần Thép Nhân Luật, Bê Tông TDC..."
                />
              </div>

            </div>

            <footer className="p-4 bg-slate-950 border-t border-slate-850 flex items-center justify-between">
              <p className="text-[10px] text-slate-500 font-semibold">
                Định dạng: <span className="text-slate-300 font-bold">.xlsx (A4 ngang, tự động căn rộng)</span>
              </p>
              <div className="flex items-center gap-2.5">
                <button 
                  type="button"
                  onClick={() => setIsExportQuoteModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-wider transition-all text-xs cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="button"
                  onClick={handleExecuteExportQuote}
                  disabled={isExportingQuote}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-wider transition-all text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-900/30 cursor-pointer active:scale-[0.98]"
                >
                  {isExportingQuote ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  📤 Xuất Excel Báo giá
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

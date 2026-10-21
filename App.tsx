
import React, { useState, useEffect } from 'react';
import { 
  Upload, FileText, Download, Loader2, Plus, Trash2, AlertCircle, AlertTriangle,
  CheckCircle2, LayoutGrid, FileSpreadsheet, Save, History, 
  Database, X, RefreshCw, Settings, Image as ImageIcon,
  Files, Search, Users, LogOut, Calendar,
  ChevronLeft, ChevronRight, Lock, Sparkles
} from 'lucide-react';
import { extractDataFromFile, extractBm02Ocr, OcrPreviewData } from './services/geminiService';
import { BM02OcrPreviewModal } from './src/components/BM02OcrPreviewModal';
import { exportToDocx, exportBBNTToDocx } from './services/docxExport';
import { exportToExcel, exportBBNTToExcel } from './services/excelExport';
import { exportToPDF, exportToImage } from './services/pdfImageExport';
import { 
  FormData, BBNTData, LineItem, BBNTItem, MaterialPrice, CauHinh, MaterialType, UserAccount, BM032Representative 
} from './types';
import { BM02PriceUpdateService, BM02ItemPriceChange, extractPriceFromMaterial } from './src/services/BM02PriceUpdateService';
import { Auth } from './src/components/Auth';
import { VNFormattedInput } from './src/components/VNFormattedInput';
import MaterialContentConfigModal, { GET_FALLBACK_MATERIAL_CONFIG, enrichMaterialConfig } from './src/components/MaterialContentConfigModal';
import { BM032ReceiverListEditor } from './src/components/BM032ReceiverListEditor';
import { MaterialMultiSelect } from './src/components/MaterialMultiSelect';
import { BM02SignatureSection } from './src/components/BM02SignatureSection';
import { 
  cleanProposerName, 
  updateReceiverListWithChiHuyTruong, 
  updateKyTenWithPBanDeNghi, 
  isPBanDeNghiTitle, 
  isChiHuyTruongPosition 
} from './src/utils/proposerUtils';

// Lazy loaded components for code splitting & bundle optimization
const QuanTriTab = React.lazy(() => import('./src/components/QuanTriTab').then(m => ({ default: m.QuanTriTab })));
const MaterialManager = React.lazy(() => import('./src/components/MaterialManager'));
import { canEdit, canCreate, canDelete, isAdmin } from './src/lib/authService';
import { groupItemsForExport } from './src/utils/exportUtils';
import { extractMaPhieu, extractMaPhieuFromFileName, isTemplateCodeOnly, isValidMaPhieu, formatStandardMaPhieu } from './src/utils/extractMaPhieu';
import { ConfigService } from './src/services/ConfigService';
import { MaterialService } from './src/services/MaterialService';
import { HistoryService } from './src/services/HistoryService';
import { AuditLogService } from './src/services/AuditLogService';
import { MaterialTypeService } from './src/services/MaterialTypeService';
import { OrderService } from './src/services/OrderService';
import { ReportService } from './src/services/ReportService';
import { BackupService } from './src/services/BackupService';
import { FirebaseInitService } from './src/services/FirebaseInitService';
import { MaterialMatchingService, cleanMaterialName, extractDiameter, extractConcreteGrade } from './src/services/MaterialMatchingService';
import { ProjectService } from './src/services/ProjectService';
import { bootstrapFirebaseConfig } from './src/bootstrapFirebaseConfig';
import { ref, remove } from 'firebase/database';
import { doc, deleteDoc } from 'firebase/firestore';
import { 
  removeUndefined,
  getDB, getFirestoreDB, sanitizeRTDBPath,
  backupDatabase, restoreDatabase, resetDatabase, listBackups, deleteBackup, identifyBackupDuplicates, enforceAutoBackupRetention, enforceCloudBackupRetention,
  fetchSystemFirebaseConfig, saveSystemFirebaseConfig,
  isValidEstimateItem, fetchBackupScheduleConfig, saveBackupScheduleConfig,
  getProjectTotalUnits
} from './src/lib/firebaseService';
import { recalculateAllOrdersChain } from './src/lib/recalculationService';
import { formatUnitNameForTable, stripAppliedUnitsSuffix, extractCongTrinhFromDiaDiem, formatBM02Currency, parseVNNumber, normalizeMultilineContent } from './src/lib/formatUtils';
import { numberToVietnameseWords } from './src/utils/numberToWords';

// ================================================
// TEMPLATE KÝ TÊN BBNT — PHẦN CỐ ĐỊNH
// Key lấy từ window._cauHinh nhóm bbnt_benA/bbnt_benB
// KHÔNG dùng pkg_tenBenGiao hay pkg_benGiaoTen
// ================================================
const BBNT_CHU_KY_KEYS = {
  benA: {
    congTy:  'bbnt_benA_congTy',
    daiDien: 'bbnt_benA_daiDien',
  },
  benB: {
    congTy:  'bbnt_benB_congTy',
    daiDien: 'bbnt_benB_daiDien',
  }
};

const KY_TEN_MAC_DINH = [
  { id: "kt_1", chucDanh: "PHÒNG KẾ TOÁN",  hoTen: "NGUYỄN THỊ THÊM", viTri: 10 },
  { id: "kt_4", chucDanh: "P.BAN ĐỀ NGHỊ", hoTen: "TRẦN KIM NGUYỆN", viTri: 20 },
  { id: "kt_2", chucDanh: "NGƯỜI LẬP",      hoTen: "TRẦN NAM ANH", viTri: 30 },
  { id: "kt_3", chucDanh: "GIÁM ĐỐC DUYỆT", hoTen: "NGUYỄN XUÂN NAM", viTri: 40 }
];

// ================================================
// FORMAT NGÀY — dùng chung toàn bộ app
// ================================================
function chuanHoaNgay(val) {
  if (!val || val === '') return '';

  var str = String(val).trim();

  // Định dạng "ngày DD tháng MM năm YYYY"
  var matchVN = str.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
  if (matchVN) {
    var d = matchVN[1].padStart(2, '0');
    var m = matchVN[2].padStart(2, '0');
    var y = matchVN[3];
    return `${d}/${m}/${y}`;
  }

  // Đã đúng định dạng DD/MM/YYYY → trả về ngay
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return str;

  // Định dạng YYYY-MM-DD (không có giờ)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    var p = str.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  // Định dạng ISO 8601: 2025-07-10T17:00:00.000Z hoặc tương tự
  if (str.indexOf('T') !== -1 || str.indexOf('Z') !== -1) {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      var ngay  = String(dt.getUTCDate()).padStart(2, '0');
      var thang = String(dt.getUTCMonth() + 1).padStart(2, '0');
      var nam   = dt.getUTCFullYear();
      return ngay + '/' + thang + '/' + nam;
    }
  }

  // Thử parse bất kỳ
  const dt2 = new Date(str);
  if (!isNaN(dt2.getTime())) {
    var ngay2  = String(dt2.getDate()).padStart(2, '0');
    var thang2 = String(dt2.getMonth() + 1).padStart(2, '0');
    var nam2   = dt2.getFullYear();
    return ngay2 + '/' + thang2 + '/' + nam2;
  }

  // Không parse được → trả về nguyên gốc
  return str;
}

export function addOneDayToString(dateStr: string): string {
  if (!dateStr) return '';
  const str = String(dateStr).trim();

  const matchVN = str.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
  if (matchVN) {
    const day = parseInt(matchVN[1], 10);
    const month = parseInt(matchVN[2], 10) - 1;
    const year = parseInt(matchVN[3], 10);
    const dateObj = new Date(year, month, day);
    dateObj.setDate(dateObj.getDate() + 1);
    const newDay = String(dateObj.getDate()).padStart(2, '0');
    const newMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
    const newYear = dateObj.getFullYear();
    return `ngày ${newDay} tháng ${newMonth} năm ${newYear}`;
  }

  const inputChuan = chuanHoaNgay(dateStr);
  if (!inputChuan) return dateStr;

  const parts = inputChuan.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
       const dateObj = new Date(year, month - 1, day);
       dateObj.setDate(dateObj.getDate() + 1);

       const newDay = String(dateObj.getDate()).padStart(2, '0');
       const newMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
       const newYear = dateObj.getFullYear();
       return `${newDay}/${newMonth}/${newYear}`;
    }
  }
  return dateStr;
}

function taoIdTuTen(ten: string) {
  // Bỏ dấu tiếng Việt
  const khongDau = ten.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
  // Viết hoa chữ cái đầu mỗi từ, bỏ ký tự đặc biệt, bỏ khoảng trắng
  return khongDau
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
}

function layTieuDeBM02(loaiVatTu: string) {
  return "V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ";
}
function formatNgay(input: any, coTieuDe = false) {
  var placeholder = coTieuDe
    ? 'Tp. Hồ Chí Minh, ngày ... tháng ... năm 2025'
    : 'ngày ... tháng ... năm 2025';
  if (!input) return placeholder;
  
  var inputChuan = chuanHoaNgay(input);
  if (!inputChuan || !inputChuan.includes('/')) return input;

  try {
    var p = inputChuan.split('/');
    var day = p[0];
    var month = p[1];
    var year = p[2];

    if (coTieuDe) {
      return `Tp. Hồ Chí Minh, ngày ${day} tháng ${month} năm ${year}`;
    }
    return `ngày ${day} tháng ${month} năm ${year}`;
  } catch (e) {
    return input;
  }
}

function isValidSenderCompany(c?: string): boolean {
  if (!c || typeof c !== 'string') return false;
  const s = c.trim().toUpperCase();
  return s !== '' && !s.includes('XÂY DỰNG IJC') && !s.includes('XAY DUNG IJC') && s !== 'ĐƠN VỊ CUNG CẤP';
}

function getFixedSenderCompany(matConfig?: any, cauHinh?: any): string {
  const candidates = [
    matConfig?.bm032?.senderCompany,
    matConfig?.pkg_tenBenGiao,
    matConfig?.bm032?.bbnt_benA_congTy,
    matConfig?.bbnt_benA_congTy,
    cauHinh?.pkg_tenBenGiao,
    cauHinh?.bbnt_benA_congTy,
    matConfig?.bm032?.nhaCungCap,
    cauHinh?.bbnt_nhaCungCap,
    matConfig?.nhaCungCap,
    (window as any)?._currentSenderCompany
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string' && isValidSenderCompany(c)) {
      return c.trim();
    }
  }
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim() !== '' && !c.toUpperCase().includes('IJC')) {
      return c.trim();
    }
  }
  return 'ĐƠN VỊ CUNG CẤP';
}

// ================================================
// HÀM RENDER CHỮ KÝ CÁC BÊN (BBNT)
// ================================================
function renderChuKyBBNT(config: any = {}, duongXuat = false) {
  const merged = {
    ...((window as any)._cauHinh || {}),
    ...config
  };
  const fixedCompany = getFixedSenderCompany((window as any)._currentMaterialConfig, merged);
  let rawBenA = merged.senderCompany || merged.pkg_tenBenGiao || merged.bbnt_benA_congTy || merged[BBNT_CHU_KY_KEYS.benA.congTy] || '';
  if (!isValidSenderCompany(rawBenA)) {
    rawBenA = fixedCompany;
  }
  const benA_CT = isValidSenderCompany(rawBenA) ? rawBenA : (rawBenA && !rawBenA.toUpperCase().includes('IJC') ? rawBenA : 'ĐƠN VỊ CUNG CẤP');
  const firstRep = merged.senderList?.[0]?.name || merged.pkg_benGiaoTen;
  const benA_DD = merged[BBNT_CHU_KY_KEYS.benA.daiDien] || merged.bbnt_benA_daiDien || firstRep || benA_CT;
  const benB_CT = merged[BBNT_CHU_KY_KEYS.benB.congTy] || merged.bbnt_benB_congTy || merged.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC';
  const benB_DD = merged[BBNT_CHU_KY_KEYS.benB.daiDien] || merged.bbnt_benB_daiDien || benB_CT;

  if (duongXuat) {
    // Trả về HTML string cho DOCX/Excel/PDF
    return `
      <table style="width:100%; border:none; margin-top:20px;">
        <tr>
          <td style="width:50%; text-align:center; vertical-align:top;">
            <div style="font-weight:bold; text-transform:uppercase;">${benA_CT}</div>
            <div style="font-style:italic; font-size:11px;">(Ký, ghi rõ họ tên và đóng dấu)</div>
            <div style="margin-top:120px; font-weight:bold;">${benA_DD}</div>
          </td>
          <td style="width:50%; text-align:center; vertical-align:top;">
            <div style="font-weight:bold; text-transform:uppercase;">${benB_CT}</div>
            <div style="font-style:italic; font-size:11px;">(Ký, ghi rõ họ tên và đóng dấu)</div>
            <div style="margin-top:120px; font-weight:bold;">${benB_DD}</div>
          </td>
        </tr>
      </table>
    `;
  }

  // Trả về React Component cho UI
  return (
    <div className="grid grid-cols-2 gap-4 mt-8 text-center" data-section="chuKyBBNT">
      <div className="space-y-20">
        <div>
          <div className="font-bold uppercase">{benA_CT}</div>
          <div className="italic text-[10px]">(Ký, ghi rõ họ tên và đóng dấu)</div>
        </div>
        <div>
          <div className="font-bold text-red-600">{benA_DD}</div>
        </div>
      </div>
      <div className="space-y-20">
        <div>
          <div className="font-bold uppercase">{benB_CT}</div>
          <div className="italic text-[10px]">(Ký, ghi rõ họ tên và đóng dấu)</div>
        </div>
        <div>
          <div className="font-bold text-red-600">{benB_DD}</div>
        </div>
      </div>
    </div>
  );
}

function ThemVatTuModal({ onClose, onSave, danhSachHienTai, vatTuCanSua }: { onClose: () => void, onSave: (data: any) => Promise<void>, danhSachHienTai: MaterialType[], vatTuCanSua?: MaterialType }) {
  const [ten, setTen] = useState(vatTuCanSua ? vatTuCanSua.ten : '');
  const [tieuDe, setTieuDe] = useState(vatTuCanSua ? vatTuCanSua.tieuDeBM02 : '');
  const [icon, setIcon] = useState(vatTuCanSua ? vatTuCanSua.icon : '📦');
  const [mauNen, setMauNen] = useState(vatTuCanSua ? vatTuCanSua.mauNen : '#455a64');
  
  // Custom BM06 Signature states
  const [bm06TruongBoPhan, setBm06TruongBoPhan] = useState(vatTuCanSua ? (vatTuCanSua.bm06_truongBoPhan || '') : '');
  const [bm06ThuKho, setBm06ThuKho] = useState(vatTuCanSua ? (vatTuCanSua.bm06_thuKho || '') : '');
  const [bm06NguoiDeNghi, setBm06NguoiDeNghi] = useState(vatTuCanSua ? (vatTuCanSua.bm06_nguoiDeNghi || '') : '');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const icons = ['📦', '🏗️', '🧱', '🏭', '⚙️', '🪨', '🚜', '🔧', '🔨', '🪵', '🏠', '💧', '⚡', '🎨', '🪜', '🚛', '🚚', '🛠️', '🛢️', '📏', '📐', '⚙️', '👷', '🔩', '🔗', '🪚', '🗺️', '📊', '🦺', '🚨', '🔌', '🔋'];
  const colors = ['#455a64', '#1e88e5', '#e53935', '#2e7d32', '#f9a825', '#757575', '#7b1fa2', '#00838f'];

  const handleTenChange = (val: string) => {
    setTen(val);
    if (!vatTuCanSua) {
      if (val.trim()) {
        setTieuDe("V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ");
      } else {
        setTieuDe('');
      }
    }
    setError(null);
  };

  const handleSave = async () => {
    if (ten.trim().length < 2) {
      setError('Tên vật tư tối thiểu 2 ký tự');
      return;
    }

    const id = vatTuCanSua ? vatTuCanSua.id : taoIdTuTen(ten);
    if (!vatTuCanSua && danhSachHienTai.some(v => v.id === id)) {
      const existing = danhSachHienTai.find(v => v.id === id);
      setError(`Tên quá giống với vật tư đã có (${existing?.ten}). Hãy dùng tên khác hoặc thêm từ phân biệt.`);
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        id,
        ten: ten.trim(),
        icon,
        mauNen,
        tieuDeBM02: tieuDe || 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ',
        bm06_truongBoPhan: bm06TruongBoPhan.trim() || 'Trần Thành Tài',
        bm06_thuKho: bm06ThuKho.trim() || 'Áp dụng đối với hoạt động thi công xây dựng',
        bm06_nguoiDeNghi: bm06NguoiDeNghi.trim() || 'Trần Nam Anh'
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <span className="text-blue-600">{vatTuCanSua ? '⚙️' : '➕'}</span> {vatTuCanSua ? 'CẤU HÌNH CHI TIẾT VẬT TƯ' : 'THÊM VẬT TƯ MỚI'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {error && <div className="p-3 bg-red-50 border border-red-100 text-red-650 rounded-xl text-xs font-bold">{error}</div>}

          <div className="space-y-4">
            <h3 className="font-extrabold text-[11px] text-blue-700 tracking-wider uppercase border-b pb-1">Thông tin cơ bản</h3>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tên vật tư *</label>
              <input 
                autoFocus={!vatTuCanSua}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-800"
                placeholder="Ví dụ: Ván Khuôn, Điện, Nước..."
                value={ten}
                onChange={e => handleTenChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tiêu đề BM02</label>
              <textarea 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all h-16 resize-none"
                value={tieuDe}
                onChange={e => setTieuDe(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-extrabold text-[11px] text-orange-700 tracking-wider uppercase border-b pb-1">Cấu hình ký tên BM06</h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Trưởng bộ phận</label>
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all font-medium text-slate-800"
                  placeholder="Ví dụ: Trần Thành Tài"
                  value={bm06TruongBoPhan}
                  onChange={e => setBm06TruongBoPhan(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Xác nhận của Thủ kho</label>
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all font-medium text-slate-800"
                  placeholder="Ví dụ: Áp dụng đối với hoạt động thi công xây dựng"
                  value={bm06ThuKho}
                  onChange={e => setBm06ThuKho(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Người đề nghị</label>
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all font-medium text-slate-800"
                  placeholder="Ví dụ: Trần Nam Anh"
                  value={bm06NguoiDeNghi}
                  onChange={e => setBm06NguoiDeNghi(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-extrabold text-[11px] text-slate-700 tracking-wider uppercase border-b pb-1">Giao diện thẻ hiển thị</h3>
            
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Biểu tượng (Icon)</label>
              <div className="flex flex-wrap gap-2">
                {icons.map(i => (
                  <button 
                    key={i}
                    onClick={() => setIcon(i)}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-xl transition-all ${icon === i ? 'bg-blue-600 shadow-lg scale-110' : 'bg-slate-100 hover:bg-slate-200'}`}
                  >
                    {i}
                  </button>
                ))}
                <input 
                  className="w-10 h-10 bg-slate-100 border border-slate-200 rounded-xl text-center text-xl outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Emoji"
                  maxLength={2}
                  onChange={e => e.target.value && setIcon(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Màu nền card</label>
              <div className="flex flex-wrap gap-2">
                {colors.map(c => (
                  <button 
                    key={c}
                    onClick={() => setMauNen(c)}
                    className={`w-8 h-8 rounded-full transition-all border-2 ${mauNen === c ? 'border-blue-600 scale-110 shadow-md' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input 
                  type="color"
                  className="w-8 h-8 rounded-full overflow-hidden border-none cursor-pointer"
                  value={mauNen}
                  onChange={e => setMauNen(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block">Xem trước:</label>
            <div className="flex justify-center">
              <div 
                className="w-48 p-6 rounded-3xl text-center shadow-xl"
                style={{ backgroundColor: mauNen }}
              >
                <div className="text-4xl mb-3">{icon}</div>
                <div className="text-white font-bold uppercase tracking-tight text-sm">{ten || 'TÊN VẬT TƯ'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all text-sm"
          >
            Hủy
          </button>
          <button 
            disabled={isSaving || !ten.trim()}
            onClick={handleSave}
            className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {isSaving ? 'Đang lưu...' : (vatTuCanSua ? 'Lưu cấu hình' : 'Thêm vật tư')}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- CẤU HÌNH LOẠI VẬT TƯ MẶC ĐỊNH (FALLBACK) ---
const LOAI_VAT_TU_MAC_DINH: MaterialType[] = [
  { id: 'BeTong', ten: 'Bê Tông', tenVietTat: 'BeTong', icon: '🏗️', mauNen: '#1e88e5', tieuDeBM02: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ', bm06_truongBoPhan: 'Trần Thành Tài', bm06_thuKho: 'Áp dụng đối với hoạt động thi công xây dựng', bm06_nguoiDeNghi: 'Trần Nam Anh' },
  { id: 'Gach', ten: 'Gạch', tenVietTat: 'Gach', icon: '🧱', mauNen: '#e53935', tieuDeBM02: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ', bm06_truongBoPhan: 'Trần Thành Tài', bm06_thuKho: 'Áp dụng đối với hoạt động thi công xây dựng', bm06_nguoiDeNghi: 'Trần Nam Anh' },
  { id: 'XiMang', ten: 'Xi Măng', tenVietTat: 'XiMang', icon: '🏭', mauNen: '#757575', tieuDeBM02: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ', bm06_truongBoPhan: 'Trần Thành Tài', bm06_thuKho: 'Áp dụng đối với hoạt động thi công xây dựng', bm06_nguoiDeNghi: 'Trần Nam Anh' },
  { id: 'SatThep', ten: 'Sắt Thép', tenVietTat: 'SatThep', icon: '⚙️', mauNen: '#546e7a', tieuDeBM02: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ', bm06_truongBoPhan: 'Trần Thành Tài', bm06_thuKho: 'Áp dụng đối với hoạt động thi công xây dựng', bm06_nguoiDeNghi: 'Trần Nam Anh' },
  { id: 'CatDa', ten: 'Cát - Đá', tenVietTat: 'CatDa', icon: '🪨', mauNen: '#f9a825', tieuDeBM02: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ', bm06_truongBoPhan: 'Trần Thành Tài', bm06_thuKho: 'Áp dụng đối với hoạt động thi công xây dựng', bm06_nguoiDeNghi: 'Trần Nam Anh' },
  { id: 'XeCoGioi', ten: 'Xe Cơ Giới', tenVietTat: 'XeCoGioi', icon: '🚜', mauNen: '#2e7d32', tieuDeBM02: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ', bm06_truongBoPhan: 'Trần Thành Tài', bm06_thuKho: 'Áp dụng đối với hoạt động thi công xây dựng', bm06_nguoiDeNghi: 'Trần Nam Anh' }
];

const safeParse = (val: any) => {
  if (typeof val === 'string' && val.trim() !== '') {
    try {
      return JSON.parse(val);
    } catch (e) {
      console.warn("safeParse failed for:", val.substring(0, 50), e);
      return val;
    }
  }
  return val;
};

export function getHierarchy(
  selectedUnits: { projectId: string; unitId: string }[] | undefined,
  items: any[]
) {
  const list: { projectId: string; unitId: string }[] = [];
  
  if (selectedUnits && Array.isArray(selectedUnits)) {
    selectedUnits.forEach(u => {
      if (u && u.projectId && u.unitId) {
        const exists = list.some(item => 
          item.projectId.toLowerCase() === u.projectId.toLowerCase() && 
          item.unitId.toLowerCase() === u.unitId.toLowerCase()
        );
        if (!exists) {
          list.push({ projectId: u.projectId, unitId: u.unitId });
        }
      }
    });
  }

  if (items && Array.isArray(items)) {
    items.forEach(item => {
      const proj = item.projectId;
      const unit = item.unitId;
      if (proj && unit) {
        const exists = list.some(u => 
          u.projectId.toLowerCase() === proj.toLowerCase() && 
          u.unitId.toLowerCase() === unit.toLowerCase()
        );
        if (!exists) {
          list.push({ projectId: proj, unitId: unit });
        }
      }
    });
  }

  const projectsMap: Record<string, string[]> = {};
  const projectsOrder: string[] = [];

  list.forEach(u => {
    const proj = u.projectId;
    const unit = u.unitId;
    if (!projectsMap[proj]) {
      projectsMap[proj] = [];
      projectsOrder.push(proj);
    }
    if (!projectsMap[proj].includes(unit)) {
      projectsMap[proj].push(unit);
    }
  });

  return { projectsOrder, projectsMap, list };
}

export { VNFormattedInput } from './src/components/VNFormattedInput';

export function toRoman(num: number): string {
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
  return roman[num] || String(num + 1);
}

export { numberToVietnameseWords } from './src/utils/numberToWords';

const INITIAL_BM02: FormData = {
  docNumber: 'QTMH-BM02',
  title: 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ',
  date: 'ngày ... tháng ... năm 2025',
  location: 'Tp. Hồ Chí Minh',
  recipients: ['Hội Đồng Thành Viên', 'BGĐ Công ty TNHH MTV Xây Dựng IJC'],
  grounds: [
    'Căn cứ Phiếu đề nghị về việc cung cấp vật tư của Công ty ...',
    'Căn cứ Báo giá của đơn vị cung cấp'
  ],
  items: [],
  totalAmount: 0,
  taxRate: 8,
  showVat: false,
  isPostTax: true,
  proposingCompany: '',
  originalFileName: '',
  phongKeToan: 'Nguyễn Mai Thy',
  nguoiLap: 'Trần Nam Anh',
  giamDoc: 'Nguyễn Xuân Nam',
  duyetHDTV: 'Trần Nguyên Thảo',
  benGiaoTen: 'Trần Thành Tài',
  benGiaoChucVu: 'Giám đốc chi nhánh',
  benNhan1: 'Đỗ Thế Viễn',
  benNhan1ChucVu: 'Phó phòng KT',
  benNhan2: 'Lê Minh Chánh',
  benNhan2ChucVu: 'NV',
  mucDichSuDungNoiDung: '[Thay đổi theo nội dung file đính kèm]',
  mucDichSuDungDiaDiem: '[Thay đổi theo nội dung file đính kèm]',
  soTienBangChu: '',
  thoiHanThanhToan: 'Thanh toán bằng chuyển khoản ngay sau khi nhận được biên bản nghiệm thu và bàn giao vật tư thiết bị dịch vụ, hóa đơn tài chính hợp lệ và hồ sơ thanh toán.',
  maPhieu: 'XDIJC-QTMH-BM01-',
  maPhieuNguon: 'XDIJC-QTMH-BM01-'
};

export const DEFAULT_RECEIVER_LIST: BM032Representative[] = [
  { name: 'Nguyễn Xuân Nam', position: 'Giám đốc', salutation: 'Ông' },
  { name: 'Nguyễn Thị Thêm', position: 'Kế toán trưởng', salutation: 'Bà' },
  { name: 'Trần Kim Nguyện', position: 'Chỉ huy trưởng', salutation: 'Ông' },
  { name: 'Đỗ Huỳnh Linh Khoa', position: 'Thủ kho', salutation: 'Ông' },
  { name: 'Trần Nam Anh', position: 'NV Thu mua', salutation: 'Ông' }
];

const INITIAL_BM03: BBNTData = {
  title: 'BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO',
  docNumber: 'QTMH-BM03.2',
  location: 'Tp. Hồ Chí Minh',
  date: 'ngày ... tháng ... năm 2025',
  project: '',
  category: '',
  address: '',
  senderCompany: '',
  senderList: [],
  receiverCompany: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
  receiverList: DEFAULT_RECEIVER_LIST,
  startTime: '15h',
  startDate: 'ngày ... tháng ... năm 2025',
  endTime: '16h',
  endDate: 'ngày ... tháng ... năm 2025',
  locationDetail: 'Tại: Công trình',
  grounds: [
    "Hợp đồng nguyên tắc số 02BTI/HĐNT2025 ký ngày 02/01/2026 và các phụ lục kèm theo;",
    "Tờ trình phê duyệt dự trù kinh phí mua vật tư XDIJC-QTMH-BM01-25090014;",
    "Biên bản giao nhận hàng;"
  ],
  items: [],
  originalFileName: '',
  soHDNT: '02BTI/HĐNT2025',
  ngayKyHD: '02/01/2026',
  maBM02: 'XDIJC-QTMH-BM01-26030002'
};

const INITIAL_BM04: BBNTData = {
  ...INITIAL_BM03,
  formType: 'BM04',
  title: 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
  docNumber: 'QTMH-BM04'
};

// ========================================
// TEMPLATE KÝ TÊN — PHẦN CỐ ĐỊNH
// Chức danh KHÔNG BAO GIỜ thay đổi
// ========================================
const TEMPLATE_KY_TEN = {
  BM02: [
    { chucDanh: 'Phòng Kế toán', cauHinhKey: 'bm02_phongKeToan' },
    { chucDanh: 'Người lập',     cauHinhKey: 'bm02_nguoiLap'    },
    { chucDanh: 'Giám đốc',      cauHinhKey: 'bm02_giamDoc'     },
    { chucDanh: 'Duyệt HĐTV',    cauHinhKey: 'bm02_duyetHDTV'   }
  ],
  BBNT: [
    { chucDanh: 'Phòng Kế toán', cauHinhKey: 'bbnt_kyTen_phongKeToan' },
    { chucDanh: 'Người lập',     cauHinhKey: 'bbnt_kyTen_nguoiLap'    },
    { chucDanh: 'Giám đốc',      cauHinhKey: 'bbnt_kyTen_giamDoc'     },
    { chucDanh: 'Duyệt HĐTV',    cauHinhKey: 'bbnt_kyTen_duyetHDTV'   }
  ]
};

/**
 * Hàm render phần ký tên dùng chung cho cả UI và Export (PDF/Ảnh)
 * @param {string} type 'BM02' hoặc 'BBNT'
 * @param {boolean} isHtml Nếu true trả về chuỗi HTML, false trả về React Component
 * @param {any[]} dynamicKyTen Cấu hình ký tên động cho BM02
 */
const renderKyTen = (type: 'BM02' | 'BBNT', isHtml = false, dynamicKyTen?: any[], onUpdate?: (updatedList: any[]) => void) => {
  const config = window._cauHinh || {};

  if (type === 'BM02' && dynamicKyTen) {
    var itemsDynamic = [...dynamicKyTen].sort(function(a, b) { return (a.viTri || 0) - (b.viTri || 0); });
    
    if (isHtml) {
      if (itemsDynamic.length === 4) {
        var top3 = itemsDynamic.slice(0, 3);
        var bot1 = itemsDynamic.slice(3, 4);
        var html = '<div style="margin-top: 30px;">';
        html += '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; margin-bottom: 20px;">';
        top3.forEach(function(item) {
          var name = item.hoTen || '';
          html += `
            <div>
              <div style="font-size: 12px; font-weight: normal;">${item.chucDanh}</div>
              <div style="height: 40px;"></div>
              <div style="font-weight: bold; text-transform: uppercase; font-size: 14px;">${name ? String(name).toUpperCase() : ''}</div>
            </div>
          `;
        });
        html += '</div>';
        html += '<div style="display: flex; justify-content: center; text-align: center;">';
        bot1.forEach(function(item) {
          var name = item.hoTen || '';
          html += `
            <div style="max-width: 260px; width: 100%;">
              <div style="font-size: 12px; font-weight: normal;">${item.chucDanh}</div>
              <div style="height: 40px;"></div>
              <div style="font-weight: bold; text-transform: uppercase; font-size: 14px;">${name ? String(name).toUpperCase() : ''}</div>
            </div>
          `;
        });
        html += '</div></div>';
        return html;
      }

      var html = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; margin-top: 30px;">';
      itemsDynamic.forEach(function(item) {
        var name = item.hoTen || '';
        html += `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: normal;">${item.chucDanh}</div>
            <div style="height: 40px;"></div>
            <div style="font-weight: bold; text-transform: uppercase; font-size: 14px;">${name ? String(name).toUpperCase() : ''}</div>
          </div>
        `;
      });
      html += '</div>';
      return html;
    }

    return (
      <BM02SignatureSection 
        kyTenList={itemsDynamic}
        onChange={(updatedList) => {
          if (onUpdate) onUpdate(updatedList);
        }}
      />
    );
  }

  const items = TEMPLATE_KY_TEN[type];

  if (isHtml) {
    // Render cho PDF/Ảnh (HTML string)
    let html = '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; text-align: center; margin-top: 30px;">';
    items.forEach((item) => {
      const name = config[item.cauHinhKey as keyof CauHinh] || '';
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: normal;">${item.chucDanh}</div>
          <div style="height: 60px;"></div>
          <div style="font-weight: bold; text-transform: uppercase; font-size: 14px;">${String(name).toUpperCase()}</div>
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  // Render cho UI (React Component)
  return (
    <div className="space-y-8 mt-8">
      <div className="grid grid-cols-2 gap-4 text-center">
        {items.slice(0, 2).map((item, idx) => (
          <div key={idx} className="flex flex-col">
            <span className="text-xs font-normal">{item.chucDanh}</span>
            <div className="h-16"></div>
            <span className="font-bold uppercase text-lg">
              {String(config[item.cauHinhKey as keyof CauHinh] || '').toUpperCase()}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 text-center">
        {items.slice(2, 4).map((item, idx) => (
          <div key={idx} className="flex flex-col">
            <span className="text-xs font-normal">{item.chucDanh}</span>
            <div className="h-16"></div>
            <span className="font-bold uppercase text-lg">
              {String(config[item.cauHinhKey as keyof CauHinh] || '').toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- UTILITY FUNCTIONS FOR BUG 1 ---
function docTenCot(row: any) {
  const keys = Object.keys(row);
  
  function layGiaTri(...tenCoTs: string[]) {
    for (const ten of tenCoTs) {
      if (row[ten] !== undefined && row[ten] !== '') return row[ten];
      const foundKey = keys.find(k => k.toLowerCase() === ten.toLowerCase());
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== '') return row[foundKey];
    }
    return null;
  }

  return {
    tieuDe: layGiaTri('tieuDe', 'Tiêu đề', 'tieu_de', 'Tên hồ sơ', 'ten_ho_so'),
    ngayTao: layGiaTri('updatedAt', 'ngayTao', 'Ngày tạo', 'ngay_tao', 'thoiGian', 'Thời gian', 'createdAt'),
    loaiTaiLieu: layGiaTri('loaiTaiLieu', 'Loại tài liệu', 'loai_tai_lieu', 'type', 'loaiTaiLieu'),
    nguoiTao: layGiaTri('nguoiTao', 'Người tạo', 'nguoi_tao', 'nguoiLap', 'Người lập')
  };
}

function hienThiNgay(val: any) {
  if (!val) return "N/A";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val; 
  return d.toLocaleDateString('vi-VN');
}

function getNgayDeNghi(record: any) {
  let val = record.orderDate || record.ngayLap || record.date || "";
  
  if (!val) return "N/A";
  
  const str = String(val).trim();
  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parts = str.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  // Match Vietnamese formatted date strings like "ngày 13 tháng 05 năm 2026" or "ngày 13 tháng 5 năm 2026"
  const match = str.match(/ngày\s+(\d+|[.\d]+)\s+tháng\s+(\d+|[.\d]+)\s+năm\s+(\d+|[.\d]+)/i);
  if (match) {
    const day = match[1].trim();
    const month = match[2].trim();
    const year = match[3].trim();
    if (day.includes('.') || month.includes('.') || year.includes('.')) {
      return "N/A";
    }
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  
  const formatted = chuanHoaNgay(str);
  if (formatted.includes("ngày ...") || formatted.includes("ngày...") || formatted.includes("...")) {
    return "N/A";
  }
  return formatted;
}

export function calculateNextRunAt(scheduleType: 'daily' | 'weekly' | 'monthly', backupTime: string): number {
  const [hours, minutes] = (backupTime || '12:00').split(':').map(Number);
  const now = new Date();
  let nextDate = new Date();
  nextDate.setHours(hours || 12, minutes || 0, 0, 0);

  if (nextDate.getTime() <= now.getTime()) {
    if (scheduleType === 'daily') {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (scheduleType === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (scheduleType === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
  }
  return nextDate.getTime();
}

export type TabType = 'BM02' | 'BBNT' | 'BM04' | 'NhatKyAudit' | 'QuanLyUser' | 'BaoCao';

import Dashboard from './src/components/Dashboard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('currentUser');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('currentUser');
    }
  }, [currentUser]);

  const [activeTab, setActiveTab] = useState<TabType>('BM02');

  const handleLogout = async () => {
    if (currentUser) {
      try {
        await AuditLogService.log(
          currentUser.username,
          currentUser.role,
          'LOGOUT',
          'Cấu hình',
          `Người dùng @${currentUser.username} (Vai trò: ${currentUser.role.toUpperCase()}) đăng xuất hệ thống.`
        );
      } catch (err) {
        console.warn('Ghi log logout thất bại:', err);
      }
    }
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
  };
  const [collapsedBM02Projects, setCollapsedBM02Projects] = useState<Record<string, boolean>>({});
  const [collapsedBM02Units, setCollapsedBM02Units] = useState<Record<string, boolean>>({});
  const [collapsedBBNTProjects, setCollapsedBBNTProjects] = useState<Record<string, boolean>>({});
  const [collapsedBBNTUnits, setCollapsedBBNTUnits] = useState<Record<string, boolean>>({});
  const [currentMaterialType, setCurrentMaterialType] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bm02Data, setBm02Data] = useState<FormData>(INITIAL_BM02);
  const [bbntData, setBbntData] = useState<BBNTData>(INITIAL_BM03);
  const [bm04Data, setBm04Data] = useState<BBNTData>(INITIAL_BM04);
  const [bm02Synced, setBm02Synced] = useState<boolean>(false);
  const [bbntSynced, setBbntSynced] = useState<boolean>(false);
  const [bm04Synced, setBm04Synced] = useState<boolean>(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // BM02 Unit Price Save Modal state
  const [showSavePriceConfirmModal, setShowSavePriceConfirmModal] = useState(false);
  const [savePriceConfirmList, setSavePriceConfirmList] = useState<BM02ItemPriceChange[]>([]);
  const [savePriceOption, setSavePriceOption] = useState<'MASTER_CATALOG' | 'CURRENT_ONLY'>('MASTER_CATALOG');
  const [pendingSaveAction, setPendingSaveAction] = useState<(() => Promise<void>) | null>(null);

  // BM02 Mã phiếu state & validation
  const [showDuplicateCodeModal, setShowDuplicateCodeModal] = useState(false);

  // CẤU HÌNH THƯƠNG HIỆU STATE
  const [brandConfig, setBrandConfig] = useState<{
    whiteText: string;
    colorText: string;
    logoBase64: string;
  }>({
    whiteText: 'BTI',
    colorText: 'Smart',
    logoBase64: ''
  });

  const taiBrandConfig = async () => {
    try {
      const data = await ConfigService.getCauHinh('brandConfig');
      if (data) {
        setBrandConfig({
          whiteText: data.whiteText || 'BTI',
          colorText: data.colorText || 'Smart',
          logoBase64: data.logoBase64 || ''
        });
        (window as any)._brandConfig = data;
      }
    } catch (e) {
      console.warn('Lỗi khi tải cấu hình thương hiệu:', e);
    }
  };

  useEffect(() => {
    const handleBrandUpdate = (e: any) => {
      if (e.detail) {
        setBrandConfig(e.detail);
      }
    };
    window.addEventListener('brandConfigUpdated', handleBrandUpdate);
    return () => {
      window.removeEventListener('brandConfigUpdated', handleBrandUpdate);
    };
  }, []);
  const [hasData, setHasData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{show: boolean, id: string | null, deleteFn?: () => void}>({show: false, id: null});

  // GIÁ VẬT TƯ STATE
  const [materialPrices, setMaterialPrices] = useState<MaterialPrice[]>([]);
  const [priceDateOptions, setPriceDateOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedPriceDate, setSelectedPriceDate] = useState<string>("giaGoc");
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MaterialPrice[]>([]);

  // GOOGLE SHEETS STATE
  const [savedRecords, setSavedRecords] = useState<any[]>([]);
  const [reportRefreshTrigger, setReportRefreshTrigger] = useState<number>(0);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFormFilter, setHistoryFormFilter] = useState("all");
  const [historyMaterialFilter, setHistoryMaterialFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bti_history_material_filter');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleHistoryMaterialFilterChange = (selectedIds: string[]) => {
    setHistoryMaterialFilter(selectedIds);
    try {
      localStorage.setItem('bti_history_material_filter', JSON.stringify(selectedIds));
    } catch (e) {
      console.warn("Lỗi lưu bti_history_material_filter:", e);
    }
  };

  const [historyDateFilter, setHistoryDateFilter] = useState("thisWeek");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [showCauHinhModal, setShowCauHinhModal] = useState(false);
  const [showMaterialContentConfig, setShowMaterialContentConfig] = useState(false);
  const [configTrigger, setConfigTrigger] = useState(0);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);

  const isDuplicateMaPhieu = React.useMemo(() => {
    const code = (bm02Data.maPhieu || '').trim().toLowerCase();
    if (!code || code === 'xdijc-qtmh-bm01-' || isTemplateCodeOnly(code)) return false;
    const stdCode = formatStandardMaPhieu(code).toLowerCase();
    return (savedRecords || []).some(r => {
      const rId = r.id || r.snapshotId;
      if (currentRecordId && (rId === currentRecordId || rId.replace('BM02-', '') === currentRecordId.replace('BM02-', ''))) {
        return false;
      }
      const existingCode = (r.maPhieu || r.bm02?.maPhieu || r.bm032?.maPhieu || r.maPhieuNguon || '').trim().toLowerCase();
      if (!existingCode || existingCode === 'xdijc-qtmh-bm01-' || isTemplateCodeOnly(existingCode)) return false;
      const stdExisting = formatStandardMaPhieu(existingCode).toLowerCase();
      return (stdCode && stdExisting && stdCode === stdExisting) || existingCode === code;
    });
  }, [bm02Data.maPhieu, savedRecords, currentRecordId]);
  const [currentBM06Record, setCurrentBM06Record] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showPriceConfirmModal, setShowPriceConfirmModal] = useState(false);
  const [priceConfirmData, setPriceConfirmData] = useState<{
    itemId: string;
    typeId?: string;
    itemName: string;
    oldPrice: number;
    newPrice: number;
    rowId: string;
    projectId: string;
    unitId: string;
  } | null>(null);
  const [isApiKeySelected, setIsApiKeySelected] = useState<boolean>(true);

  const [kyTenBM02, setKyTenBM02] = useState<any[]>(KY_TEN_MAC_DINH);
  
  // DANH SÁCH VẬT TƯ ĐỘNG
  const [danhSachVatTu, setDanhSachVatTu] = useState<MaterialType[]>(LOAI_VAT_TU_MAC_DINH);
  const [isManageMode, setIsManageMode] = useState(false);
  const [showThemVatTuModal, setShowThemVatTuModal] = useState(false);
  const [vatTuCanSua, setVatTuCanSua] = useState<MaterialType | undefined>(undefined);
  const [showFirebaseModal, setShowFirebaseModal] = useState(false);
  const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(false);

  // OCR AI PREVIEW STATE
  const [ocrPreviewData, setOcrPreviewData] = useState<OcrPreviewData | null>(null);
  const [isOcrPreviewOpen, setIsOcrPreviewOpen] = useState<boolean>(false);

  const [savePromptModal, setSavePromptModal] = useState<{
    isOpen: boolean;
    onConfirmSave: () => void | Promise<void>;
    onConfirmDiscard: () => void | Promise<void>;
  }>({
    isOpen: false,
    onConfirmSave: () => {},
    onConfirmDiscard: () => {},
  });

  const handleInterceptAction = (action: () => void | Promise<void>) => {
    if ((window as any)._isBM06Dirty) {
      setSavePromptModal({
        isOpen: true,
        onConfirmSave: async () => {
          if ((window as any)._triggerBM06Save) {
            try {
              await (window as any)._triggerBM06Save();
              (window as any)._isBM06Dirty = false;
            } catch (err) {
              console.error("Lỗi khi tự động lưu dữ liệu:", err);
              setToast({ message: "Gặp lỗi khi lưu dữ liệu tự động", type: 'error' });
              return;
            }
          }
          await action();
        },
        onConfirmDiscard: async () => {
          (window as any)._isBM06Dirty = false;
          await action();
        }
      });
    } else {
      action();
    }
  };

  useEffect(() => {
    if (currentUser && !isAdmin(currentUser)) {
      if (showMaterialContentConfig || showFirebaseModal || activeTab === 'QuanLyUser' || activeTab === 'NhatKyAudit') {
        setShowMaterialContentConfig(false);
        setShowFirebaseModal(false);
        if (activeTab === 'QuanLyUser' || activeTab === 'NhatKyAudit') {
          setActiveTab('BM02');
        }
        setCurrentMaterialType(null);
        setToast({ message: "Bạn không có quyền truy cập chức năng này.", type: "error" });
      }
    }
  }, [currentUser, showMaterialContentConfig, showFirebaseModal, activeTab]);

  const resetToMain = () => {
    setCurrentMaterialType(null);
    setCurrentRecordId(null);
    setCurrentBM06Record(null);
    setIsManageMode(false);
    setShowHistory(false);
    setShowCauHinhModal(false);
    setShowThemVatTuModal(false);
    setShowFirebaseModal(false);
  };

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    
    // Reactively sync BM02 and BM03.2 in real-time if there is active BM06 data in window
    if (tab === 'BM02') {
      const bm06Data = (window as any)._currentBM06Data;
      if (bm06Data) {
        console.log("Reactively syncing BM02 state from current BM06 session data:", bm06Data);
        
        const isGroupedDisplay = bm06Data.displayMode === 'GROUPED_EQUAL' || bm06Data.isGroupedDisplay;
        let rawRows = bm06Data.selectedItems || bm06Data.rows || [];
        let activeRows = rawRows.filter((item: any) => {
          const qty = item.orderQty !== undefined ? item.orderQty : (item.quantity || 0);
          return qty > 0;
        });

        if (isGroupedDisplay) {
          activeRows = groupItemsForExport(activeRows);
        } else {
          const normalRows = activeRows.filter((r: any) => !r.isSharedCost);
          const sharedRows = activeRows.filter((r: any) => r.isSharedCost);
          const groupedSharedRows = groupItemsForExport(sharedRows);
          activeRows = [...normalRows, ...groupedSharedRows];
        }

        // Sync to BM02 (with preservation of already typed fields):
        setBm02Data(prev => {
          if (prev?.sourceType === 'PDF' && prev?.items && prev.items.length > 0) {
            return prev;
          }
          const mappedItems = activeRows.map((item: any, idx: number) => {
            const qty = item.orderQty !== undefined ? item.orderQty : (item.quantity || 0);
            const existingItem = prev?.items?.find((x: any) => x.name === item.name && x.unitId === item.unitId && x.projectId === item.projectId) || prev?.items?.[idx];
            const price = existingItem?.unitPrice !== undefined ? Number(existingItem.unitPrice) : (item.unitPrice || 0);
            const noteVal = existingItem?.note !== undefined ? existingItem.note : (item.notes || item.specification || '');
            const duToanVal = item.estimatedQty !== undefined ? Number(item.estimatedQty) : 0;
            const luyKeVal = item.cumulativeQtyOld !== undefined ? Number(item.cumulativeQtyOld) : 0;

            const finalItemId = item.id || item.estimateItemId || 'itm';
            const uniqueItemId = `BM02-itm-${finalItemId}-${item.unitId || ''}-${idx}`;

            return {
              id: uniqueItemId,
              stt: idx + 1,
              name: item.name,
              unit: item.unit,
              quantity: qty,
              unitPrice: price,
              total: qty * price,
              note: noteVal,
              duToanQty: duToanVal,
              luyKeQty: luyKeVal,
              projectId: item.projectId || existingItem?.projectId || '',
              unitId: item.unitId || existingItem?.unitId || '',
              appliedUnits: item.appliedUnits || existingItem?.appliedUnits || [],
              isSharedCost: item.isSharedCost || false,
              isGroupedEstimate: item.isGroupedEstimate || false
            };
          });

          const totalAmount = mappedItems.reduce((acc: number, it: any) => acc + (it.total || 0), 0);

          return {
            ...prev,
            date: prev.date || bm06Data.orderDate || '',
            proposingCompany: prev.proposingCompany || bm06Data.company || '',
            nguoiLap: prev.nguoiLap || bm06Data.proposer || '',
            mucDichSuDungNoiDung: prev.mucDichSuDungNoiDung || bm06Data.purpose || '',
            mucDichSuDungDiaDiem: prev.mucDichSuDungDiaDiem || bm06Data.location || '',
            items: mappedItems,
            totalAmount,
            selectedUnits: bm06Data.selectedUnits || prev.selectedUnits || [],
            sourceType: 'BM06',
            isGroupedDisplay: isGroupedDisplay,
            displayMode: bm06Data.displayMode || (isGroupedDisplay ? 'GROUPED_EQUAL' : 'DETAIL_BY_UNIT')
          };
        });
      }
    } else if (tab === 'BBNT') {
      // Sync BBNT strictly from BM02 Data
      setBbntData(prev => {
        const matchedIndices = new Set<number>();
        const mappedBBNTItems = (bm02Data.items || []).map((item: any, idx: number) => {
          const qty = Number(item.quantity) || 0;
          
          let existingItem: any = null;
          const bm02IdStr = String(item.id || '');
          // First, exact match by ID if present
          if (bm02IdStr) {
             const foundIdx = prev?.items?.findIndex((x: any, bIdx: number) => {
               if (matchedIndices.has(bIdx)) return false;
               const xIdStr = String(x.id || '');
               return xIdStr === bm02IdStr || xIdStr.includes(bm02IdStr) || bm02IdStr.includes(xIdStr);
             });
             if (foundIdx !== undefined && foundIdx !== -1) {
                 existingItem = prev?.items?.[foundIdx];
                 matchedIndices.add(foundIdx);
             }
          }
          // Second, index fallback
          if (!existingItem && prev?.items?.[idx] && !matchedIndices.has(idx)) {
             existingItem = prev.items[idx];
             matchedIndices.add(idx);
          }
          // Third, name match fallback
          if (!existingItem) {
             const cleanItemName = (item.name || '').trim().toLowerCase();
             const foundIdx = prev?.items?.findIndex((x: any, bIdx: number) => {
               if (matchedIndices.has(bIdx)) return false;
               const cleanDesc = stripAppliedUnitsSuffix(x.description || x.name || '').trim().toLowerCase();
               return cleanItemName && cleanDesc && (cleanDesc === cleanItemName || cleanDesc.startsWith(cleanItemName) || cleanItemName.startsWith(cleanDesc));
             });
             if (foundIdx !== undefined && foundIdx !== -1) {
                 existingItem = prev?.items?.[foundIdx];
                 matchedIndices.add(foundIdx);
             }
          }

          const isCustom = existingItem?.isCustomAcceptedQty === true &&
                           existingItem?.acceptedQty !== undefined && 
                           existingItem?.acceptedQty !== null && 
                           String(existingItem.acceptedQty).trim() !== '' &&
                           Number(existingItem.acceptedQty) !== Number(existingItem.requestedQty);
          const accepted = isCustom ? Number(existingItem.acceptedQty) : qty;
          const finalUnitPrice = existingItem?.unitPrice !== undefined ? Number(existingItem.unitPrice) : (Number(item.unitPrice) || 0);
          const finalTotal = accepted * finalUnitPrice;
          // Ghi chú của BM03.2: đồng bộ tức thời theo BM02
          const noteVal = item.note !== undefined ? item.note : (existingItem?.note || '');

          const finalItemId = item.id || 'itm';
          const uniqueItemId = `BM03.2-itm-${finalItemId}-${item.unitId || ''}-${idx}`;

          return {
            id: uniqueItemId,
            stt: idx + 1,
            description: item.name,
            unit: item.unit,
            requestedQty: qty,
            acceptedQty: accepted,
            isCustomAcceptedQty: isCustom,
            note: noteVal,
            projectId: item.projectId || existingItem?.projectId || '',
            unitId: item.unitId || existingItem?.unitId || '',
            isSharedCost: item.isSharedCost || false,
            isGroupedEstimate: item.isGroupedEstimate || false,
            unitPrice: finalUnitPrice,
            total: finalTotal,
          };
        });

        // Tự động lấy: Công trình, Hạng mục từ BM02
        const projectStr = bm02Data.project || (bm02Data.selectedUnits || []).map(u => u.projectId).join(', ') || '';
        const categoryStr = bm02Data.mucDichSuDungNoiDung || (bm02Data.selectedUnits || []).map(u => u.unitId).join(', ') || '';

        const targetBBNTDate = (prev.date && !prev.date.includes('...') && !prev.date.includes('2025'))
          ? prev.date
          : (addOneDayToString(bm02Data.date) || bm02Data.date || '');

        const fixedSenderComp = getFixedSenderCompany((window as any)._currentMaterialConfig, (window as any)._cauHinh);
        const fixedSenderReps = getFixedSenderRepresentatives((window as any)._currentMaterialConfig, (window as any)._cauHinh);

        const syncedSender = !currentRecordId
          ? fixedSenderComp
          : (isValidSenderCompany(prev.senderCompany)
            ? prev.senderCompany
            : (isValidSenderCompany(bm04Data.senderCompany) ? bm04Data.senderCompany : fixedSenderComp));

        const syncedSenderList = !currentRecordId
          ? (fixedSenderReps.length > 0 ? fixedSenderReps : prev.senderList)
          : (hasValidRepresentatives(prev.senderList)
            ? prev.senderList
            : (hasValidRepresentatives(bm04Data.senderList) ? bm04Data.senderList : fixedSenderReps));

        return {
          ...prev,
          senderCompany: syncedSender,
          bbnt_benA_congTy: syncedSender,
          bbnt_nhaCungCap: syncedSender,
          senderList: syncedSenderList,
          date: targetBBNTDate,
          startDate: (prev.startDate && !prev.startDate.includes('...') && !prev.startDate.includes('2025')) ? prev.startDate : targetBBNTDate,
          endDate: (prev.endDate && !prev.endDate.includes('...') && !prev.endDate.includes('2025')) ? prev.endDate : targetBBNTDate,
          originalFileName: prev.originalFileName || bm02Data.originalFileName || (typeof window !== 'undefined' && ((window as any)._currentOriginalFileName || (window as any)._currentBM02FileName)) || '',
          project: projectStr || prev.project || bm04Data.project || '',
          category: categoryStr || prev.category || bm04Data.category || '',
          address: prev.address || bm04Data.address || bm02Data.locationDetail || '',
          locationDetail: prev.locationDetail || bm04Data.locationDetail || bm02Data.locationDetail || '',
          receiverCompany: prev.receiverCompany || bm04Data.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
          receiverList: (prev.receiverList && prev.receiverList.length > 0) ? prev.receiverList : (bm04Data.receiverList || []),
          grounds: (prev.grounds && prev.grounds.length > 0) ? prev.grounds : (bm04Data.grounds || []),
          startTime: prev.startTime || bm04Data.startTime || '15h',
          endTime: prev.endTime || bm04Data.endTime || '16h',
          items: mappedBBNTItems,
          selectedUnits: bm02Data.selectedUnits || prev.selectedUnits || [],
          isGroupedDisplay: bm02Data.isGroupedDisplay,
          displayMode: bm02Data.displayMode || (bm02Data.isGroupedDisplay ? 'GROUPED_EQUAL' : 'DETAIL_BY_UNIT')
        };
      });
    } else if (tab === 'BM04') {
      // Sync BM04 strictly from BM02 Data & BBNT
      setBm04Data(prev => {
        const matchedIndices = new Set<number>();
        const mappedBM04Items = (bm02Data.items || []).map((item: any, idx: number) => {
          const qty = Number(item.quantity) || 0;
          
          let existingItem: any = null;
          const bm02IdStr = String(item.id || '');
          if (bm02IdStr) {
             const foundIdx = prev?.items?.findIndex((x: any, bIdx: number) => {
               if (matchedIndices.has(bIdx)) return false;
               const xIdStr = String(x.id || '');
               return xIdStr === bm02IdStr || xIdStr.includes(bm02IdStr) || bm02IdStr.includes(xIdStr);
             });
             if (foundIdx !== undefined && foundIdx !== -1) {
                 existingItem = prev?.items?.[foundIdx];
                 matchedIndices.add(foundIdx);
             }
          }
          if (!existingItem && prev?.items?.[idx] && !matchedIndices.has(idx)) {
             existingItem = prev.items[idx];
             matchedIndices.add(idx);
          }
          if (!existingItem) {
             const cleanItemName = (item.name || '').trim().toLowerCase();
             const foundIdx = prev?.items?.findIndex((x: any, bIdx: number) => {
               if (matchedIndices.has(bIdx)) return false;
               const cleanDesc = stripAppliedUnitsSuffix(x.description || x.name || '').trim().toLowerCase();
               return cleanItemName && cleanDesc && (cleanDesc === cleanItemName || cleanDesc.startsWith(cleanItemName) || cleanItemName.startsWith(cleanDesc));
             });
             if (foundIdx !== undefined && foundIdx !== -1) {
                 existingItem = prev?.items?.[foundIdx];
                 matchedIndices.add(foundIdx);
             }
          }

          const isCustom = existingItem?.isCustomAcceptedQty === true &&
                           existingItem?.acceptedQty !== undefined && 
                           existingItem?.acceptedQty !== null && 
                           String(existingItem.acceptedQty).trim() !== '' &&
                           Number(existingItem.acceptedQty) !== Number(existingItem.requestedQty);
          const accepted = isCustom ? Number(existingItem.acceptedQty) : qty;
          const finalUnitPrice = existingItem?.unitPrice !== undefined ? Number(existingItem.unitPrice) : (Number(item.unitPrice) || 0);
          const finalTotal = accepted * finalUnitPrice;
          // Ghi chú của BM04: đồng bộ tức thời theo BM02
          const noteVal = item.note !== undefined ? item.note : (existingItem?.note || '');

          const finalItemId = item.id || 'itm';
          const uniqueItemId = `BM04-itm-${finalItemId}-${item.unitId || ''}-${idx}`;

          return {
            id: uniqueItemId,
            stt: idx + 1,
            description: item.name,
            unit: item.unit,
            requestedQty: qty,
            acceptedQty: accepted,
            isCustomAcceptedQty: isCustom,
            note: noteVal,
            projectId: item.projectId || existingItem?.projectId || '',
            unitId: item.unitId || existingItem?.unitId || '',
            isSharedCost: item.isSharedCost || false,
            isGroupedEstimate: item.isGroupedEstimate || false,
            unitPrice: finalUnitPrice,
            total: finalTotal,
          };
        });

        const projectStr = bm02Data.project || (bm02Data.selectedUnits || []).map(u => u.projectId).join(', ') || '';
        const categoryStr = bm02Data.mucDichSuDungNoiDung || (bm02Data.selectedUnits || []).map(u => u.unitId).join(', ') || '';
        const targetBM04Date = (prev.date && !prev.date.includes('...') && !prev.date.includes('2025'))
          ? prev.date
          : (bbntData.date && !bbntData.date.includes('...') && !bbntData.date.includes('2025')
              ? bbntData.date
              : (addOneDayToString(bm02Data.date) || bm02Data.date || ''));
        const targetFileName = prev.originalFileName || bm02Data.originalFileName || bbntData.originalFileName || (typeof window !== 'undefined' && ((window as any)._currentOriginalFileName || (window as any)._currentBM02FileName)) || '';

        const fixedSenderComp = getFixedSenderCompany((window as any)._currentMaterialConfig, (window as any)._cauHinh);
        const fixedSenderReps = getFixedSenderRepresentatives((window as any)._currentMaterialConfig, (window as any)._cauHinh);

        const syncedSender = !currentRecordId
          ? fixedSenderComp
          : (isValidSenderCompany(bbntData.senderCompany)
            ? bbntData.senderCompany
            : (isValidSenderCompany(prev.senderCompany) ? prev.senderCompany : fixedSenderComp));

        const syncedSenderList = !currentRecordId
          ? (fixedSenderReps.length > 0 ? fixedSenderReps : bbntData.senderList)
          : (hasValidRepresentatives(bbntData.senderList)
            ? bbntData.senderList
            : (hasValidRepresentatives(prev.senderList) ? prev.senderList : fixedSenderReps));

        return {
          ...prev,
          formType: 'BM04',
          title: prev.title || (window as any)._currentMaterialConfig?.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
          docNumber: prev.docNumber || 'QTMH-BM04',
          date: targetBM04Date,
          startDate: (prev.startDate && !prev.startDate.includes('...') && !prev.startDate.includes('2025')) ? prev.startDate : targetBM04Date,
          endDate: (prev.endDate && !prev.endDate.includes('...') && !prev.endDate.includes('2025')) ? prev.endDate : targetBM04Date,
          originalFileName: targetFileName,
          project: prev.project || projectStr || bbntData.project || '',
          category: prev.category || categoryStr || bbntData.category || '',
          address: prev.address || bm02Data.locationDetail || bbntData.address || '',
          locationDetail: prev.locationDetail || bm02Data.locationDetail || bbntData.locationDetail || '',
          senderCompany: syncedSender,
          bbnt_benA_congTy: syncedSender,
          bbnt_nhaCungCap: syncedSender,
          senderList: syncedSenderList,
          receiverCompany: bbntData.receiverCompany || prev.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
          receiverList: (bbntData.receiverList && bbntData.receiverList.length > 0) ? bbntData.receiverList : (prev.receiverList || []),
          grounds: (bbntData.grounds && bbntData.grounds.length > 0) ? bbntData.grounds : (prev.grounds || []),
          startTime: bbntData.startTime || prev.startTime || '15h',
          endTime: bbntData.endTime || prev.endTime || '16h',
          items: mappedBM04Items,
          selectedUnits: bm02Data.selectedUnits || prev.selectedUnits || [],
          isGroupedDisplay: bm02Data.isGroupedDisplay,
          displayMode: bm02Data.displayMode || (bm02Data.isGroupedDisplay ? 'GROUPED_EQUAL' : 'DETAIL_BY_UNIT')
        };
      });
    }
  };

  // ================================================
  // LOGIC FIREBASE — PHẦN THÊM MỚI
  // ================================================
  useEffect(() => {
    function capNhatBadgeFirebase(status: string, msg?: string) {
      window._firebaseStatus = status;
      var badge = document.getElementById('badgeFirebase');
      if (!badge) return;
      var map = {
        offline    : { dot: '🔴', text: 'Offline',         bg: '#fce8e6', color: '#c5221f' },
        connecting : { dot: '🟡', text: 'Đang kết nối...', bg: '#fef9e7', color: '#b06000' },
        online     : { dot: '🟢', text: 'Online (Firestore & RTDB)', bg: '#e6f4ea', color: '#137333' },
        quota      : { dot: '🟠', text: 'RTDB Only (Quota Exceeded)', bg: '#feefe3', color: '#b06000' },
        error      : { dot: '🔴', text: msg || 'Lỗi kết nối', bg: '#fce8e6', color: '#c5221f' }
      };
      var s = map[status] || map['offline'];
      badge.innerHTML = s.dot + ' ' + s.text;
      badge.style.background = s.bg;
      badge.style.color      = s.color;
    }
    window.capNhatBadgeFirebase = capNhatBadgeFirebase;

    let intervalId: any = null;

    const checkAndRunAutoBackup = async () => {
      if (!navigator.onLine) {
        console.log("App is offline, skipping scheduled backup check.");
        return;
      }
      if ((window as any)._isFirestoreQuotaExceeded) {
        console.log("Firestore quota limit hit, skipping scheduled backup check.");
        return;
      }
      try {
        const schedConfig = await fetchBackupScheduleConfig();
        if (!schedConfig || !schedConfig.enabled) {
          return;
        }

        const now = Date.now();
        const nextRunAtNum = Number(schedConfig.nextRunAt) || (now + 24 * 60 * 60 * 1000);
        const shouldRun = !schedConfig.nextRunAt || now >= nextRunAtNum;
        
        if (shouldRun) {
          console.log("Triggering scheduled automatic backup...");
          
          const nextRun = calculateNextRunAt(schedConfig.scheduleType, schedConfig.backupTime);
          
          // Save next run time FIRST to avoid infinite retries if backup encounters errors
          await saveBackupScheduleConfig({
            ...schedConfig,
            lastRunAt: now,
            nextRunAt: nextRun,
            status: 'active'
          }).catch(e => console.warn("Failed to update schedule nextRunAt:", e));

          await backupDatabase('AUTO_BACKUP_SYSTEM', 'auto', 'System', schedConfig.scheduleType);
          console.log(`Scheduled automatic backup completed. Next run: ${new Date(nextRun).toLocaleString('vi-VN')}`);
        }
      } catch (err) {
        console.warn("Scheduled backup check warning:", err);
      }
    };

    const loadConfig = async () => {
      try {
        var saved = localStorage.getItem('firebase_config');
        var status = localStorage.getItem('firebase_status');
        let configToUse = null;

        if (saved && status === 'connected') {
          configToUse = safeParse(saved);
        } else {
          capNhatBadgeFirebase('connecting', 'Đang tải cấu hình...');
          const systemConfig = await fetchSystemFirebaseConfig();
          if (systemConfig && systemConfig.apiKey) {
            configToUse = systemConfig;
          } else if (bootstrapFirebaseConfig && bootstrapFirebaseConfig.apiKey) {
            configToUse = bootstrapFirebaseConfig;
          }
          if (configToUse) {
            localStorage.setItem('firebase_config', JSON.stringify(configToUse));
            localStorage.setItem('firebase_status', 'connected');
          }
        }

        if (configToUse) {
          window._firebaseConfigDaLuu = configToUse;
          FirebaseInitService.init(configToUse);
          if ((window as any)._isFirestoreQuotaExceeded) {
            capNhatBadgeFirebase('quota');
          } else {
            capNhatBadgeFirebase('online');
          }
          setIsFirebaseInitialized(true);
          taiDanhSachVatTu();
          
          // Check backup schedule after 10s and then periodically every 15 minutes
          setTimeout(checkAndRunAutoBackup, 10000);
          intervalId = setInterval(checkAndRunAutoBackup, 900000);
        } else {
          capNhatBadgeFirebase('offline');
        }
      } catch(e) {
        capNhatBadgeFirebase('offline');
      }
    };
    loadConfig();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // ĐẢM BẢO TẤT CẢ CÁC VẬT TƯ ĐỀU CÓ CẤU HÌNH TRÊN FIREBASE
  const damBaoCauHinhVatTuFirebase = async (list: MaterialType[]) => {
    try {
      if ((window as any)._isFirestoreQuotaExceeded) return;
      await MaterialTypeService.damBaoCauHinhVatTuFirebase(list);
    } catch (err) {
      console.warn("Lỗi khi đồng bộ cấu hình vật tư lên Firestore:", err);
    }
  };

  // HÀM TẢI DANH SÁCH VẬT TƯ TỪ FIREBASE
  const taiDanhSachVatTu = async () => {
    try {
      setIsProcessing(true);
      await taiBrandConfig();
      // Giả sử ta lưu danh sách vật tư tại 'materialTypes'
      const data = await MaterialTypeService.getMaterialTypes();
      let currentList: MaterialType[] = [];

      if (data && data.length > 0) {
        const sorted = [...data].sort((a, b) => {
          const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
          const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;
          return orderA - orderB;
        });
        window._danhSachVatTu = sorted;
        setDanhSachVatTu(sorted);
        currentList = sorted;
      } else {
        const sortedDefault = LOAI_VAT_TU_MAC_DINH.map((item, idx) => ({ ...item, sortOrder: idx }));
        window._danhSachVatTu = sortedDefault;
        setDanhSachVatTu(sortedDefault);
        currentList = sortedDefault;
        // Lưu mặc định lần đầu nếu chưa có
        await MaterialTypeService.saveMaterialTypes(sortedDefault);
      }

      // Tự động đồng bộ và lưu cấu hình cố định của tất cả vật tư lên Firestore
      if (currentList.length > 0) {
        damBaoCauHinhVatTuFirebase(currentList);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách vật tư:', err);
      window._danhSachVatTu = LOAI_VAT_TU_MAC_DINH;
      setDanhSachVatTu(LOAI_VAT_TU_MAC_DINH);
    } finally {
      setIsProcessing(false);
    }
  };

  const sapXepVatTu = async (newList: MaterialType[]) => {
    try {
      const normalizedList = newList.map((item, idx) => ({
        ...item,
        sortOrder: idx
      }));
      // Cập nhật ngay danh sách để dropdown CHỌN VẬT TƯ và giao diện cập nhật tức thì không cần tải lại trang
      window._danhSachVatTu = normalizedList;
      setDanhSachVatTu(normalizedList);

      // Lưu thứ tự bền vững vào Firebase Realtime Database
      const success = await MaterialTypeService.saveMaterialTypes(normalizedList);
      if (success) {
        setToast({ message: 'Đã lưu thứ tự phân loại vật tư thành công!', type: 'success' });
      } else {
        setToast({ message: 'Lỗi khi lưu thứ tự vật tư vào Firebase', type: 'error' });
      }
    } catch (err: any) {
      console.error('Lỗi khi sắp xếp phân loại vật tư:', err);
      setToast({ message: `Lỗi: ${err.message}`, type: 'error' });
    }
  };

  const anVatTu = async (id: string) => {
    setIsProcessing(true);
    try {
      const newList = danhSachVatTu.map(v => v.id === id ? { ...v, hidden: true } : v);
      window._danhSachVatTu = newList;
      setDanhSachVatTu(newList);
      await MaterialTypeService.saveMaterialTypes(newList);
      setToast({ message: 'Đã ẩn vật tư!', type: 'success' });
      await taiDanhSachVatTu();
    } catch (err) {
      setToast({ message: 'Lỗi khi ẩn vật tư', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const hienVatTu = async (id: string) => {
    setIsProcessing(true);
    try {
      const newList = danhSachVatTu.map(v => v.id === id ? { ...v, hidden: false } : v);
      window._danhSachVatTu = newList;
      setDanhSachVatTu(newList);
      await MaterialTypeService.saveMaterialTypes(newList);
      setToast({ message: 'Đã hiện vật tư!', type: 'success' });
      await taiDanhSachVatTu();
    } catch (err) {
      setToast({ message: 'Lỗi khi hiện vật tư', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const luuVatTuMoi = async (data: any) => {
    setIsProcessing(true);
    try {
      const isEditing = danhSachVatTu.some(v => v.id === data.id);
      let newList: MaterialType[];
      const targetId = data.id || Math.random().toString(36).substr(2, 9);
      
      if (isEditing) {
        newList = danhSachVatTu.map(v => v.id === data.id ? { ...v, ...data } : v);
      } else {
        // Khi thêm loại vật tư mới, tự động đưa vào cuối danh sách với sortOrder lớn nhất
        const maxSort = danhSachVatTu.reduce((max, it, idx) => {
          const s = typeof it.sortOrder === 'number' ? it.sortOrder : idx;
          return Math.max(max, s);
        }, -1);
        const newItem: MaterialType = {
          ...data,
          id: targetId,
          sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : maxSort + 1
        };
        newList = [...danhSachVatTu, newItem];
      }

      // Chuẩn hoá sortOrder tăng dần cho toàn bộ danh sách
      newList = newList.map((item, idx) => ({
        ...item,
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : idx
      }));

      window._danhSachVatTu = newList;
      setDanhSachVatTu(newList);
      await MaterialTypeService.saveMaterialTypes(newList);

      // Đảm bảo có cấu hình chi tiết cho vật tư này trên Firestore
      const configDoc = await MaterialTypeService.getMaterialTypeConfig(targetId);
      if (!configDoc) {
        const fallback = GET_FALLBACK_MATERIAL_CONFIG(targetId, data.ten);
        await MaterialTypeService.saveMaterialTypeConfig(targetId, fallback);
      }

      setToast({ message: isEditing ? 'Cấu hình vật tư đã được cập nhật!' : 'Thêm vật tư thành công!', type: 'success' });
      setShowThemVatTuModal(false);
      setVatTuCanSua(undefined);
      await taiDanhSachVatTu();
    } catch (err: any) {
      setToast({ message: `Lỗi: ${err.message}`, type: 'error' });
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  // --- HÀM KHỞI ĐỘNG APP THEO LOẠI VẬT TƯ ---
  const khoiDongApp = async (loaiVatTu: string) => {
    setIsProcessing(true);
    try {
      await ProjectService.loadProjectTotalUnitsAll();
      // 1. Load cấu hình
      await khoiDongCauHinh();

      // Ensure material-specific configuration remains active and not overridden by global config
      if ((window as any)._currentMaterialConfig) {
        applyMaterialConfigToForms((window as any)._currentMaterialConfig);
      }

      // 2. Load danh sách giá vật tư để có ngày áp giá mới nhất
      await loadMaterialPrices();
      await loadPriceDateOptions();
      
      // 3. Load lịch sử
      await loadRecords();

    } catch (err) {
      console.error("Lỗi khởi động app:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const mergeMaterialConfigToBM02 = (bm02: any, matConfig: any) => {
    if (!bm02 || !matConfig) return bm02;
    const matBM02 = matConfig.bm02;
    if (!matBM02) return bm02;

    return {
      ...bm02,
      title: matBM02.title || bm02.title,
      phongKeToan: matBM02.accountant || bm02.phongKeToan,
      nguoiLap: matBM02.preparer || bm02.nguoiLap,
      giamDoc: matBM02.director || bm02.giamDoc,
      duyetHDTV: matBM02.approver || bm02.duyetHDTV,
      recipients: matBM02.recipients && matBM02.recipients.length > 0 ? matBM02.recipients : bm02.recipients,
      grounds: matBM02.grounds && matBM02.grounds.length > 0 ? matBM02.grounds : bm02.grounds,
      thoiHanThanhToan: matBM02.paymentTerm || bm02.thoiHanThanhToan,
      giamDocDuyet: matBM02.director || bm02.giamDocDuyet
    };
  };

  const extractReceiverList = (rec: any): BM032Representative[] | null => {
    if (!rec) return null;
    const src = rec.bm032 || rec.bbntData || rec.bm04 || rec.bm04Data || rec;

    if (Array.isArray(src.receiverList) && src.receiverList.length > 0) {
      return src.receiverList;
    }
    if (Array.isArray(rec.receiverList) && rec.receiverList.length > 0) {
      return rec.receiverList;
    }
    if (rec.bm032 && Array.isArray(rec.bm032.receiverList) && rec.bm032.receiverList.length > 0) {
      return rec.bm032.receiverList;
    }
    if (rec.bbntData && Array.isArray(rec.bbntData.receiverList) && rec.bbntData.receiverList.length > 0) {
      return rec.bbntData.receiverList;
    }
    if (rec.bm04 && Array.isArray(rec.bm04.receiverList) && rec.bm04.receiverList.length > 0) {
      return rec.bm04.receiverList;
    }
    if (rec.bm04Data && Array.isArray(rec.bm04Data.receiverList) && rec.bm04Data.receiverList.length > 0) {
      return rec.bm04Data.receiverList;
    }

    const pkgDs = src.pkg_benNhan_ds || rec.pkg_benNhan_ds || rec.bm032?.pkg_benNhan_ds || rec.bbntData?.pkg_benNhan_ds;
    if (pkgDs) {
      try {
        const parsed = typeof pkgDs === 'string' ? JSON.parse(pkgDs) : pkgDs;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }

    const bn1 = src.pkg_benNhan1 || rec.pkg_benNhan1 || rec.bm032?.pkg_benNhan1;
    const bn2 = src.pkg_benNhan2 || rec.pkg_benNhan2 || rec.bm032?.pkg_benNhan2;
    if (bn1 || bn2) {
      const list: BM032Representative[] = [];
      if (bn1) {
        list.push({
          name: bn1,
          position: src.pkg_benNhan1ChucVu || rec.pkg_benNhan1ChucVu || rec.bm032?.pkg_benNhan1ChucVu || '',
          salutation: 'Ông'
        });
      }
      if (bn2) {
        list.push({
          name: bn2,
          position: src.pkg_benNhan2ChucVu || rec.pkg_benNhan2ChucVu || rec.bm032?.pkg_benNhan2ChucVu || '',
          salutation: 'Ông'
        });
      }
      if (list.length > 0) return list;
    }

    return null;
  };

  const extractReceiverCompany = (rec: any): string => {
    if (!rec) return '';
    const src = rec.bm032 || rec.bbntData || rec.bm04 || rec.bm04Data || rec;
    return src.receiverCompany || rec.receiverCompany || rec.bm032?.receiverCompany || rec.bm04?.receiverCompany || src.bbnt_nhaTauThiCong || rec.bbnt_nhaTauThiCong || rec.company || 'CÔNG TY TNHH MTV XÂY DỰNG IJC';
  };

  const hasValidRepresentatives = (list: any): boolean => {
    return Array.isArray(list) && list.length > 0 && list.some((r: any) => r && typeof r.name === 'string' && r.name.trim() !== '');
  };

  const getFixedSenderRepresentatives = (matConfig?: any, cauHinh?: any): any[] => {
    // 1. Check matConfig.bm032.senderRepresentatives first (Configured specifically for this material in Figure 2)
    const reps = matConfig?.bm032?.senderRepresentatives;
    if (hasValidRepresentatives(reps)) {
      return reps.map((r: any) => ({
        name: (r.name || '').trim(),
        position: (r.position || '').trim(),
        salutation: r.salutation || 'Ông'
      }));
    }

    // 2. Check matConfig.pkg_benGiao_ds
    if (matConfig?.pkg_benGiao_ds) {
      try {
        const parsed = typeof matConfig.pkg_benGiao_ds === 'string' ? JSON.parse(matConfig.pkg_benGiao_ds) : matConfig.pkg_benGiao_ds;
        if (hasValidRepresentatives(parsed)) {
          return parsed.map((r: any) => ({
            name: (r.name || '').trim(),
            position: (r.position || '').trim(),
            salutation: r.salutation || 'Ông'
          }));
        }
      } catch (e) {}
    }

    // 3. Check cauHinh.pkg_benGiao_ds (Cấu hình nội dung cố định modal)
    if (cauHinh?.pkg_benGiao_ds) {
      try {
        const parsed = typeof cauHinh.pkg_benGiao_ds === 'string' ? JSON.parse(cauHinh.pkg_benGiao_ds) : cauHinh.pkg_benGiao_ds;
        if (hasValidRepresentatives(parsed)) {
          return parsed.map((r: any) => ({
            name: (r.name || '').trim(),
            position: (r.position || '').trim(),
            salutation: r.salutation || 'Ông'
          }));
        }
      } catch (e) {}
    }

    // 4. Check matConfig.pkg_benGiaoTen or cauHinh.pkg_benGiaoTen
    const tenBenGiao = matConfig?.pkg_benGiaoTen || cauHinh?.pkg_benGiaoTen;
    if (tenBenGiao && typeof tenBenGiao === 'string' && tenBenGiao.trim() !== '') {
      return [{
        name: tenBenGiao.trim(),
        position: (matConfig?.pkg_benGiaoChucVu || cauHinh?.pkg_benGiaoChucVu || '').trim(),
        salutation: 'Ông'
      }];
    }

    // 5. Check bbnt_benA_daiDien
    const daiDien = matConfig?.bm032?.bbnt_benA_daiDien || cauHinh?.bbnt_benA_daiDien;
    if (daiDien && typeof daiDien === 'string' && daiDien.trim() !== '') {
      return [{
        name: daiDien.trim(),
        position: 'Đại diện bên giao',
        salutation: 'Ông'
      }];
    }

    return [{ name: '', position: '', salutation: 'Ông' }];
  };

  const mergeMaterialConfigToBBNT = (bbnt: any, matConfig: any) => {
    if (!bbnt || !matConfig) return bbnt;
    const matBM032 = matConfig.bm032;
    if (!matBM032) return bbnt;

    const senderList = hasValidRepresentatives(bbnt.senderList)
      ? bbnt.senderList
      : (hasValidRepresentatives(matBM032.senderRepresentatives)
        ? matBM032.senderRepresentatives.map((r: any) => ({ name: r.name, position: r.position, salutation: r.salutation }))
        : (matBM032.senderRepresentatives && matBM032.senderRepresentatives.length > 0
          ? matBM032.senderRepresentatives
          : bbnt.senderList));

    const receiverList = (bbnt.receiverList && bbnt.receiverList.length > 0)
      ? bbnt.receiverList
      : (matBM032.receiverRepresentatives && matBM032.receiverRepresentatives.length > 0
        ? matBM032.receiverRepresentatives.map((r: any) => ({ name: r.name, position: r.position, salutation: r.salutation }))
        : bbnt.receiverList);

    return {
      ...bbnt,
      title: bbnt.title || matBM032.title || 'BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO',
      docNumber: bbnt.docNumber || 'QTMH-BM03.2',
      senderCompany: bbnt.senderCompany || matBM032.senderCompany,
      receiverCompany: bbnt.receiverCompany || matBM032.receiverCompany,
      senderList: senderList,
      receiverList: receiverList,
      locationDetail: bbnt.locationDetail || matBM032.defaultLocation,
      startTime: bbnt.startTime || matBM032.startTime,
      endTime: bbnt.endTime || matBM032.endTime,
      grounds: (bbnt.grounds && bbnt.grounds.length > 0) ? bbnt.grounds : (matBM032.grounds && matBM032.grounds.length > 0 ? matBM032.grounds : bbnt.grounds),
      bbnt_tenCongTrinh: bbnt.bbnt_tenCongTrinh || matBM032.tenCongTrinh,
      bbnt_nhaTauThiCong: bbnt.bbnt_nhaTauThiCong || matBM032.nhaThauThiCong,
      bbnt_nhaCungCap: bbnt.bbnt_nhaCungCap || matBM032.nhaCungCap,
      soHDNT: bbnt.soHDNT || matBM032.soHDNT,
      ngayKyHD: bbnt.ngayKyHD || matBM032.ngayKyHD,
      maBM02: bbnt.maBM02 || matBM032.maBM02,
      bbnt_benA_congTy: bbnt.bbnt_benA_congTy || matBM032.bbnt_benA_congTy || matBM032.nhaCungCap,
      bbnt_benA_daiDien: bbnt.bbnt_benA_daiDien || matBM032.bbnt_benA_daiDien,
      bbnt_benB_congTy: bbnt.bbnt_benB_congTy || matBM032.bbnt_benB_congTy || matBM032.nhaThauThiCong,
      bbnt_benB_daiDien: bbnt.bbnt_benB_daiDien || matBM032.bbnt_benB_daiDien
    };
  };

  const applyMaterialConfigToForms = (matConfig: any) => {
    if (!matConfig) return;

    // Apply to BM02 (Tờ trình)
    setBm02Data(prev => {
      const matBM02 = matConfig.bm02;
      if (!matBM02) return prev;
      
      return {
        ...prev,
        title: matBM02.title || prev.title,
        phongKeToan: matBM02.accountant || prev.phongKeToan,
        nguoiLap: matBM02.preparer || prev.nguoiLap,
        giamDoc: matBM02.director || prev.giamDoc,
        duyetHDTV: matBM02.approver || prev.duyetHDTV,
        recipients: matBM02.recipients && matBM02.recipients.length > 0 ? matBM02.recipients : prev.recipients,
        grounds: matBM02.grounds && matBM02.grounds.length > 0 ? matBM02.grounds : prev.grounds,
        thoiHanThanhToan: matBM02.paymentTerm || prev.thoiHanThanhToan,
        requestContent: matBM02.requestContent || prev.requestContent,
        giamDocDuyet: matBM02.director || prev.giamDocDuyet
      };
    });

    const isEditingHistoricalRecord = !!(currentRecordId || (window as any)._currentRecordId);
    const activeProposerName = (window as any)._currentProposerName || bm02Data.nguoiDeNghi || '';

    if (!isEditingHistoricalRecord) {
      let baseKyTen: any[];
      if (matConfig.bm02?.kyTenList && matConfig.bm02.kyTenList.length > 0) {
        baseKyTen = matConfig.bm02.kyTenList;
      } else if (window._cauHinh?.bm02_kyTen_config) {
        try {
          baseKyTen = safeParse(window._cauHinh.bm02_kyTen_config);
        } catch (e) {
          baseKyTen = KY_TEN_MAC_DINH;
        }
      } else {
        baseKyTen = KY_TEN_MAC_DINH;
      }

      if (activeProposerName) {
        baseKyTen = updateKyTenWithPBanDeNghi(baseKyTen, activeProposerName);
      }
      setKyTenBM02(baseKyTen);
    }

    // Apply to BBNT (BM03.2) and BM04 (Giao nhận) with strictly synchronized fixed fields
    const matBM032 = matConfig.bm032;
    if (matBM032) {
      const matSenderCompany = (matBM032.senderCompany || matBM032.bbnt_benA_congTy || matBM032.nhaCungCap || '').trim();
      const matSenderReps = (matBM032.senderRepresentatives && matBM032.senderRepresentatives.length > 0)
        ? matBM032.senderRepresentatives.map((r: any) => ({
            name: r.name || '',
            position: r.position || '',
            salutation: r.salutation || 'Ông'
          }))
        : [];

      const fixedComp = getFixedSenderCompany(matConfig, window._cauHinh);
      const fixedReps = getFixedSenderRepresentatives(matConfig, window._cauHinh);

      // Determine valid sender company:
      // When editing a historical record that already has its own saved senderCompany, keep it.
      // Otherwise (selecting a material or creating/editing a document for this material),
      // the material's configured fixed senderCompany has absolute precedence!
      let finalSenderCompany: string;
      if (isEditingHistoricalRecord && isValidSenderCompany(bbntData.senderCompany)) {
        finalSenderCompany = bbntData.senderCompany;
      } else {
        finalSenderCompany = fixedComp;
      }

      // Determine sender list:
      let finalSenderList: any[];
      if (isEditingHistoricalRecord && hasValidRepresentatives(bbntData.senderList)) {
        finalSenderList = bbntData.senderList;
      } else {
        finalSenderList = fixedReps.length > 0 ? fixedReps : [{ salutation: 'Ông', name: '', position: '' }];
      }

      const rawMatReceiverReps = (matBM032.receiverRepresentatives && matBM032.receiverRepresentatives.length > 0)
        ? matBM032.receiverRepresentatives.map((r: any) => ({
            name: r.name || '',
            position: r.position || '',
            salutation: r.salutation || 'Ông'
          }))
        : [];

      const matReceiverReps = (rawMatReceiverReps.length > 0 && rawMatReceiverReps.length <= 5)
        ? rawMatReceiverReps
        : DEFAULT_RECEIVER_LIST;

      const existingReceiverCompany = bbntData.receiverCompany || bm04Data.receiverCompany;
      const finalReceiverCompany = isEditingHistoricalRecord
        ? (existingReceiverCompany || matBM032.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC')
        : (matBM032.receiverCompany || existingReceiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC');

      // Copy location from BM02 if available
      const bm02Location = (bm02Data.mucDichSuDungDiaDiem || bm02Data.location || '').trim();
      const finalLocation = bm02Location || (isEditingHistoricalRecord ? (bbntData.address || bm04Data.address) : '') || matBM032.defaultLocation || '';

      const existingGrounds = (bbntData.grounds && bbntData.grounds.length > 0)
        ? bbntData.grounds
        : (bm04Data.grounds && bm04Data.grounds.length > 0 ? bm04Data.grounds : null);

      const finalGrounds = (isEditingHistoricalRecord && existingGrounds)
        ? existingGrounds
        : ((matBM032.grounds && matBM032.grounds.length > 0) ? matBM032.grounds : (existingGrounds || INITIAL_BM03.grounds));

      const finalStartTime = (isEditingHistoricalRecord && bbntData.startTime) ? bbntData.startTime : (matBM032.startTime || '15h');
      const finalEndTime = (isEditingHistoricalRecord && bbntData.endTime) ? bbntData.endTime : (matBM032.endTime || '16h');

      // Sync proposingCompany in BM02
      setBm02Data(prev => ({
        ...prev,
        proposingCompany: finalSenderCompany
      }));

      // 1. Apply to BBNT (BM03.2)
      setBbntData(prev => {
        const existingList = (prev.receiverList && prev.receiverList.length > 0)
          ? prev.receiverList
          : ((bm04Data.receiverList && bm04Data.receiverList.length > 0) ? bm04Data.receiverList : null);

        let finalRecList = (isEditingHistoricalRecord || existingList)
          ? (existingList || DEFAULT_RECEIVER_LIST)
          : (matReceiverReps && matReceiverReps.length > 0 ? matReceiverReps : DEFAULT_RECEIVER_LIST);

        if (activeProposerName) {
          finalRecList = updateReceiverListWithChiHuyTruong(finalRecList, activeProposerName);
        }

        return {
          ...prev,
          title: (isEditingHistoricalRecord && prev.title) ? prev.title : (matBM032.title || 'BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO'),
          docNumber: prev.docNumber || 'QTMH-BM03.2',
          senderCompany: finalSenderCompany,
          receiverCompany: finalReceiverCompany,
          senderList: finalSenderList,
          receiverList: finalRecList,
          address: finalLocation,
          locationDetail: finalLocation,
          startTime: (isEditingHistoricalRecord && prev.startTime) ? prev.startTime : finalStartTime,
          endTime: (isEditingHistoricalRecord && prev.endTime) ? prev.endTime : finalEndTime,
          grounds: finalGrounds,
          bbnt_tenCongTrinh: (isEditingHistoricalRecord && prev.bbnt_tenCongTrinh) ? prev.bbnt_tenCongTrinh : (matBM032.tenCongTrinh || ''),
          bbnt_nhaTauThiCong: (isEditingHistoricalRecord && prev.bbnt_nhaTauThiCong) ? prev.bbnt_nhaTauThiCong : (matBM032.nhaThauThiCong || ''),
          bbnt_nhaCungCap: finalSenderCompany,
          soHDNT: (isEditingHistoricalRecord && prev.soHDNT) ? prev.soHDNT : (matBM032.soHDNT || ''),
          ngayKyHD: (isEditingHistoricalRecord && prev.ngayKyHD) ? prev.ngayKyHD : (matBM032.ngayKyHD || ''),
          maBM02: (isEditingHistoricalRecord && prev.maBM02) ? prev.maBM02 : (matBM032.maBM02 || ''),
          bbnt_benA_congTy: finalSenderCompany,
          bbnt_benA_daiDien: (isEditingHistoricalRecord && prev.bbnt_benA_daiDien) ? prev.bbnt_benA_daiDien : (matBM032.bbnt_benA_daiDien || ''),
          bbnt_benB_congTy: finalReceiverCompany,
          bbnt_benB_daiDien: (isEditingHistoricalRecord && prev.bbnt_benB_daiDien) ? prev.bbnt_benB_daiDien : (matBM032.bbnt_benB_daiDien || '')
        };
      });

      // 2. Apply to BM04 (Giao nhận vật tư)
      setBm04Data(prev => {
        const existingList = (prev.receiverList && prev.receiverList.length > 0)
          ? prev.receiverList
          : ((bbntData.receiverList && bbntData.receiverList.length > 0) ? bbntData.receiverList : null);

        let finalRecList = (isEditingHistoricalRecord || existingList)
          ? (existingList || DEFAULT_RECEIVER_LIST)
          : (matReceiverReps && matReceiverReps.length > 0 ? matReceiverReps : DEFAULT_RECEIVER_LIST);

        if (activeProposerName) {
          finalRecList = updateReceiverListWithChiHuyTruong(finalRecList, activeProposerName);
        }

        return {
          ...prev,
          formType: 'BM04',
          title: (isEditingHistoricalRecord && prev.title) ? prev.title : (matBM032.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ'),
          docNumber: prev.docNumber || 'QTMH-BM04',
          date: (prev.date && !prev.date.includes('...') && !prev.date.includes('2025'))
            ? prev.date
            : (bbntData.date && !bbntData.date.includes('...') && !bbntData.date.includes('2025')
                ? bbntData.date
                : (addOneDayToString(bm02Data.date) || bm02Data.date || '')),
          startDate: (prev.startDate && !prev.startDate.includes('...') && !prev.startDate.includes('2025'))
            ? prev.startDate
            : (bbntData.startDate || addOneDayToString(bm02Data.date) || bm02Data.date || ''),
          endDate: (prev.endDate && !prev.endDate.includes('...') && !prev.endDate.includes('2025'))
            ? prev.endDate
            : (bbntData.endDate || addOneDayToString(bm02Data.date) || bm02Data.date || ''),
          originalFileName: prev.originalFileName || bbntData.originalFileName || bm02Data.originalFileName || (typeof window !== 'undefined' && ((window as any)._currentOriginalFileName || (window as any)._currentBM02FileName)) || '',
          senderCompany: finalSenderCompany,
          receiverCompany: finalReceiverCompany,
          senderList: finalSenderList,
          receiverList: finalRecList,
          address: finalLocation,
          locationDetail: finalLocation,
          startTime: (isEditingHistoricalRecord && prev.startTime) ? prev.startTime : finalStartTime,
          endTime: (isEditingHistoricalRecord && prev.endTime) ? prev.endTime : finalEndTime,
          grounds: finalGrounds,
          bbnt_tenCongTrinh: (isEditingHistoricalRecord && prev.bbnt_tenCongTrinh) ? prev.bbnt_tenCongTrinh : (matBM032.tenCongTrinh || ''),
          bbnt_nhaTauThiCong: (isEditingHistoricalRecord && prev.bbnt_nhaTauThiCong) ? prev.bbnt_nhaTauThiCong : (matBM032.nhaThauThiCong || ''),
          bbnt_nhaCungCap: finalSenderCompany,
          soHDNT: (isEditingHistoricalRecord && prev.soHDNT) ? prev.soHDNT : (matBM032.soHDNT || ''),
          ngayKyHD: (isEditingHistoricalRecord && prev.ngayKyHD) ? prev.ngayKyHD : (matBM032.ngayKyHD || ''),
          maBM02: (isEditingHistoricalRecord && prev.maBM02) ? prev.maBM02 : (matBM032.maBM02 || ''),
          bbnt_benA_congTy: finalSenderCompany,
          bbnt_benA_daiDien: (isEditingHistoricalRecord && prev.bbnt_benA_daiDien) ? prev.bbnt_benA_daiDien : (matBM032.bbnt_benA_daiDien || ''),
          bbnt_benB_congTy: finalReceiverCompany,
          bbnt_benB_daiDien: (isEditingHistoricalRecord && prev.bbnt_benB_daiDien) ? prev.bbnt_benB_daiDien : (matBM032.bbnt_benB_daiDien || '')
        };
      });
    }
  };

  const chonLoaiVatTu = async (id: string) => {
    (window as any)._loaiVatTuHienTai = id;
    setCurrentMaterialType(id);
    localStorage.setItem('bti_current_material_type', id);
    setActiveTab('BM02'); // Open BM02 page corresponding to selected material
    (window as any)._isBM06Dirty = false; // Reset dirty state
    
    // Clear old in-memory material config and record session to ensure clean load for newly selected material
    (window as any)._currentMaterialConfig = null;
    (window as any)._currentSenderCompany = null;
    (window as any)._currentRecordId = null;
    setCurrentRecordId(null);
    setCurrentBM06Record(null);
    (window as any)._currentBM06Data = null;

    // Preserve any existing line items (e.g. from OCR or file) and re-match them with the selected material catalog
    const hasExistingItems = (bm02Data.items && bm02Data.items.length > 0);
    if (!hasExistingItems) {
      setBm02Data(INITIAL_BM02);
      setBbntData(INITIAL_BM03);
      setBm04Data(INITIAL_BM04);
      setHasData(false);
      (window as any)._tieuDeTuFile = null;
    }
    
    capNhatTieuDeTheoLoai(id);

    // 1. Fetch material-specific config and general config
    let matConfig = null;
    try {
      matConfig = await MaterialTypeService.getMaterialTypeConfig(id);
    } catch (e) {
      console.warn("Failed to load material specific config. Using fallback.", e);
    }
    const activeMatObj = danhSachVatTu.find(v => v.id === id);
    const activeMatName = activeMatObj?.ten || id;

    // 2. Load general config (cauHinh/${id})
    const activeLoai = id || (window as any)._loaiVatTuHienTai || 'BeTong';
    const data = await ConfigService.getCauHinh(activeLoai);
    if (data) {
      window._cauHinh = data as CauHinh;
      if (data.bm02_kyTen_config) {
        try {
          const parsed = safeParse(data.bm02_kyTen_config);
          setKyTenBM02(parsed.sort((a: any, b: any) => a.viTri - b.viTri));
        } catch (e) {
          setKyTenBM02(KY_TEN_MAC_DINH);
        }
      } else {
        setKyTenBM02(KY_TEN_MAC_DINH);
      }
    } else {
      window._cauHinh = undefined;
      setKyTenBM02(KY_TEN_MAC_DINH);
    }

    // Set enriched material config BEFORE applying to forms to prevent config leakage
    matConfig = enrichMaterialConfig(matConfig, id, activeMatName);
    (window as any)._currentMaterialConfig = matConfig;

    // 3. Resolve exact configured BÊN GIAO for this selected material
    const targetSenderCompany = getFixedSenderCompany(matConfig, window._cauHinh);
    const targetSenderReps = getFixedSenderRepresentatives(matConfig, window._cauHinh);
    (window as any)._currentSenderCompany = targetSenderCompany;

    // 4. Force set BÊN GIAO for the selected material into all form states
    setBbntData(prev => ({
      ...prev,
      senderCompany: targetSenderCompany,
      bbnt_benA_congTy: targetSenderCompany,
      bbnt_nhaCungCap: targetSenderCompany,
      senderList: targetSenderReps,
      bbnt_benA_daiDien: targetSenderReps[0]?.name || ''
    }));
    setBm04Data(prev => ({
      ...prev,
      senderCompany: targetSenderCompany,
      bbnt_benA_congTy: targetSenderCompany,
      bbnt_nhaCungCap: targetSenderCompany,
      senderList: targetSenderReps,
      bbnt_benA_daiDien: targetSenderReps[0]?.name || ''
    }));
    setBm02Data(prev => ({
      ...prev,
      proposingCompany: targetSenderCompany
    }));

    // 5. Apply configs to forms
    if (data) {
      applyCauHinhToForms(data as CauHinh);
    }
    applyMaterialConfigToForms(matConfig);
    
    await loadMaterialPrices(id);
    await loadPriceDateOptions(id);
    khoiDongApp(id);
  };

  const capNhatTieuDeTheoLoai = (id: string) => {
    const tieuDeCoDinh = "V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ";

    // Lưu 
    (window as any)._tieuDeCoDinh = tieuDeCoDinh;
    
    // Phần nội dung từ file (nếu có)
    const phanTuFile = (window as any)._tieuDeTuFile || "";

    // Cập nhật state
    setBm02Data(prev => ({
      ...prev,
      title: tieuDeCoDinh,
      mucDichSuDungNoiDung: phanTuFile || prev.mucDichSuDungNoiDung
    }));
  };

  const handleSwitchMaterialType = () => {
    if (window.confirm("Bạn có chắc chắn muốn đổi loại vật tư? Mọi dữ liệu chưa lưu sẽ bị mất.")) {
      setCurrentMaterialType(null);
      setCurrentRecordId(null);
      setCurrentBM06Record(null);
      (window as any)._currentBM06Data = null;
      (window as any)._loaiVatTuHienTai = null;
      localStorage.removeItem('bti_current_material_type');
    }
  };

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsApiKeySelected(hasKey);
      }
    };
    checkApiKey();
    taiDanhSachVatTu();

    // Always start at Dashboard on reload
    localStorage.removeItem('bti_current_material_type'); // Clear any old saved state
    khoiDongApp("");
  }, []);

  // Listen for global and material-specific config updates to apply instantly
  useEffect(() => {
    const handleConfigUpdate = async () => {
      if ((window as any)._currentMaterialConfig) {
        applyMaterialConfigToForms((window as any)._currentMaterialConfig);
      } else {
        const activeId = (window as any)._loaiVatTuHienTai || currentMaterialType;
        if (activeId) {
          try {
            let matConfig = await MaterialTypeService.getMaterialTypeConfig(activeId);
            const activeMatObj = danhSachVatTu.find(v => v.id === activeId);
            matConfig = enrichMaterialConfig(matConfig, activeId, activeMatObj?.ten || activeId);
            (window as any)._currentMaterialConfig = matConfig;
            applyMaterialConfigToForms(matConfig);
          } catch (e) {
            console.error("Lỗi khi cập nhật cấu hình vật tư:", e);
          }
        }
      }
    };

    window.addEventListener('globalConfigUpdated', handleConfigUpdate);
    return () => {
      window.removeEventListener('globalConfigUpdated', handleConfigUpdate);
    };
  }, [currentMaterialType]);

  // Real-time Firestore live listener for BM02 & BBNT / BM03.2
  useEffect(() => {
    if (!currentRecordId) {
      return;
    }

    let bm02DocId = currentRecordId;
    let bm032DocId = currentRecordId;

    if (currentRecordId.startsWith('BM02-')) {
      bm032DocId = currentRecordId.replace('BM02-', 'BM03.2-');
    } else if (currentRecordId.startsWith('BM03.2-')) {
      bm02DocId = currentRecordId.replace('BM03.2-', 'BM02-');
    } else if (currentRecordId.startsWith('BM06-')) {
      bm02DocId = `BM02-${currentRecordId.replace('BM06-', '')}`;
      bm032DocId = `BM03.2-${currentRecordId.replace('BM06-', '')}`;
    } else {
      bm02DocId = `BM02-${currentRecordId}`;
      bm032DocId = `BM03.2-${currentRecordId}`;
    }

    const unsubBM02 = OrderService.subscribeBM02(bm02DocId, (data) => {
      setBm02Data(prev => {
        const dataItems = data.items || data.danhSachVatTu || [];
        if (prev.sourceType === 'BM06') {
          const combined = (prev.items || []).map((item) => {
            const matchItem = dataItems.find((it: any) => it.name === item.name && it.unitId === item.unitId && it.projectId === item.projectId) || dataItems.find((it: any) => it.name === item.name) || {};
            return {
              ...item,
              unitPrice: matchItem.unitPrice !== undefined ? Number(matchItem.unitPrice) : item.unitPrice,
              lineTotal: matchItem.lineTotal !== undefined ? Number(matchItem.lineTotal) : (matchItem.total !== undefined ? Number(matchItem.total) : item.lineTotal || item.total),
              total: matchItem.lineTotal !== undefined ? Number(matchItem.lineTotal) : (matchItem.total !== undefined ? Number(matchItem.total) : item.total)
            };
          });

          return {
            ...prev,
            ...data,
            items: combined,
            totalAmount: data.totalAmount !== undefined ? data.totalAmount : prev.totalAmount,
            taxRate: data.taxRate !== undefined ? data.taxRate : prev.taxRate,
            taxAmount: data.taxAmount !== undefined ? data.taxAmount : prev.taxAmount,
            totalWithTax: data.totalWithTax !== undefined ? data.totalWithTax : prev.totalWithTax,
            totalAmountWithVat: data.totalAmountWithVat !== undefined ? data.totalAmountWithVat : prev.totalAmountWithVat,
            sourceType: 'BM06'
          };
        }
        return {
          ...prev,
          ...data,
          items: dataItems.length > 0 ? dataItems : (prev.items || []),
          totalAmount: data.totalAmount !== undefined ? data.totalAmount : prev.totalAmount,
          taxRate: data.taxRate !== undefined ? data.taxRate : prev.taxRate,
          taxAmount: data.taxAmount !== undefined ? data.taxAmount : prev.taxAmount,
          totalWithTax: data.totalWithTax !== undefined ? data.totalWithTax : prev.totalWithTax,
          totalAmountWithVat: data.totalAmountWithVat !== undefined ? data.totalAmountWithVat : prev.totalAmountWithVat,
          sourceType: data.sourceType || prev.sourceType || 'PDF'
        };
      });
      setBm02Synced(true);
      setTimeout(() => setBm02Synced(false), 2500);
    });

    const unsubBM032 = OrderService.subscribeBM032(bm032DocId, (data) => {
      setBbntData(prev => ({
        ...prev,
        ...data,
        sourceType: data.sourceType || prev.sourceType || 'PDF'
      }));
      setBbntSynced(true);
      setTimeout(() => setBbntSynced(false), 2500);
    });

    return () => {
      if (unsubBM02) unsubBM02();
      if (unsubBM032) unsubBM032();
    };
  }, [currentRecordId]);

  const khoiDongCauHinh = async () => {
    const activeLoai = (window as any)._loaiVatTuHienTai || 'BeTong';
    const data = await ConfigService.getCauHinh(activeLoai);
    if (data) {
      window._cauHinh = data as CauHinh;
      if (data.bm02_kyTen_config) {
        try {
          const parsed = safeParse(data.bm02_kyTen_config);
          setKyTenBM02(parsed.sort((a: any, b: any) => a.viTri - b.viTri));
        } catch (e) {
          console.error("Lỗi parse bm02_kyTen_config:", e);
          setKyTenBM02(KY_TEN_MAC_DINH);
        }
      } else {
        setKyTenBM02(KY_TEN_MAC_DINH);
      }
      applyCauHinhToForms(data as CauHinh);
    }
  };

  const apCauHinhVaoBM02 = (config: CauHinh) => {
    setBm02Data(prev => {
      const canCuCoDinh = config.canCu_coDinh || '';
      const dongCoDinh = canCuCoDinh
        .split('\n')
        .map(d => d.trim())
        .filter(d => d !== '');

      // Tìm dòng động từ file upload (thường là dòng chứa "Phiếu đề nghị")
      const dongTuFile = (prev.grounds || []).find(g => g.includes('Phiếu đề nghị')) || 
        'Căn cứ Phiếu đề nghị về việc cung cấp vật tư của Công ty ...';
      
      const newGrounds = [...dongCoDinh, dongTuFile];

      return {
        ...prev,
        phongKeToan: config.bm02_phongKeToan || prev.phongKeToan,
        nguoiLap: config.bm02_nguoiLap || prev.nguoiLap,
        giamDoc: config.bm02_giamDoc || prev.giamDoc,
        duyetHDTV: config.bm02_duyetHDTV || prev.duyetHDTV,
        grounds: newGrounds
      };
    });
  };

  const apCauHinhVaoBBNT = (config: CauHinh) => {
    setBbntData(prev => {
      const newGrounds = [...(prev.grounds || [])];
      
      // Update grounds based on config
      const hasContract = (config.bbnt_soHDNT || '').trim() !== '' && (config.bbnt_ngayKyHD || '').trim() !== '';
      const contractStr = hasContract
        ? `Hợp đồng nguyên tắc số ${config.bbnt_soHDNT} ký ngày ${chuanHoaNgay(config.bbnt_ngayKyHD)} và các phụ lục kèm theo;`
        : `Hợp đồng nguyên tắc.`;
      
      const contractIdx = newGrounds.findIndex(g => g.includes('Hợp đồng nguyên tắc'));
      if (contractIdx !== -1) {
        newGrounds[contractIdx] = contractStr;
      } else {
        newGrounds.unshift(contractStr);
      }
      
      const hasBM02 = (config.bbnt_maBM02 || '').trim() !== '';
      const bm02Str = hasBM02
        ? `Tờ trình phê duyệt dự trù kinh phí mua vật tư ${config.bbnt_maBM02};`
        : `Tờ trình phê duyệt dự trù kinh phí mua vật tư.`;
      
      const bm02Idx = newGrounds.findIndex(g => g.includes('Tờ trình phê duyệt dự trù kinh phí mua vật tư'));
      if (bm02Idx !== -1) {
        newGrounds[bm02Idx] = bm02Str;
      } else {
        const cIdx = newGrounds.findIndex(g => g.includes('Hợp đồng nguyên tắc'));
        if (cIdx !== -1) {
          newGrounds.splice(cIdx + 1, 0, bm02Str);
        } else {
          newGrounds.push(bm02Str);
        }
      }

      var senderList = (prev.senderList && prev.senderList.length > 0) ? prev.senderList : [];
      if (senderList.length === 0) {
        if (config.pkg_benGiao_ds) {
          try { senderList = safeParse(config.pkg_benGiao_ds); } catch(e) {}
        } else if (config.pkg_benGiaoTen) {
          senderList = [{ name: config.pkg_benGiaoTen, position: config.pkg_benGiaoChucVu || '', salutation: 'Ông' }];
        }
      }

      var receiverList = (prev.receiverList && prev.receiverList.length > 0)
        ? prev.receiverList
        : ((bm04Data.receiverList && bm04Data.receiverList.length > 0) ? bm04Data.receiverList : []);
      if (receiverList.length === 0) {
        if (config.pkg_benNhan_ds) {
          try { receiverList = safeParse(config.pkg_benNhan_ds); } catch(e) {}
        } else if (config.pkg_benNhan1) {
          receiverList = [];
          if (config.pkg_benNhan1) receiverList.push({ name: config.pkg_benNhan1, position: config.pkg_benNhan1ChucVu || '', salutation: 'Ông' });
          if (config.pkg_benNhan2) receiverList.push({ name: config.pkg_benNhan2, position: config.pkg_benNhan2ChucVu || '', salutation: 'Ông' });
        }
        if (!receiverList || receiverList.length === 0) {
          receiverList = DEFAULT_RECEIVER_LIST;
        }
      }

      const matCfg = (window as any)._currentMaterialConfig;
      const isEditingHistoricalRecord = !!(currentRecordId || (window as any)._currentRecordId);
      const fixedComp = getFixedSenderCompany(matCfg, config);
      const fixedReps = getFixedSenderRepresentatives(matCfg, config);

      const finalSenderCompany = isEditingHistoricalRecord
        ? (isValidSenderCompany(prev.senderCompany) ? prev.senderCompany : '')
        : fixedComp;

      const finalSenderList = isEditingHistoricalRecord
        ? ((prev.senderList && prev.senderList.length > 0) ? prev.senderList : fixedReps)
        : (fixedReps.length > 0 ? fixedReps : [{ salutation: 'Ông', name: '', position: '' }]);

      const finalReceiverCompany = config.bbnt_benB_congTy || prev.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC';

      setBm04Data(prevBM04 => ({
        ...prevBM04,
        senderCompany: finalSenderCompany,
        senderList: finalSenderList,
        receiverCompany: finalReceiverCompany,
        receiverList: receiverList,
        bbnt_benA_congTy: finalSenderCompany,
        bbnt_benA_daiDien: prevBM04.bbnt_benA_daiDien || config.bbnt_benA_daiDien,
        bbnt_benB_congTy: finalReceiverCompany,
        bbnt_benB_daiDien: config.bbnt_benB_daiDien || prevBM04.bbnt_benB_daiDien,
        grounds: newGrounds,
        soHDNT: config.bbnt_soHDNT || prevBM04.soHDNT,
        ngayKyHD: config.bbnt_ngayKyHD || prevBM04.ngayKyHD,
        maBM02: config.bbnt_maBM02 || prevBM04.maBM02
      }));

      return {
        ...prev,
        senderCompany: finalSenderCompany,
        senderList: finalSenderList,
        receiverCompany: finalReceiverCompany,
        receiverList: receiverList,
        bbnt_benA_congTy: finalSenderCompany,
        bbnt_benA_daiDien: prev.bbnt_benA_daiDien || config.bbnt_benA_daiDien,
        bbnt_benB_congTy: finalReceiverCompany,
        bbnt_benB_daiDien: config.bbnt_benB_daiDien || prev.bbnt_benB_daiDien,
        grounds: newGrounds,
        soHDNT: config.bbnt_soHDNT || prev.soHDNT,
        ngayKyHD: config.bbnt_ngayKyHD || prev.ngayKyHD,
        maBM02: config.bbnt_maBM02 || prev.maBM02
      };
    });
  };

  const applyCauHinhToForms = (config: CauHinh) => {
    apCauHinhVaoBM02(config);
    apCauHinhVaoBBNT(config);
    setLogoUrl(config.logo_base64 || null);

    // Apply material specific config after global config, so it overrides any global defaults
    const activeId = (window as any)._loaiVatTuHienTai || currentMaterialType;
    if (activeId) {
      if ((window as any)._currentMaterialConfig) {
        applyMaterialConfigToForms((window as any)._currentMaterialConfig);
      } else {
        // Fetch on the fly if not already in memory
        MaterialTypeService.getMaterialTypeConfig(activeId).then(matConfig => {
          const activeMatObj = danhSachVatTu.find(v => v.id === activeId);
          const enriched = enrichMaterialConfig(matConfig, activeId, activeMatObj?.ten || activeId);
          (window as any)._currentMaterialConfig = enriched;
          applyMaterialConfigToForms(enriched);
        }).catch(err => {
          console.error("Lỗi khi load cấu hình vật tư trong applyCauHinhToForms:", err);
        });
      }
    }
  };

  useEffect(() => {
    (window as any).applyCauHinhToForms = applyCauHinhToForms;
    (window as any).applyMaterialConfigToForms = applyMaterialConfigToForms;
  });

  const handleOpenSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setIsApiKeySelected(true);
    }
  };

  const loadMaterialPrices = async (targetLoai?: string) => {
    try {
      const activeLoai = targetLoai || (window as any)._loaiVatTuHienTai || currentMaterialType || 'BeTong';
      const result = await MaterialService.getDanhSachVatTu(activeLoai);
      
      let vatTu: any[] = [];
      if (Array.isArray(result)) {
        vatTu = result;
      } else if (result && result.vatTu) {
        vatTu = result.vatTu;
      }

      setMaterialPrices(vatTu);

      // Auto-match items in bm02Data if any rows exist with the selected material category catalog
      setBm02Data(prev => {
        if (!prev.items || prev.items.length === 0 || vatTu.length === 0) return prev;
        const autoUpdated = (prev.items || []).map(row => {
          if (!row.name || !row.name.trim()) return row;
          const match = timGiaVatTu(row.name, vatTu);
          if (match) {
            const matName = match.tenVatTu || (match as any).name || row.name;
            const matUnit = match.donVi || (match as any).unit || row.unit || 'm3';
            const { price, dateLabel } = getPriceForDate(match, row.selectedPriceDate || selectedPriceDate);
            const masterPrice = Number(match.unitPrice) || 0;
            const finalPrice = price > 0 ? price : (masterPrice > 0 ? masterPrice : (Number(row.unitPrice) || 0));

            return {
              ...row,
              name: matName,
              unit: matUnit,
              unitPrice: finalPrice,
              total: Math.round((Number(row.quantity) || 0) * finalPrice),
              priceFound: finalPrice > 0,
              priceDate: dateLabel || 'Đơn giá danh mục',
              matchedCatalogId: match.id,
              isMatchedWithCatalog: true,
              matchedCatalogName: matName,
              originalCatalogData: {
                name: matName,
                unit: matUnit,
                unitPrice: finalPrice,
                maVatTu: match.id
              }
            };
          }
          return row;
        });
        return BM02PriceUpdateService.recalculateBM02Totals({ ...prev, items: autoUpdated });
      });

      // Also sync BBNT items
      setBbntData(prev => {
        if (!prev.items || prev.items.length === 0 || vatTu.length === 0) return prev;
        const autoUpdated = (prev.items || []).map(bRow => {
          if (!bRow.description || !bRow.description.trim()) return bRow;
          const match = timGiaVatTu(bRow.description, vatTu);
          if (match) {
            const matName = match.tenVatTu || (match as any).name || bRow.description;
            const matUnit = match.donVi || (match as any).unit || bRow.unit || 'm3';
            const { price } = getPriceForDate(match, selectedPriceDate);
            const masterPrice = Number(match.unitPrice) || 0;
            const finalPrice = price > 0 ? price : (masterPrice > 0 ? masterPrice : (Number(bRow.unitPrice) || 0));
            const q = Number(bRow.acceptedQty ?? bRow.requestedQty) || 0;
            return {
              ...bRow,
              description: matName,
              unit: matUnit,
              unitPrice: finalPrice,
              total: Math.round(q * finalPrice)
            };
          }
          return bRow;
        });
        return { ...prev, items: autoUpdated };
      });
    } catch (error) {
      console.error("Lỗi loadMaterialPrices:", error);
    }
  };

  const loadPriceDateOptions = async (targetLoai?: string) => {
    try {
      const activeLoai = targetLoai || (window as any)._loaiVatTuHienTai || currentMaterialType || 'BeTong';
      const data = await MaterialService.getDanhSachNgay(activeLoai);
      let options = data || [];

      // Nếu getDanhSachNgay không có data, thử lấy từ getDanhSachVatTu
      if (options.length === 0) {
        const result = await MaterialService.getDanhSachVatTu(activeLoai);
        if (result && result.cotNgay) {
          options = result.cotNgay.map((col: string) => ({
            value: col,
            label: col.replace('giaGoc_', '').replace('gia_', '').replace('giaGoc', 'Giá gốc')
          }));
        }
      }

      if (options.length > 0) {
        // Backend đã sắp xếp sẵn nhưng ta vẫn sort cho chắc
        const sortedData = [...options].sort((a, b) => {
          if (a.value === 'giaGoc') return 1;
          if (b.value === 'giaGoc') return -1;
          return b.value.localeCompare(a.value);
        });
        setPriceDateOptions(sortedData);
        
        const latestDate = sortedData[0].value;
        setSelectedPriceDate(latestDate);
        
        // Tự động nạp giá mới nhất vào bộ nhớ
        await MaterialService.getDanhSachVatTu(activeLoai);
      }
    } catch (error) {
      console.error("Lỗi loadPriceDateOptions:", error);
    }
  };

  const getPriceForDate = (material: MaterialPrice | any, dateValue: string) => {
    if (!material) return { price: 0, dateLabel: "N/A" };

    const directPrice = Number(material.unitPrice || 0);

    // 1. Kiểm tra ngày trong object gia nếu có
    if (material.gia && typeof material.gia === 'object') {
      if (material.gia[dateValue] !== undefined && Number(material.gia[dateValue]) > 0) {
        const dateLabel = priceDateOptions.find(d => d.value === dateValue)?.label || dateValue;
        return { price: Number(material.gia[dateValue]), dateLabel };
      }

      if (dateValue === 'giaGoc') {
        if (Number(material.gia.giaGoc) > 0) {
          return { price: Number(material.gia.giaGoc), dateLabel: "Giá gốc" };
        }
        const giaGocKey = Object.keys(material.gia).find(k => k.startsWith('giaGoc'));
        if (giaGocKey && Number(material.gia[giaGocKey]) > 0) {
          return { price: Number(material.gia[giaGocKey]), dateLabel: "Giá gốc" };
        }
      }

      const fuzzyKey = Object.keys(material.gia).find(k => k.includes(dateValue));
      if (fuzzyKey && Number(material.gia[fuzzyKey]) > 0) {
        const dateLabel = priceDateOptions.find(d => d.value === dateValue)?.label || dateValue;
        return { price: Number(material.gia[fuzzyKey]), dateLabel };
      }

      if (material.gia.giaGoc && Number(material.gia.giaGoc) > 0) {
        return { price: Number(material.gia.giaGoc), dateLabel: "Giá gốc" };
      }

      const priceVals = Object.keys(material.gia)
        .map(k => ({ key: k, val: Number(material.gia[k]) }))
        .filter(x => !isNaN(x.val) && x.val > 0);
      if (priceVals.length > 0) {
        return { price: priceVals[priceVals.length - 1].val, dateLabel: "Đơn giá danh mục" };
      }
    }

    // 2. Direct unitPrice from Master Catalog (cauHinh/materialItems)
    if (directPrice > 0) {
      return { price: directPrice, dateLabel: "Đơn giá danh mục" };
    }

    return { price: 0, dateLabel: "Chưa có đơn giá" };
  };

  const normalize = (str: string) => {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const diceCoefficient = (s1: string, s2: string) => {
    const n1 = normalize(s1);
    const n2 = normalize(s2);
    if (n1 === n2) return 1;
    if (n1.length < 2 || n2.length < 2) return 0;

    const bigrams1 = new Map();
    for (let i = 0; i < n1.length - 1; i++) {
      const bigram = n1.substring(i, i + 2);
      bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
    }

    let intersection = 0;
    for (let i = 0; i < n2.length - 1; i++) {
      const bigram = n2.substring(i, i + 2);
      const count = bigrams1.get(bigram) || 0;
      if (count > 0) {
        intersection++;
        bigrams1.set(bigram, count - 1);
      }
    }

    return (2 * intersection) / (n1.length + n2.length - 2);
  };

  const getLatestPriceInfo = (material: MaterialPrice | any) => {
    if (!material) return { price: 0, dateLabel: "N/A" };
    const directPrice = Number(material.unitPrice || 0);

    if (selectedPriceDate) {
      const info = getPriceForDate(material, selectedPriceDate);
      if (info.price > 0) return info;
    }

    for (const opt of priceDateOptions) {
      const info = getPriceForDate(material, opt.value);
      if (info.price > 0) return info;
    }

    if (directPrice > 0) {
      return { price: directPrice, dateLabel: "Đơn giá danh mục" };
    }

    return { price: 0, dateLabel: "Giá gốc" };
  };

  const timGiaVatTu = (tenNhap: string, danhSachGia: (MaterialPrice | any)[]) => {
    if (!tenNhap || !tenNhap.trim() || !danhSachGia || danhSachGia.length === 0) return null;
    const normNhap = normalize(tenNhap);
    const cleanNhap = cleanMaterialName(tenNhap);

    const getMatName = (m: any) => m.tenVatTu || m.name || '';

    // Step 0: Check saved alias mapping if any
    try {
      const aliasMap = MaterialMatchingService.getAliasMappings();
      if (aliasMap && aliasMap[cleanNhap]) {
        const al = aliasMap[cleanNhap];
        const found = danhSachGia.find(m => m.id === al.matchedMaterialId || cleanMaterialName(getMatName(m)) === cleanMaterialName(al.matchedName));
        if (found) return found;
      }
    } catch (e) {}

    // Step 1: Exact match after normalization
    let match = danhSachGia.find(m => normalize(getMatName(m)) === normNhap);
    if (match) return match;

    // Step 1b: Clean name match (removes accents, phi/d, special characters)
    let cleanMatch = danhSachGia.find(m => cleanMaterialName(getMatName(m)) === cleanNhap);
    if (cleanMatch) return cleanMatch;

    // Step 2: Diameter match for steel / rebar (e.g. phi 6, d8, d10, thep 12)
    const diamNhap = extractDiameter(tenNhap);
    if (diamNhap !== null) {
      const diamMatches = danhSachGia.filter(m => extractDiameter(getMatName(m)) === diamNhap);
      if (diamMatches.length === 1) return diamMatches[0];
      if (diamMatches.length > 1) {
        let best = diamMatches[0];
        let bestScore = diceCoefficient(tenNhap, getMatName(best));
        for (let i = 1; i < diamMatches.length; i++) {
          const score = diceCoefficient(tenNhap, getMatName(diamMatches[i]));
          if (score > bestScore) {
            bestScore = score;
            best = diamMatches[i];
          }
        }
        return best;
      }
    }

    // Step 2b: Concrete Grade match (e.g. M150, M200, M250, M300, M350)
    const gradeNhap = extractConcreteGrade(tenNhap);
    if (gradeNhap !== null) {
      const gradeMatches = danhSachGia.filter(m => extractConcreteGrade(getMatName(m)) === gradeNhap);
      if (gradeMatches.length === 1) return gradeMatches[0];
      if (gradeMatches.length > 1) {
        let best = gradeMatches[0];
        let bestScore = diceCoefficient(tenNhap, getMatName(best));
        for (let i = 1; i < gradeMatches.length; i++) {
          const score = diceCoefficient(tenNhap, getMatName(gradeMatches[i]));
          if (score > bestScore) {
            bestScore = score;
            best = gradeMatches[i];
          }
        }
        return best;
      }
    }

    // Step 2c: Keyword match (numbers like M300, units like phi 6, types like bê tông)
    const codes = normNhap.match(/[m]\d+|phi\s*\d+/g) || [];
    const types = ["be tong", "cat", "da", "sat", "thep", "xi mang", "gach"].filter(t => normNhap.includes(t));
    
    if (codes.length > 0 || types.length > 0) {
      const keywordMatches = danhSachGia.filter(m => {
        const normM = normalize(getMatName(m));
        return codes.every(c => normM.includes(c)) && types.every(t => normM.includes(t));
      });
      if (keywordMatches.length === 1) return keywordMatches[0];
      if (keywordMatches.length > 1) {
        let best = keywordMatches[0];
        let bestScore = diceCoefficient(tenNhap, getMatName(best));
        for (let i = 1; i < keywordMatches.length; i++) {
          const score = diceCoefficient(tenNhap, getMatName(keywordMatches[i]));
          if (score > bestScore) {
            bestScore = score;
            best = keywordMatches[i];
          }
        }
        return best;
      }
    }

    // Step 3: Fuzzy match (similarity score > 45%)
    let bestMatch = null;
    let maxScore = 0;
    for (const m of danhSachGia) {
      const name = getMatName(m);
      const score = diceCoefficient(tenNhap, name);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = m;
      }
    }

    if (maxScore > 0.45) return bestMatch;

    return null;
  };

  const handleMaterialSearch = (id: string, value: string) => {
    updateBM02Item(id, 'name', value);
    if (!value || !value.trim()) {
      setSuggestions(materialPrices || []);
      setFocusedItemId(id);
      return;
    }
    
    const normValue = normalize(value);
    const cleanVal = cleanMaterialName(value);
    const diamVal = extractDiameter(value);
    const gradeVal = extractConcreteGrade(value);

    const filtered = (materialPrices || []).filter(m => {
      const name = m.tenVatTu || (m as any).name || '';
      const normM = normalize(name);
      const cleanM = cleanMaterialName(name);

      if (normM.includes(normValue) || cleanM.includes(cleanVal)) return true;
      if (diamVal !== null && extractDiameter(name) === diamVal) return true;
      if (gradeVal !== null && extractConcreteGrade(name) === gradeVal) return true;
      return diceCoefficient(value, name) > 0.2;
    }).sort((a, b) => {
      const nameA = a.tenVatTu || (a as any).name || '';
      const nameB = b.tenVatTu || (b as any).name || '';
      const scoreA = diceCoefficient(value, nameA);
      const scoreB = diceCoefficient(value, nameB);
      return scoreB - scoreA;
    });
    
    setSuggestions(filtered);
    setFocusedItemId(id);
  };

  const selectMaterial = async (id: string, material: MaterialPrice | any, specificDate?: string) => {
    const matName = material.tenVatTu || material.name || '';
    const matUnit = material.donVi || material.unit || 'm3';
    const dateToUse = specificDate || selectedPriceDate;
    let { price, dateLabel } = getPriceForDate(material, dateToUse);
    const effectivePrice = price > 0 ? price : (Number(material.unitPrice) || 0);

    // Look up in estimateItems to see if there is a stored basePrice
    try {
      const rowItem = (bm02Data.items || []).find(x => x.id === id);
      const rowProj = rowItem?.projectId || (bm02Data.selectedUnits && bm02Data.selectedUnits[0]?.projectId) || "";
      const rowUnit = rowItem?.unitId || (bm02Data.selectedUnits && bm02Data.selectedUnits[0]?.unitId) || "";

      const matchedEstPrice = await OrderService.getEstimateItemPrice(matName, rowProj, rowUnit);
      if (matchedEstPrice > 0) {
        price = matchedEstPrice;
        dateLabel = "Đơn giá dự toán";
      }
    } catch (err) {
      console.error("Lỗi khi tra cứu giá dự toán:", err);
    }

    const finalPrice = price > 0 ? price : effectivePrice;

    // Save alias mapping for user's explicit selection
    const rowItem = (bm02Data.items || []).find(x => x.id === id);
    const rawOcr = (rowItem as any)?.originalOcrName || rowItem?.name || matName;
    if (rawOcr && rawOcr !== matName) {
      MaterialMatchingService.saveAliasMapping(rawOcr, {
        id: material.id,
        tenVatTu: matName,
        donVi: matUnit,
        giaHienHanh: finalPrice
      });
    }

    setBm02Data(prev => {
      const items = prev.items || [];
      const newItems = items.map(item => {
        if (item.id === id) {
          const updated = { 
            ...item, 
            name: matName, 
            unit: matUnit, 
            unitPrice: finalPrice,
            total: (Number(item.quantity) || 0) * finalPrice,
            priceFound: finalPrice > 0,
            priceDate: dateLabel || 'Đơn giá danh mục',
            selectedPriceDate: dateToUse,
            matchedCatalogId: material.id,
            isMatchedWithCatalog: true,
            matchedCatalogName: matName,
            originalCatalogData: {
              name: matName,
              unit: matUnit,
              unitPrice: finalPrice,
              maVatTu: material.id
            }
          };
          return updated;
        }
        return item;
      });
      return BM02PriceUpdateService.recalculateBM02Totals({ ...prev, items: newItems });
    });

    // Sync with BBNT
    setBbntData(prev => {
      const items = prev.items || [];
      const newItems = items.map(item => {
        if (item.id === id) {
          return { 
            ...item, 
            description: matName, 
            unit: matUnit 
          };
        }
        return item;
      });
      return { ...prev, items: newItems };
    });

    setSuggestions([]);
    setFocusedItemId(null);
  };

  const apGiaVaoToanBoBang = (targetDate: string, prices: MaterialPrice[]) => {
    const dateLabel = priceDateOptions.find(d => d.value === targetDate)?.label || "Giá gốc";
    let count = 0;
    
    setBm02Data(prev => {
      const currentItems = prev.items || [];
      const newItems = currentItems.map(item => {
        const material = timGiaVatTu(item.name, prices);
        if (material) {
          const matName = material.tenVatTu || (material as any).name || item.name;
          const matUnit = material.donVi || (material as any).unit || item.unit || 'm3';
          const { price, dateLabel: actualLabel } = getPriceForDate(material, targetDate);
          const finalPrice = price > 0 ? price : (Number(material.unitPrice) || Number(item.unitPrice) || 0);
          if (finalPrice > 0) count++;
          return {
            ...item,
            name: matName,
            unit: matUnit,
            unitPrice: finalPrice,
            total: (Number(item.quantity) || 0) * finalPrice,
            priceFound: finalPrice > 0,
            priceDate: actualLabel || 'Đơn giá danh mục',
            selectedPriceDate: targetDate,
            matchedCatalogId: material.id,
            isMatchedWithCatalog: true,
            matchedCatalogName: matName
          };
        }
        return {
          ...item,
          priceFound: (Number(item.unitPrice) || 0) > 0,
          priceDate: "",
          selectedPriceDate: targetDate
        };
      });
      return BM02PriceUpdateService.recalculateBM02Totals({ ...prev, items: newItems });
    });

    setBbntData(prev => {
      const newItems = (prev.items || []).map(it => {
        const material = timGiaVatTu(it.name, prices);
        if (material) {
          return { ...it, unit: material.donVi || (material as any).unit || it.unit };
        }
        return it;
      });
      return { ...prev, items: newItems };
    });

    if (count > 0) {
      setToast({ type: 'success', message: `Đã cập nhật đơn giá cho ${count} vật tư theo ngày [${dateLabel}]!` });
    }
  };

  const updateLatestPrices = async (dateValue?: string) => {
    const targetDate = dateValue || selectedPriceDate;
    
    setIsProcessing(true);
    // Refresh material prices first to ensure we have the latest data
    const activeLoai = (window as any)._loaiVatTuHienTai || 'BeTong';
    const result = await MaterialService.getDanhSachVatTu(activeLoai);
    if (result && result.vatTu) {
      const latestPrices = result.vatTu;
      setMaterialPrices(latestPrices);
      // We need to pass the latest prices directly because state update is async
      apGiaVaoToanBoBang(targetDate, latestPrices);
    }
    setIsProcessing(false);
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadRecords = async () => {
    setIsLoadingRecords(true);
    try {
      const rawOrders = await ReportService.loadAllRawOrders(true);
      const mapped = (rawOrders || []).map(r => {
        const code = extractMaPhieu(r) || r.maPhieu || r.docNumber || r.id;
        const total = r.grandTotal || r.tongTien || r.totalWithTax || 0;
        const recTitle = r.mucDichSuDungNoiDung || r.tieuDe || r.title || r.purpose || 'Phiếu trình vật tư';
        const recLoc = r.mucDichSuDungDiaDiem || r.location || r.diaDiem || r.duAn || '';
        const recType = r.loaiTaiLieu || r.type || 'BM02';

        return {
          ...r,
          id: r.id || code,
          docNumber: r.docNumber || r.id || code,
          maPhieu: code,
          maPhieuNguon: code,
          title: recTitle,
          mucDichSuDungNoiDung: recTitle,
          mucDichSuDungDiaDiem: recLoc,
          diaDiem: recLoc,
          loaiTaiLieu: recType,
          type: recType,
          loaiVatTu: r.loaiVatTu || 'BeTong',
          ngayLap: r.date || r.orderDate || r.ngayLap || '',
          createdAt: r.createdAt || r.updatedAt || Date.now(),
          updatedAt: r.updatedAt || r.createdAt || Date.now(),
          tongTien: total,
          totalWithTax: total,
          grandTotal: total,
          items: r.items || [],
          selectedItems: r.selectedItems || r.items || [],
          trangThai: r.trangThai || 'Đã lưu'
        };
      });
      setSavedRecords(mapped);
    } catch (err) {
      console.warn("Lỗi đồng bộ lịch sử trình vật tư từ ReportService:", err);
    } finally {
      setIsLoadingRecords(false);
    }
  };


  const saveBM06 = async () => {
    if ((window as any)._triggerBM06Save) {
      await (window as any)._triggerBM06Save();
      ReportService.clearCache();
      await loadRecords();
      setReportRefreshTrigger(prev => prev + 1);
    } else {
      setToast({ message: "Không tìm thấy chức năng lưu BM06", type: 'error' });
    }
  };

  const saveUnifiedSnapshot = async (skipPriceConfirm: boolean = false, skipDuplicateConfirm: boolean = false) => {
    setIsSaving(true);
    const now = Date.now();

    // Check mandatory Mã phiếu field
    const maPhieuVal = (bm02Data.maPhieu || '').trim();
    if (!maPhieuVal) {
      setIsSaving(false);
      setToast({ message: "Vui lòng nhập Mã phiếu trước khi lưu dữ liệu.", type: 'error' });
      return;
    }

    // Check duplicate Mã phiếu against existing snapshots
    const isDup = (savedRecords || []).some(r => {
      const rId = r.id || r.snapshotId;
      if (currentRecordId && (rId === currentRecordId || rId.replace('BM02-', '') === currentRecordId.replace('BM02-', ''))) {
        return false;
      }
      const existingCode = (r.maPhieu || r.bm02?.maPhieu || r.bm032?.maPhieu || r.maPhieuNguon || '').trim().toLowerCase();
      if (maPhieuVal.toLowerCase() === 'xdijc-qtmh-bm01-' || existingCode === 'xdijc-qtmh-bm01-') return false;
      return existingCode === maPhieuVal.toLowerCase();
    });

    if (isDup && !skipDuplicateConfirm) {
      setIsSaving(false);
      setShowDuplicateCodeModal(true);
      return;
    }

    // 1. Recalculate BM02
    const validBM02Items = (bm02Data.items || []).filter((it: any) => isValidEstimateItem(it));
    const recalculatedBM02 = BM02PriceUpdateService.recalculateBM02Totals({
      ...bm02Data,
      items: validBM02Items
    });

    const processedBM02Items = recalculatedBM02.items || [];

    // Check missing price / incomplete material in BM02 items
    if (!skipPriceConfirm) {
      const missingItem = processedBM02Items.find((it: any) => !it.name?.trim() || !it.unit?.trim() || !it.unitPrice || Number(it.unitPrice) <= 0);
      if (missingItem) {
        setIsSaving(false);
        setToast({ 
          message: `Vật tư "${missingItem.name || 'chưa tên'}" chưa có đầy đủ Tên, ĐVT hoặc Đơn giá. Vui lòng kiểm tra và nhập đủ thông tin để lưu.`, 
          type: 'error' 
        });
        return;
      }
    }

    // Auto-sync any un-matched items to Master Catalog & save Alias
    const activeLoaiCatalog = (window as any)._loaiVatTuHienTai || currentMaterialType || 'BeTong';
    for (const item of processedBM02Items) {
      if (!item.matchedCatalogId || !item.isMatchedWithCatalog) {
        try {
          const catalogItem = await MaterialMatchingService.addNewMaterialToCatalog(activeLoaiCatalog, {
            name: item.name.trim(),
            unit: item.unit.trim(),
            unitPrice: Number(item.unitPrice)
          });
          if (catalogItem) {
            item.matchedCatalogId = catalogItem.id;
            item.isMatchedWithCatalog = true;
            item.matchedCatalogName = catalogItem.tenVatTu;
            const ocrName = item.originalOcrName || item.name;
            MaterialMatchingService.saveAliasMapping(ocrName, catalogItem);
          }
        } catch (e) {
          console.error('Lỗi tự động đồng bộ Danh mục khi lưu Snapshot:', e);
        }
      }
    }

    setBm02Data(recalculatedBM02);

    // 2. Prepare BM03.2 (BBNT)
    const validBM02ItemIds = processedBM02Items.map((it: any) => it.id).filter(Boolean);
    
    const matchedIndicesForSave = new Set<number>();
    const processedBBNTItems = processedBM02Items.map((bm02Item: any, idx: number) => {
      let existingBBNTItem: any = null;
      const bm02IdStr = String(bm02Item.id || '');

      if (bm02IdStr) {
         const foundIdx = bbntData?.items?.findIndex((b: any, bIdx: number) => {
           if (matchedIndicesForSave.has(bIdx)) return false;
           const bIdStr = String(b.id || '');
           return bIdStr === bm02IdStr || bIdStr.includes(bm02IdStr) || bm02IdStr.includes(bIdStr);
         });
         if (foundIdx !== undefined && foundIdx !== -1) {
             existingBBNTItem = bbntData.items[foundIdx];
             matchedIndicesForSave.add(foundIdx);
         }
      }

      if (!existingBBNTItem && bbntData?.items?.[idx] && !matchedIndicesForSave.has(idx)) {
         existingBBNTItem = bbntData.items[idx];
         matchedIndicesForSave.add(idx);
      }

      if (!existingBBNTItem) {
          const cleanItemName = (bm02Item.name || '').trim().toLowerCase();
          const foundIdx = bbntData?.items?.findIndex((b: any, bIdx: number) => {
            if (matchedIndicesForSave.has(bIdx)) return false;
            const cleanDesc = stripAppliedUnitsSuffix(b.description || b.name || '').trim().toLowerCase();
            return cleanItemName && cleanDesc && (cleanDesc === cleanItemName || cleanDesc.startsWith(cleanItemName) || cleanItemName.startsWith(cleanDesc));
          });
          if (foundIdx !== undefined && foundIdx !== -1) {
              existingBBNTItem = bbntData.items[foundIdx];
              matchedIndicesForSave.add(foundIdx);
          }
      }

      const reqQty = Number(bm02Item.quantity || bm02Item.orderQty || 0);
      const isCustom = existingBBNTItem?.isCustomAcceptedQty === true &&
                       existingBBNTItem?.acceptedQty !== undefined && 
                       existingBBNTItem?.acceptedQty !== null && 
                       String(existingBBNTItem.acceptedQty).trim() !== '' &&
                       Number(existingBBNTItem.acceptedQty) !== Number(existingBBNTItem.requestedQty);
      const accQty = isCustom
          ? Number(existingBBNTItem.acceptedQty) 
          : reqQty;
      // Ghi chú của BM03.2 và BM04: đồng bộ theo BM02
      const noteVal = bm02Item.note !== undefined ? bm02Item.note : (existingBBNTItem?.note || '');

      return {
        ...(existingBBNTItem || {}),
        id: bm02Item.id || `BM02-itm-${idx + 1}`,
        stt: idx + 1,
        description: bm02Item.name,
        unit: bm02Item.unit || '',
        requestedQty: reqQty,
        acceptedQty: accQty,
        isCustomAcceptedQty: isCustom,
        note: noteVal,
        unitPrice: Number(bm02Item.unitPrice || 0),
        total: accQty * Number(bm02Item.unitPrice || 0),
        projectId: bm02Item.projectId || existingBBNTItem?.projectId || '',
        unitId: bm02Item.unitId || existingBBNTItem?.unitId || '',
        isSharedCost: bm02Item.isSharedCost || false,
        isGroupedEstimate: bm02Item.isGroupedEstimate || false
      };
    });

    const fixedSenderRepsForSave = getFixedSenderRepresentatives((window as any)._currentMaterialConfig, (window as any)._cauHinh);
    const resolvedSenderListSave = hasValidRepresentatives(bbntData?.senderList)
      ? bbntData.senderList
      : (hasValidRepresentatives(bm04Data?.senderList)
        ? bm04Data.senderList
        : (fixedSenderRepsForSave.length > 0 ? fixedSenderRepsForSave : [{ salutation: 'Ông', name: '', position: '' }]));

    // Determine IDs based on Mã phiếu
    let rawId = maPhieuVal.replace(/^BM02-/i, '').replace(/^BM03\.2-/i, '').replace(/^BM06-/i, '').trim();
    if (!rawId) {
      if (currentRecordId) {
        rawId = String(currentRecordId).replace('BM02-', '').replace('BM03.2-', '').replace('BM06-', '');
      } else {
        rawId = `new-${now}`;
      }
    }

    const snapshotId = `BM02-${rawId}`;
    const bm032DocId = `BM03.2-${rawId}`;

    const loaiVatTu = (window as any)._loaiVatTuHienTai || 'BeTong';

    let createdAt = now;
    if (currentRecordId) {
      const current = savedRecords.find(r => r.id === currentRecordId || r.snapshotId === currentRecordId);
      if (current) {
        createdAt = current.createdAt || current.updatedAt || now;
      }
    }

    const unifiedLoc = bm02Data.mucDichSuDungDiaDiem || bm02Data.location || bbntData?.address || '';

    const updatedBBNTData: BBNTData = {
      ...INITIAL_BM03,
      ...bbntData,
      formType: 'BM03.2',
      docNumber: 'QTMH-BM03.2',
      id: bm032DocId,
      items: processedBBNTItems,
      project: bbntData?.project || bm02Data.project_name || '',
      category: bbntData?.category || bm02Data.mucDichSuDungNoiDung || '',
      address: unifiedLoc,
      locationDetail: unifiedLoc,
      senderCompany: bbntData?.senderCompany || bm02Data.proposingCompany || '',
      senderList: resolvedSenderListSave,
      receiverCompany: bbntData?.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
      receiverList: (bbntData?.receiverList && bbntData.receiverList.length > 0) ? bbntData.receiverList : DEFAULT_RECEIVER_LIST,
      maPhieu: maPhieuVal,
      maPhieuNguon: maPhieuVal,
      updatedAt: now,
      createdAt: createdAt
    };

    setBbntData(updatedBBNTData);

    const bm04DocId = `BM04-${rawId}`;
    const targetBM04DateSave = (bm04Data?.date && !bm04Data.date.includes('...') && !bm04Data.date.includes('2025'))
      ? bm04Data.date
      : (updatedBBNTData.date || addOneDayToString(recalculatedBM02.date) || recalculatedBM02.date || '');
    const targetBM04OrigName = bm04Data?.originalFileName || updatedBBNTData.originalFileName || recalculatedBM02.originalFileName || (typeof window !== 'undefined' && ((window as any)._currentOriginalFileName || (window as any)._currentBM02FileName)) || '';

    const updatedBM04Data: BBNTData = {
      ...INITIAL_BM04,
      ...bm04Data,
      id: bm04DocId,
      formType: 'BM04',
      title: bm04Data?.title || (window as any)?._currentMaterialConfig?.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
      docNumber: 'QTMH-BM04',
      date: targetBM04DateSave,
      startDate: (bm04Data?.startDate && !bm04Data.startDate.includes('...') && !bm04Data.startDate.includes('2025')) ? bm04Data.startDate : targetBM04DateSave,
      endDate: (bm04Data?.endDate && !bm04Data.endDate.includes('...') && !bm04Data.endDate.includes('2025')) ? bm04Data.endDate : targetBM04DateSave,
      originalFileName: targetBM04OrigName,
      items: processedBBNTItems,
      project: bm04Data?.project || bbntData?.project || bm02Data.project_name || '',
      category: bm04Data?.category || bbntData?.category || bm02Data.mucDichSuDungNoiDung || '',
      address: unifiedLoc,
      locationDetail: unifiedLoc,
      senderCompany: bm04Data?.senderCompany || bbntData?.senderCompany || bm02Data.proposingCompany || '',
      receiverCompany: bm04Data?.receiverCompany || bbntData?.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
      senderList: (bm04Data?.senderList && bm04Data.senderList.length > 0 && hasValidRepresentatives(bm04Data.senderList)) ? bm04Data.senderList : (resolvedSenderListSave || []),
      receiverList: (bm04Data?.receiverList && bm04Data.receiverList.length > 0) ? bm04Data.receiverList : (updatedBBNTData.receiverList || DEFAULT_RECEIVER_LIST),
      maPhieu: maPhieuVal,
      maPhieuNguon: maPhieuVal,
      updatedAt: now,
      createdAt: createdAt
    };

    setBm04Data(updatedBM04Data);

    const subTotalValue = recalculatedBM02.totalAmount;
    const taxRateValue = recalculatedBM02.taxRate;
    const vatAmountValue = recalculatedBM02.taxAmount;
    const totalAmountWithVatValue = recalculatedBM02.totalAmountWithVat;
    const showVatValue = recalculatedBM02.showVat;
    const isPostTaxValue = recalculatedBM02.isPostTax;
    const vatSnapshot = recalculatedBM02.vatSnapshot;

    // Single Unified Snapshot
    const snapshotPayload: any = {
      id: snapshotId,
      snapshotId: snapshotId,
      maPhieu: maPhieuVal,
      maPhieuNguon: maPhieuVal,
      createdAt: createdAt,
      updatedAt: now,
      status: "Đã lưu",
      trangThai: "Đã lưu",
      
      // Top-level meta
      tieuDe: bm02Data.title,
      docNumber: (bm02Data.docNumber && bm02Data.docNumber !== 'QTMH-BM02') ? bm02Data.docNumber : maPhieuVal,
      loaiTaiLieu: "BM02",
      loaiVatTu: loaiVatTu,
      ngayLap: bm02Data.date,
      nguoiLap: bm02Data.proposingCompany || bm02Data.nguoiLap || "Admin",
      diaDiem: unifiedLoc,
      location: bm02Data.location || 'Tp. Hồ Chí Minh',
      mucDichSuDungDiaDiem: unifiedLoc,
      tongTien: totalAmountWithVatValue,
      project: bm02Data.project_name || bbntData?.project || '',
      category: bm02Data.mucDichSuDungNoiDung || bbntData?.category || '',
      supplier: bm02Data.proposingCompany || bbntData?.senderCompany || '',

      // 01 Snapshot holding both forms
      bm02: {
        ...recalculatedBM02,
        maPhieu: maPhieuVal,
        maPhieuNguon: maPhieuVal,
        location: bm02Data.location || 'Tp. Hồ Chí Minh',
        mucDichSuDungDiaDiem: unifiedLoc,
        items: processedBM02Items,
        danhSachVatTu: processedBM02Items,
        kyTenList: kyTenBM02
      },
      bm032: updatedBBNTData,
      bbntData: updatedBBNTData,
      bm04: updatedBM04Data,
      bm04Data: updatedBM04Data,
      kyTenBM02: kyTenBM02,
      kyTenList: kyTenBM02,

      // Flattened metadata
      taxRate: taxRateValue,
      taxAmount: vatAmountValue,
      totalWithTax: totalAmountWithVatValue,
      totalAmountWithVat: totalAmountWithVatValue,
      totalAmount: subTotalValue,
      showVat: showVatValue !== undefined ? Boolean(showVatValue) : false,
      showVAT: showVatValue !== undefined ? Boolean(showVatValue) : false,
      isPostTax: isPostTaxValue !== undefined ? Boolean(isPostTaxValue) : false,
      vatSnapshot: vatSnapshot,
      recipients: bm02Data.recipients || [],
      grounds: bm02Data.grounds || [],
      phongKeToan: bm02Data.phongKeToan,
      nguoiLapTen: bm02Data.nguoiLap,
      giamDoc: bm02Data.giamDoc,
      duyetHDTV: bm02Data.duyetHDTV,
      mucDichSuDungNoiDung: bm02Data.mucDichSuDungNoiDung || "",
      soTienBangChu: bm02Data.soTienBangChu || "",
      isCustomSoTienBangChu: bm02Data.isCustomSoTienBangChu,
      thoiHanThanhToan: bm02Data.thoiHanThanhToan || "",
      receiverCompany: updatedBBNTData.receiverCompany || '',
      receiverList: updatedBBNTData.receiverList || [],
      senderCompany: updatedBBNTData.senderCompany || '',
      senderList: updatedBBNTData.senderList || [],
      pkg_tenBenGiao: updatedBBNTData.senderCompany || '',
      pkg_benGiao_ds: JSON.stringify(updatedBBNTData.senderList || []),
      pkg_benNhan_ds: JSON.stringify(updatedBBNTData.receiverList || []),
      pkg_benNhan1: updatedBBNTData.receiverList?.[0]?.name || '',
      pkg_benNhan1ChucVu: updatedBBNTData.receiverList?.[0]?.position || '',
      pkg_benNhan2: updatedBBNTData.receiverList?.[1]?.name || '',
      pkg_benNhan2ChucVu: updatedBBNTData.receiverList?.[1]?.position || '',
      items: processedBM02Items,
      danhSachVatTu: processedBM02Items.map((it: any) => ({
        ...it,
        priceDate: it.priceDate || "",
        selectedPriceDate: it.selectedPriceDate || ""
      })),
      originalFileName: bm02Data.originalFileName || bbntData?.originalFileName || "",
      selectedUnits: bm02Data.selectedUnits || [],
      isGroupedDisplay: bm02Data.isGroupedDisplay || false,
      displayMode: bm02Data.displayMode || 'DETAILED',
      sourceType: bm02Data.sourceType || 'PDF',
      cauHinh: danhSachVatTu
    };

    try {
      const rtdbUpdates: Record<string, any> = {};

      if (bm02Data.sourceType === 'BM06') {
        const bm06Id = `BM06-${rawId}`;
        let previousBM06Record: any = null;
        try {
          previousBM06Record = await OrderService.getBM06Record(bm06Id);
        } catch (e) {
          console.warn("Could not load previous BM06 record:", e);
        }

        const oldItemsMap: Record<string, number> = {};
        if (previousBM06Record) {
          const oldItems = previousBM06Record.selectedItems || previousBM06Record.items || [];
          oldItems.forEach((it: any) => {
            const itemId = it.itemId || it.id || it.estimateItemId;
            if (itemId) {
              oldItemsMap[itemId] = Number(it.orderQty || it.quantity || 0);
            }
          });
        }

        const updatedSelectedItems = (currentBM06Record?.selectedItems || []).map((bm06Item: any) => {
          const matchedBM02Item = processedBM02Items.find((x: any) => x.name === bm06Item.name && x.unitId === bm06Item.unitId && x.projectId === bm06Item.projectId) || processedBM02Items.find((x: any) => x.name === bm06Item.name);
          if (matchedBM02Item) {
            const uPrice = Number(matchedBM02Item.unitPrice) || 0;
            const qty = Number(bm06Item.orderQty || bm06Item.quantity || 0);
            return {
              ...bm06Item,
              unitPrice: uPrice,
              price: uPrice,
              totalPrice: uPrice * qty,
              total: uPrice * qty
            };
          }
          return bm06Item;
        });

        const orderRowsRaw = previousBM06Record?.allocations && previousBM06Record.allocations.length > 0 ? previousBM06Record.allocations : updatedSelectedItems;
        const orderRows = orderRowsRaw.map((row: any) => {
          const matchedSelected = updatedSelectedItems.find((u: any) => u.name === row.name);
          if (matchedSelected) {
            return { ...row, unitPrice: matchedSelected.unitPrice, price: matchedSelected.price };
          }
          return row;
        });

        const allItemIds = new Set<string>();
        orderRows.forEach((r: any) => {
          const itemId = r.itemId || r.estimateItemId || r.id;
          if (itemId) allItemIds.add(itemId);
        });
        Object.keys(oldItemsMap).forEach(key => allItemIds.add(key));

        const draftItems: any[] = currentBM06Record?.draftItems || [];
        const draftGroups: any[] = currentBM06Record?.draftGroups || [];

        const itemSnapshots: Record<string, any> = {};
        for (const itemId of allItemIds) {
          const draftMatch = draftItems.find((d: any) => d.id === itemId);
          if (draftMatch) {
            itemSnapshots[itemId] = draftMatch;
          } else {
            const itemSnap = await OrderService.getEstimateItemSnapshot(itemId);
            if (itemSnap) itemSnapshots[itemId] = itemSnap;
          }
        }

        let allDbItems: Record<string, any> = {};
        const hasGroupedItems = Object.values(itemSnapshots).some((it: any) => it.isGroupedEstimate && it.groupId);
        if (hasGroupedItems) {
          allDbItems = await OrderService.getAllEstimateItems();
        }

        draftItems.forEach((di: any) => {
          if (di.isGroupedEstimate && di.groupId) allDbItems[di.id] = di;
        });

        for (const itemId of allItemIds) {
          const dbItem = itemSnapshots[itemId];
          if (!dbItem) continue;

          const cleanDbItem = { ...dbItem };
          delete cleanDbItem.isDraftItem;
          delete cleanDbItem.saveStatus;
          delete cleanDbItem.pendingMasterSave;

          const estQty = Number(dbItem.estimatedQty) || 0;
          const oldQty = oldItemsMap[itemId] || 0;
          const matchRow = orderRows.find((r: any) => (r.itemId || r.estimateItemId || r.id) === itemId);
          const newQty = matchRow ? Number(matchRow.orderQty || matchRow.quantity || 0) : 0;
          const enteredPrice = matchRow ? Number(matchRow.unitPrice || matchRow.price || 0) : 0;
          const currentPrice = Number(dbItem.basePrice) || 0;
          const finalPrice = currentPrice > 0 ? currentPrice : enteredPrice;

          if (dbItem.isGroupedEstimate && dbItem.groupId) {
            const groupId = dbItem.groupId;
            let groupEstimatedQty = estQty;
            const draftGroupMatch = draftGroups.find((dg: any) => dg.groupId === groupId);
            if (draftGroupMatch) {
              groupEstimatedQty = Number(draftGroupMatch.estimatedQty) || 0;
            } else {
              const groupData = await OrderService.getEstimateGroupSnapshot(groupId);
              if (groupData) groupEstimatedQty = Number(groupData.estimatedQty) || 0;
            }

            let newItemCumulativeQty = 0;
            let groupNewCumulative = 0;
            let groupNewRemaining = 0;

            if (matchRow) {
              newItemCumulativeQty = Number(matchRow.itemCumulativeAfter !== undefined ? matchRow.itemCumulativeAfter : ((matchRow.itemCumulativeBefore || matchRow.cumulativeQtyOld || 0) + newQty)) || 0;
              groupNewCumulative = Number(matchRow.groupCumulativeAfter !== undefined ? matchRow.groupCumulativeAfter : ((matchRow.groupCumulativeBefore || 0) + newQty)) || 0;
              groupNewRemaining = Number(matchRow.groupRemainingAfter !== undefined && !isNaN(matchRow.groupRemainingAfter) ? matchRow.groupRemainingAfter : ((matchRow.groupRemainingBefore || 0) - newQty)) || 0;
            } else {
              const prevItemCumulativeQty = Number(dbItem.itemCumulativeQty !== undefined ? dbItem.itemCumulativeQty : (dbItem.cumulativeQty || 0)) || 0;
              newItemCumulativeQty = prevItemCumulativeQty - oldQty + newQty;
              groupNewCumulative = Number(dbItem.cumulativeQty || 0);
              groupNewRemaining = Number(dbItem.remainingQty || 0);
            }

            if (isNaN(newItemCumulativeQty)) newItemCumulativeQty = 0;
            if (isNaN(groupNewCumulative)) groupNewCumulative = 0;
            if (isNaN(groupNewRemaining)) groupNewRemaining = 0;

            let warningStatus = 'OK';
            if (groupNewCumulative > groupEstimatedQty) {
              warningStatus = 'DANGER';
            } else if (groupNewCumulative >= groupEstimatedQty * 0.9) {
              warningStatus = 'WARNING';
            }

            rtdbUpdates[`estimateItems/${itemId}`] = {
              ...cleanDbItem,
              basePrice: finalPrice,
              itemCumulativeQty: newItemCumulativeQty,
              cumulativeQty: groupNewCumulative,
              remainingQty: groupNewRemaining,
              lastOrderDate: bm02Data.date || "",
              lastOrderQty: newQty,
              warningStatus: warningStatus,
              updatedAt: now
            };

            let existingGroupVal = {};
            if (draftGroupMatch) {
              const cleanGroup = { ...draftGroupMatch };
              delete cleanGroup.isDraftGroup;
              delete cleanGroup.isDraftGroupUpdate;
              existingGroupVal = cleanGroup;
            } else {
              const groupData = await OrderService.getEstimateGroupSnapshot(groupId);
              if (groupData) existingGroupVal = groupData;
            }
            rtdbUpdates[`estimateGroups/${groupId}`] = {
              ...existingGroupVal,
              cumulativeQty: groupNewCumulative,
              remainingQty: groupNewRemaining,
              status: warningStatus === 'DANGER' ? 'EXCEEDED' : (warningStatus === 'WARNING' ? 'NEARLY_EMPTY' : 'NORMAL'),
              updatedAt: now
            };

            Object.keys(allDbItems).forEach(key => {
              if (key !== itemId) {
                const it = allDbItems[key];
                if (it && it.groupId === groupId) {
                  if (!allItemIds.has(key)) {
                    rtdbUpdates[`estimateItems/${key}`] = {
                      ...it,
                      cumulativeQty: groupNewCumulative,
                      remainingQty: groupNewRemaining,
                      warningStatus: warningStatus,
                      updatedAt: now
                    };
                  }
                }
              }
            });
          } else {
            let newCum = 0;
            let newRem = 0;
            if (matchRow) {
              newCum = Number(matchRow.cumulativeQtyNew !== undefined ? matchRow.cumulativeQtyNew : ((matchRow.cumulativeQtyOld || 0) + newQty)) || 0;
              newRem = Number(matchRow.remainingQtyNew !== undefined && !isNaN(matchRow.remainingQtyNew) ? matchRow.remainingQtyNew : ((matchRow.remainingQtyOld || 0) - newQty)) || 0;
            } else {
              const currCumDb = Number(dbItem.cumulativeQty) || 0;
              newCum = currCumDb - oldQty + newQty;
              newRem = estQty - newCum;
            }
            if (isNaN(newCum)) newCum = 0;
            if (isNaN(newRem)) newRem = 0;

            let warningStatus = 'OK';
            if (newCum > estQty) {
              warningStatus = 'DANGER';
            } else if (newCum >= estQty * 0.9) {
              warningStatus = 'WARNING';
            }

            rtdbUpdates[`estimateItems/${itemId}`] = {
              ...cleanDbItem,
              basePrice: finalPrice,
              cumulativeQty: newCum,
              remainingQty: newRem,
              lastOrderDate: bm02Data.date || "",
              lastOrderQty: newQty,
              warningStatus: warningStatus,
              updatedAt: now
            };
          }
        }
      }

      // If updating an existing snapshot and Mã phiếu (snapshotId) changed, clean up old entry
      if (currentRecordId && currentRecordId !== snapshotId) {
        const oldRawId = String(currentRecordId).replace(/^BM02-/i, '').replace(/^BM03\.2-/i, '').replace(/^BM06-/i, '').trim();
        
        // Find old record to check its original material type & mã phiếu
        const oldRecord = (savedRecords || []).find(r => 
          r.id === currentRecordId || 
          r.snapshotId === currentRecordId ||
          r.id === oldRawId ||
          r.id === `BM02-${oldRawId}` ||
          (r.maPhieu && (r.maPhieu === currentRecordId || r.maPhieu === oldRawId))
        );

        const targetLoaiVatTu = oldRecord?.loaiVatTu || loaiVatTu;
        const oldMaPhieu = oldRecord?.maPhieu || extractMaPhieu(oldRecord) || '';

        try {
          await HistoryService.deleteDonHang(targetLoaiVatTu, currentRecordId);
          await HistoryService.deleteDonHang(targetLoaiVatTu, oldRawId);
          await HistoryService.deleteDonHang(targetLoaiVatTu, `BM02-${oldRawId}`);
          if (oldMaPhieu) {
            await HistoryService.deleteDonHang(targetLoaiVatTu, oldMaPhieu);
          }
          if (loaiVatTu !== targetLoaiVatTu) {
            await HistoryService.deleteDonHang(loaiVatTu, currentRecordId);
            await HistoryService.deleteDonHang(loaiVatTu, oldRawId);
            await HistoryService.deleteDonHang(loaiVatTu, `BM02-${oldRawId}`);
            if (oldMaPhieu) {
              await HistoryService.deleteDonHang(loaiVatTu, oldMaPhieu);
            }
          }

          await OrderService.deleteBM02Order(currentRecordId);
          await OrderService.deleteBM02Order(oldRawId);
          await OrderService.deleteBM02Order(`BM02-${oldRawId}`);
          if (oldMaPhieu) {
            await OrderService.deleteBM02Order(oldMaPhieu);
          }
        } catch (cleanErr) {
          console.warn("Lỗi dọn dẹp Snapshot cũ khi cập nhật Mã phiếu:", cleanErr);
        }
      }

      // Save 01 Snapshot to Realtime DB under bm02Orders
      rtdbUpdates[`bm02Orders/${snapshotId}`] = removeUndefined(snapshotPayload);

      if (Object.keys(rtdbUpdates).length > 0) {
        await OrderService.updateRTDB(rtdbUpdates);
      }

      // Save 01 Single Record to History
      await HistoryService.saveDonHang(loaiVatTu, snapshotPayload);

      // Audit log
      try {
        await AuditLogService.log(
          currentUser?.username || 'khách',
          currentUser?.role || 'viewer',
          currentRecordId ? 'UPDATE' : 'CREATE',
          'BM02',
          `${currentRecordId ? 'Cập nhật' : 'Khởi tạo'} Hồ sơ vật tư [${snapshotId}] (gồm BM02 & BM03.2)`,
          snapshotId,
          null,
          snapshotPayload
        );
      } catch (logErr) {
        console.warn("Lỗi ghi log:", logErr);
      }

      setCurrentRecordId(snapshotId);

      if (bm02Data.sourceType === 'BM06') {
        await recalculateAllOrdersChain();
      }

      setToast({ 
        message: currentRecordId ? "Đã cập nhật dữ liệu Hồ sơ (BM02 & BM03.2) thành công!" : "Đã lưu thành công 01 Snapshot Hồ sơ (BM02 & BM03.2)!", 
        type: "success" 
      });

      ReportService.clearCache();
      await loadRecords();
      setReportRefreshTrigger(prev => prev + 1);
    } catch (e: any) {
      console.error("Lỗi khi lưu Snapshot Hồ sơ:", e);
      setToast({ message: `Lỗi khi lưu dữ liệu: ${e.message || e}`, type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const saveToFirebase = async (skipPriceConfirm: boolean = false, skipDuplicateConfirm: boolean = false) => {
    switch (activeTab) {
      case 'BM06':
        return await saveBM06();
      case 'BM02':
      case 'BBNT':
      case 'BM04':
        return await saveUnifiedSnapshot(skipPriceConfirm, skipDuplicateConfirm);
      default:
        return;
    }
  };

  const startDeleteRecord = (id: string) => {
    if (!canDelete(currentUser)) {
      setToast({ message: "Bạn không có quyền xóa. Chỉ tài khoản ADMIN mới được phép xóa phiếu/dữ liệu.", type: "error" });
      return;
    }
    setShowDeleteConfirm({show: true, id});
  };

  const deleteSingleRecord = async (id: string) => {
    if (!id) return;

    const rawId = String(id).replace(/^(BM06|BM02|BM03\.2)-/i, '');
    const record = savedRecords.find(r => 
      r.id === id || 
      r.id === rawId ||
      r.id === `BM02-${rawId}` || 
      r.id === `BM06-${rawId}` || 
      r.id === `BM03.2-${rawId}` ||
      (r.maPhieu && (r.maPhieu === id || r.maPhieu === rawId))
    );
    
    // Explicitly use record.loaiVatTu if available
    const loaiVatTu = record?.loaiVatTu || (window as any)._loaiVatTuHienTai || 'BeTong';
    console.log("Deleting record in full-sync:", id, "rawId:", rawId, "path loaiVatTu:", loaiVatTu);
    
    const isBM06Sourced = record?.type === 'BM06' || record?.sourceType === 'BM06' || String(id).startsWith('BM06-');

    // 1. Delete from Realtime DB - lichSu table
    try {
      await HistoryService.deleteDonHang(loaiVatTu, id);
      await HistoryService.deleteDonHang(loaiVatTu, rawId);
      await HistoryService.deleteDonHang(loaiVatTu, `BM02-${rawId}`);
      await HistoryService.deleteDonHang(loaiVatTu, `BM06-${rawId}`);
      await HistoryService.deleteDonHang(loaiVatTu, `BM03.2-${rawId}`);
      console.log(`Deleted history entries from Realtime DB lichSu/${loaiVatTu}`);
    } catch (e) {
      console.warn("Lỗi khi xóa lichSu khỏi RTDB:", e);
    }

    // 2. Delete from Realtime DB - bm02Orders table
    try {
      await OrderService.deleteBM02Order(id);
      await OrderService.deleteBM02Order(rawId);
      await OrderService.deleteBM02Order(`BM02-${rawId}`);
      console.log(`Deleted BM02 orders from Realtime DB bm02Orders`);
    } catch (e) {
      console.warn("Lỗi khi xóa bm02Orders khỏi RTDB:", e);
    }

    // 3. Delete from Realtime DB - bm06Orders table
    try {
      await OrderService.deleteBM06Order(id);
      await OrderService.deleteBM06Order(rawId);
      await OrderService.deleteBM06Order(`BM06-${rawId}`);
      console.log(`Deleted BM06 orders from Realtime DB bm06Orders`);
    } catch (e) {
      console.warn("Lỗi khi xóa bm06Orders khỏi RTDB:", e);
    }

    // 4. Delete from Realtime DB - bm032Orders table
    try {
      const db = getDB();
      if (db) {
        const keysToRemove = Array.from(new Set([id, rawId, `BM03.2-${rawId}`, `BM02-${rawId}`]));
        for (const k of keysToRemove) {
          if (k) {
            await remove(ref(db, `bm032Orders/${sanitizeRTDBPath(k)}`));
          }
        }
      }
    } catch (e) {
      console.warn("Lỗi khi xóa bm032Orders khỏi RTDB:", e);
    }

    // 5. Delete from Firestore if active
    try {
      const fsDb = getFirestoreDB();
      if (fsDb && !(window as any)._isFirestoreQuotaExceeded) {
        const collections = ['bm02Orders', 'bm06Orders', 'bbntOrders', 'bm032Orders', 'lichSu'];
        const targetIds = Array.from(new Set([id, rawId, `BM02-${rawId}`, `BM06-${rawId}`, `BM03.2-${rawId}`]));
        for (const col of collections) {
          for (const dId of targetIds) {
            if (dId) {
              try {
                await deleteDoc(doc(fsDb, col, sanitizeRTDBPath(dId)));
              } catch (_) {}
            }
          }
        }
      }
    } catch (fsErr) {
      console.warn("Lỗi khi xóa khỏi Firestore:", fsErr);
    }

    // Reverse quantities if BM06 record
    if (isBM06Sourced && record) {
      try {
        const rtdbUpdates: Record<string, any> = {};
        const itemsList = record.items || record.selectedItems || record.danhSachVatTu || [];
        
        console.log("Restoring quantities for items:", itemsList);
        
        for (const it of itemsList) {
          const itemId = it.itemId || it.estimateItemId || it.id;
          const orderQtyValue = Number(it.orderQty || it.quantity || 0);
          
          if (itemId && orderQtyValue > 0) {
            const dbItem = await OrderService.getEstimateItemSnapshot(itemId);
            if (dbItem) {
              const estQty = Number(dbItem.estimatedQty) || 0;
              const currCum = Number(dbItem.cumulativeQty) || 0;
              
              const newCum = Math.max(0, currCum - orderQtyValue);
              const newRem = estQty - newCum;
              
              let warningStatus = 'OK';
              if (newCum > estQty) {
                warningStatus = 'DANGER';
              } else if (newCum >= estQty * 0.9) {
                warningStatus = 'WARNING';
              }
              
              rtdbUpdates[`estimateItems/${itemId}`] = {
                ...dbItem,
                cumulativeQty: newCum,
                remainingQty: newRem,
                warningStatus: warningStatus,
                updatedAt: Date.now()
              };
            }
          }
        }

        if (Object.keys(rtdbUpdates).length > 0) {
          await OrderService.updateRTDB(rtdbUpdates);
          console.log("Successfully reversed quantities in RTDB:", rtdbUpdates);
        }
      } catch (e) {
        console.error("Lỗi khi hoàn trả số lượng trong estimateItems:", e);
      }
    }

    // Log activity for deleted records
    try {
      const mNode = isBM06Sourced ? 'BM06' : (record?.type === 'BM03.2' ? 'BM03.2' : 'BM02');
      await AuditLogService.log(
        currentUser?.username || 'khách',
        currentUser?.role || 'viewer',
        'DELETE',
        mNode,
        `Xóa hồ sơ dữ liệu phiếu [${id}] - Tên phiếu: "${record?.tieuDe || record?.title || 'Chưa đặt tên'}"`,
        id,
        record || null,
        null
      );
    } catch (logErr) {
      console.warn("Lỗi ghi log hoạt động khi xóa phiếu:", logErr);
    }

    if (currentRecordId === id || currentRecordId === rawId || currentRecordId === `BM02-${rawId}` || currentRecordId === `BM06-${rawId}`) {
      setCurrentRecordId(null);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!canDelete(currentUser)) {
      setToast({ message: "Lỗi phân quyền: Chỉ tài khoản ADMIN mới được phép xóa dữ liệu.", type: "error" });
      return;
    }
    if (!id) return;

    try {
      setIsProcessing(true);
      await deleteSingleRecord(id);

      setSavedRecords(prev => prev.filter(r => {
        const rawId = String(id).replace(/^(BM06|BM02|BM03\.2)-/i, '');
        const rId = String(r.id);
        const rCode = String(r.maPhieu || '');
        const belongsToDeleted = rId === id || 
                                rId === rawId ||
                                rId === `BM02-${rawId}` || 
                                rId === `BM06-${rawId}` || 
                                rId === `BM03.2-${rawId}` ||
                                (rCode && (rCode === id || rCode === rawId));
        return !belongsToDeleted;
      }));

      setToast({ message: "✅ Đã xóa hồ sơ thành công", type: 'success' });
      ReportService.clearCache();
      await loadRecords();
      setReportRefreshTrigger(prev => prev + 1);

    } catch (err) {
      console.error("Lỗi khi xóa:", err);
      setToast({ message: "Lỗi khi xóa dữ liệu!", type: 'error' });
    } finally {
      setIsProcessing(false);
      setShowDeleteConfirm({show: false, id: null});
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (!canDelete(currentUser)) {
      setToast({ message: "Lỗi phân quyền: Chỉ tài khoản ADMIN mới được phép xóa dữ liệu.", type: "error" });
      setShowBulkDeleteModal(false);
      return;
    }
    if (selectedRecordIds.length === 0) {
      setShowBulkDeleteModal(false);
      return;
    }

    const count = selectedRecordIds.length;
    setIsProcessing(true);

    try {
      for (const id of selectedRecordIds) {
        await deleteSingleRecord(id);
      }

      setSelectedRecordIds([]);
      setShowBulkDeleteModal(false);
      setToast({ message: `Đã xóa ${count} phiếu`, type: 'success' });
      ReportService.clearCache();
      await loadRecords();
      setReportRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error("Lỗi khi xóa hàng loạt:", err);
      setToast({ message: "Lỗi khi xóa dữ liệu!", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const loadRecordData = async (record: any) => {
    // Clear the active edit session data for BM06 page in window memory,
    // so it does NOT block the fresh state updates of the selected historical record
    (window as any)._currentBM06Data = null;

    const recordType = record.loaiTaiLieu || record.type || 'BM02';
    if (recordType === 'BM06' || record.sourceType === 'BM06') {
      const rawId = String(record.id).replace('BM02-', '').replace('BM03.2-', '').replace('BM06-', '');
      const bm06Id = `BM06-${rawId}`;

      const recordLoaiVatTu = record?.loaiVatTu || (window as any)._loaiVatTuHienTai || 'BeTong';
      let rtdbDataArray: any[] = [];
      try {
        const fullLichSu = await HistoryService.fetchLichSu(recordLoaiVatTu);
        if (fullLichSu) {
          rtdbDataArray = Object.keys(fullLichSu).map((k: any) => {
            const d = fullLichSu[k];
            const info = docTenCot(d);
            return {
              ...d,
              id: d.id || k,
              title: d.tieuDe || info.tieuDe,
              updatedAt: d.updatedAt || info.ngayTao,
              createdAt: d.createdAt || d.updatedAt || info.ngayTao,
              type: d.loaiTaiLieu || info.loaiTaiLieu || 'BM02',
              items: d.danhSachVatTu ? (typeof d.danhSachVatTu === 'string' ? safeParse(d.danhSachVatTu) : d.danhSachVatTu) : []
            };
          });
        }
      } catch (rtdbErr) {
        console.warn("Lỗi load records từ RTDB trong loadRecordData:", rtdbErr);
      }

      let dbBM06: any = null;
      let dbBM02: any = null;
      let dbBM032: any = null;

      // Union merge from RTDB:
      if (!dbBM06) {
        dbBM06 = rtdbDataArray.find(x => x.id === bm06Id || x.id === rawId);
      }
      if (!dbBM06) {
        try {
          dbBM06 = (await OrderService.getBM06Record(rawId)) || (await OrderService.getBM06Record(bm06Id));
        } catch (e) {
          console.warn("Lỗi fetch trực tiếp BM06 từ RTDB:", e);
        }
      }
      if (!dbBM02) {
        dbBM02 = rtdbDataArray.find(x => x.id === `BM02-${rawId}` || (x.id === rawId && x.loaiTaiLieu === 'BM02'));
      }
      if (!dbBM032) {
        dbBM032 = rtdbDataArray.find(x => x.id === `BM03.2-${rawId}` || (x.id === rawId && (x.loaiTaiLieu === 'BBNT' || x.loaiTaiLieu === 'BM03.2')));
      }

      // Use the direct Firestore records if available, otherwise fallback to the current historical list record
      const finalRecord = dbBM06 || record;

      const orderDate = finalRecord.orderDate || finalRecord.ngayLap || finalRecord.date || "";
      const company = finalRecord.company || finalRecord.proposingCompany || INITIAL_BM02.proposingCompany || "";
      const receiver = finalRecord.receiver || "Phòng Kỹ thuật Ban Giám đốc";
      const purpose = finalRecord.purpose || finalRecord.mucDichSuDungNoiDung || "";
      const location = finalRecord.location || finalRecord.mucDichSuDungDiaDiem || finalRecord.diaDiem || "";
      const proposer = finalRecord.proposer || finalRecord.nguoiLapTen || finalRecord.nguoiLap || "";
      const storekeeper = finalRecord.storekeeper || "Áp dụng đối với hoạt động thi công xây dựng";
      const departmentHead = finalRecord.departmentHead || "";
      const selectedUnits: any[] = finalRecord.selectedUnits || [];
      const rawItems = finalRecord.selectedItems || finalRecord.items || finalRecord.danhSachVatTu || [];

      // Sort items based on selectedUnits sequence of BM06 to match visual tree
      const getUnitIndex = (p: string, u: string) => {
        return selectedUnits.findIndex((su: any) => 
          String(su.projectId || '').toLowerCase() === String(p || '').toLowerCase() && 
          String(su.unitId || '').toLowerCase() === String(u || '').toLowerCase()
        );
      };

      const sortedRawItems = [...rawItems].sort((a: any, b: any) => {
        const pA = a.projectId || a.project || "";
        const uA = a.unitId || a.unit || "";
        const pB = a.projectId || a.project || "";
        const uB = a.unitId || a.unit || "";
        const idxA = getUnitIndex(pA, uA);
        const idxB = getUnitIndex(pB, uB);
        if (idxA !== -1 && idxB !== -1) {
          if (idxA !== idxB) return idxA - idxB;
          return 0; // retain stable sort order
        }
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });

      const mappedSelectedItems = sortedRawItems.map((item: any, idx: number) => {
        const orderQty = item.orderQty || item.quantity || item.requestedQty || 0;
        const isGroupedEstimate = item.isGroupedEstimate || false;
        
        const cumulativeQtyOld = item.cumulativeQtyBefore !== undefined ? item.cumulativeQtyBefore : (item.cumulativeQtyOld || item.luyKeQty || 0);
        const remainingQtyOld = item.remainingQtyBefore !== undefined ? item.remainingQtyBefore : (item.remainingQtyOld || 0);
        const estimatedQty = item.estimatedQty || item.duToanQty || 0;
        const note = item.notes || item.note || item.description || "";
        const unitPrice = item.unitPrice || 0;

        return {
          estimateItemId: item.itemId || item.id || item.estimateItemId || `item-${idx}`,
          projectId: item.projectId || "",
          unitId: item.unitId || "",
          code: item.code || "",
          name: item.name || item.description || "",
          unit: item.unit || "",
          specification: item.specification || "",
          estimatedQty,
          cumulativeQtyOld,
          remainingQtyOld,
          orderQty,
          notes: note,
          unitPrice,
          isGroupedEstimate,
          groupId: item.groupId || "",
          groupName: item.groupName || "",
          groupEstimatedQty: item.groupEstimatedQty !== undefined ? item.groupEstimatedQty : (item.estimatedQty || 0),
          itemCumulativeBefore: item.itemCumulativeBefore !== undefined ? item.itemCumulativeBefore : (item.cumulativeQtyOld || 0),
          itemCumulativeAfter: item.itemCumulativeAfter !== undefined ? item.itemCumulativeAfter : ((item.cumulativeQtyOld || 0) + orderQty),
          groupCumulativeBefore: item.groupCumulativeBefore !== undefined ? item.groupCumulativeBefore : 0,
          groupRemainingBefore: item.groupRemainingBefore !== undefined ? item.groupRemainingBefore : 0,
          groupCumulativeAfter: item.groupCumulativeAfter !== undefined ? item.groupCumulativeAfter : 0,
          groupRemainingAfter: item.groupRemainingAfter !== undefined ? item.groupRemainingAfter : 0,
          materialId: item.materialId || item.itemId || item.id || item.estimateItemId || "",
          materialName: item.materialName || item.name || "",
          appliedUnits: item.appliedUnits || [],
          isSharedCost: item.isSharedCost || false,
          isProjectShared: item.isProjectShared || false,
          totalProjectUnits: item.totalProjectUnits || 0,
          applyUnitIds: item.applyUnitIds || [],
        };
      });

      const rebuiltBM06 = {
        id: bm06Id,
        projectId: finalRecord.projectId || (selectedUnits.length > 0 ? selectedUnits[0].projectId : ""),
        unitId: finalRecord.unitId || (selectedUnits.length > 0 ? selectedUnits[0].unitId : ""),
        orderDate,
        purpose,
        purposeMode: finalRecord.purposeMode || "CHUNG",
        unitPurposes: finalRecord.unitPurposes || {},
        location,
        company,
        receiver,
        proposer,
        storekeeper,
        departmentHead,
        selectedUnits,
        selectedItems: mappedSelectedItems,
        displayMode: finalRecord.displayMode || (finalRecord.isGroupedDisplay ? "GROUPED_EQUAL" : "DETAIL_BY_UNIT"),
        isGroupedDisplay: finalRecord.isGroupedDisplay !== undefined ? finalRecord.isGroupedDisplay : finalRecord.displayMode === "GROUPED_EQUAL",
        allocations: finalRecord.allocations || [],
        loaiVatTu: finalRecord.loaiVatTu || "BeTong",
        sourceType: "BM06",
        createdAt: finalRecord.createdAt || Date.now(),
        updatedAt: finalRecord.updatedAt || Date.now()
      };

      setCurrentBM06Record(rebuiltBM06);

      const isGroupedDisplay = rebuiltBM06.isGroupedDisplay;

      // Restore BM02
      if (dbBM02) {
        const usedIds = new Set<string>();
        let itemsToRestore = mappedSelectedItems;
        if (isGroupedDisplay) {
          itemsToRestore = groupItemsForExport(mappedSelectedItems);
        } else {
          const normalRows = mappedSelectedItems.filter((r: any) => !r.isSharedCost);
          const sharedRows = mappedSelectedItems.filter((r: any) => r.isSharedCost);
          const groupedSharedRows = groupItemsForExport(sharedRows);
          itemsToRestore = [...normalRows, ...groupedSharedRows];
        }
        const combinedBM02Items = itemsToRestore.map((item: any, idx: number) => {
          const dbBM02Items = dbBM02.items || dbBM02.danhSachVatTu || [];
          const matchItem = dbBM02Items.find((it: any) => it.name === item.name && it.unitId === item.unitId && it.projectId === item.projectId) || dbBM02Items.find((it: any) => it.name === item.name) || {};
          
          let itemIdVal = matchItem.id;
          if (!itemIdVal || usedIds.has(itemIdVal)) {
            const finalItemId = item.id || item.itemId || item.estimateItemId || 'itm';
            itemIdVal = `BM02-itm-${finalItemId}-${item.unitId || ''}-${idx}`;
          }
          usedIds.add(itemIdVal);
          
          const unitPrice = matchItem.unitPrice !== undefined ? Number(matchItem.unitPrice) : (item.unitPrice || 0);
          const lineTotal = matchItem.lineTotal !== undefined ? Number(matchItem.lineTotal) : (matchItem.total !== undefined ? Number(matchItem.total) : (item.orderQty || 0) * unitPrice);
          
          return {
            id: itemIdVal,
            stt: idx + 1,
            // Re-loaded from BM06:
            name: item.name,
            unit: item.unit,
            quantity: item.orderQty,
            duToanQty: item.estimatedQty,
            luyKeQty: item.cumulativeQtyOld,
            note: item.notes || '',
            projectId: item.projectId || '',
            unitId: item.unitId || '',
            appliedUnits: item.appliedUnits || matchItem.appliedUnits || [],
            // Re-loaded from BM02:
            unitPrice,
            lineTotal,
            total: lineTotal,
            isGroupedEstimate: item.isGroupedEstimate || false,
            isSharedCost: item.isSharedCost || false,
          };
        });

        const calculatedSubtotal = combinedBM02Items.reduce((acc: number, it: any) => acc + (it.lineTotal || 0), 0);
        
        // Restore VAT Snapshot if available
        const dbVatSnap = dbBM02.vatSnapshot || dbBM06?.vatSnapshot || {};
        const showVatVal = dbVatSnap.showVAT !== undefined ? Boolean(dbVatSnap.showVAT) : (dbVatSnap.showVat !== undefined ? Boolean(dbVatSnap.showVat) : (dbBM02.showVat ?? dbBM02.showVAT ?? false));
        const taxRateVal = dbVatSnap.vatPercent !== undefined ? Number(dbVatSnap.vatPercent) : (dbBM02.taxRate !== undefined ? Number(dbBM02.taxRate) : 8);
        const isPostTaxVal = dbVatSnap.priceMode ? (dbVatSnap.priceMode === "afterTax") : (dbBM02.isPostTax ?? true);

        let subTotalVal = dbVatSnap.subTotal !== undefined ? Number(dbVatSnap.subTotal) : (dbBM02.totalAmount !== undefined ? Number(dbBM02.totalAmount) : calculatedSubtotal);
        let vatAmountVal = dbVatSnap.vatAmount !== undefined ? Number(dbVatSnap.vatAmount) : (dbBM02.taxAmount !== undefined ? Number(dbBM02.taxAmount) : Math.round((subTotalVal * taxRateVal) / 100));
        let totalWithTaxVal = dbVatSnap.grandTotal !== undefined ? Number(dbVatSnap.grandTotal) : (dbBM02.totalWithTax !== undefined ? Number(dbBM02.totalWithTax) : (dbBM02.totalAmountWithVat !== undefined ? Number(dbBM02.totalAmountWithVat) : (dbBM02.tongTien !== undefined ? Number(dbBM02.tongTien) : (subTotalVal + vatAmountVal))));

        const restoredVatSnapshot = {
          showVAT: showVatVal,
          showVat: showVatVal,
          vatPercent: taxRateVal,
          priceMode: isPostTaxVal ? ("afterTax" as const) : ("beforeTax" as const),
          subTotal: subTotalVal,
          vatAmount: vatAmountVal,
          grandTotal: totalWithTaxVal
        };

        setBm02Data({
          docNumber: dbBM02.docNumber || 'QTMH-BM02',
          title: dbBM02.title || 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ',
          date: dbBM02.date || orderDate,
          location: dbBM02.location || 'Tp. Hồ Chí Minh',
          recipients: dbBM02.recipients && dbBM02.recipients.length > 0 ? dbBM02.recipients : ['Hội Đồng Thành Viên', 'BGĐ Công ty TNHH MTV Xây Dựng IJC'],
          grounds: dbBM02.grounds && dbBM02.grounds.length > 0 ? dbBM02.grounds : [
            `Căn cứ Phiếu đề nghị cung cấp vật tư BM06 ngày ${orderDate} của dự án ${finalRecord.projectId || 'Cát Tường'}`,
            'Căn cứ hồ sơ thiết kế và dự toán được duyệt.'
          ],
          items: combinedBM02Items,
          totalAmount: subTotalVal,
          taxRate: taxRateVal,
          taxAmount: vatAmountVal,
          totalWithTax: totalWithTaxVal,
          totalAmountWithVat: totalWithTaxVal,
          showVat: showVatVal,
          showVAT: showVatVal,
          isPostTax: isPostTaxVal,
          vatSnapshot: restoredVatSnapshot,
          proposingCompany: dbBM02.proposingCompany || company,
          originalFileName: dbBM02.originalFileName || `auto_generated_from_bm06_${orderDate}`,
          phongKeToan: dbBM02.phongKeToan || 'Nguyễn Mai Thy',
          nguoiLap: dbBM02.nguoiLap || proposer || 'Trần Nam Anh',
          giamDoc: dbBM02.giamDoc || 'Nguyễn Xuân Nam',
          duyetHDTV: dbBM02.duyetHDTV || 'Trần Nguyên Thảo',
          benGiaoTen: dbBM02.benGiaoTen || finalRecord.benGiaoTen || proposer || 'Trần Thành Tài',
          benGiaoChucVu: dbBM02.benGiaoChucVu || finalRecord.benGiaoChucVu || 'Trưởng bộ phận',
          benNhan1: dbBM02.benNhan1 || finalRecord.benNhan1 || 'Đỗ Thế Viễn',
          benNhan1ChucVu: dbBM02.benNhan1ChucVu || finalRecord.benNhan1ChucVu || 'Phó phòng KT',
          benNhan2: dbBM02.benNhan2 || finalRecord.benNhan2 || 'Lê Minh Chánh',
          benNhan2ChucVu: dbBM02.benNhan2ChucVu || finalRecord.benNhan2ChucVu || 'NV',
          requestContent: dbBM02.requestContent || (window as any)?._currentMaterialConfig?.bm02?.requestContent || "",
          mucDichSuDungNoiDung: normalizeMultilineContent(dbBM02.mucDichSuDungNoiDung || purpose),
          mucDichSuDungDiaDiem: dbBM02.mucDichSuDungDiaDiem || location,
          soTienBangChu: dbBM02.soTienBangChu || "",
          isCustomSoTienBangChu: dbBM02.isCustomSoTienBangChu ?? false,
          thoiHanThanhToan: dbBM02.thoiHanThanhToan || INITIAL_BM02.thoiHanThanhToan,
          selectedUnits: selectedUnits,
          sourceType: 'BM06',
          isGroupedDisplay: isGroupedDisplay,
          displayMode: finalRecord.displayMode || (isGroupedDisplay ? "GROUPED_EQUAL" : "DETAIL_BY_UNIT")
        });
      } else {
        let itemsToRestore = mappedSelectedItems;
        if (isGroupedDisplay) {
          itemsToRestore = groupItemsForExport(mappedSelectedItems);
        } else {
          const normalRows = mappedSelectedItems.filter((r: any) => !r.isSharedCost);
          const sharedRows = mappedSelectedItems.filter((r: any) => r.isSharedCost);
          const groupedSharedRows = groupItemsForExport(sharedRows);
          itemsToRestore = [...normalRows, ...groupedSharedRows];
        }
        const mappedBM02Items = itemsToRestore.map((item: any, idx: number) => {
          const uPrice = item.unitPrice || 0;
          const lTotal = (item.orderQty || 0) * uPrice;
          return {
            id: `BM02-itm-${item.id || item.itemId || item.estimateItemId || 'itm'}-${item.unitId || ''}-${idx}`,
            stt: idx + 1,
            name: item.name,
            unit: item.unit,
            quantity: item.orderQty,
            unitPrice: uPrice,
            lineTotal: lTotal,
            total: lTotal,
            note: item.notes || item.specification || '',
            duToanQty: item.estimatedQty,
            luyKeQty: item.cumulativeQtyOld,
            projectId: item.projectId || '',
            unitId: item.unitId || '',
            appliedUnits: item.appliedUnits || [],
            isGroupedEstimate: item.isGroupedEstimate || false,
            isSharedCost: item.isSharedCost || false,
          };
        });

        const totalAmount = mappedBM02Items.reduce((acc: number, it: any) => acc + (it.lineTotal || 0), 0);

        const dbVatSnapRebuilt = finalRecord.vatSnapshot || finalRecord.bm02Data?.vatSnapshot || {};
        const showVatValRebuilt = dbVatSnapRebuilt.showVAT !== undefined ? Boolean(dbVatSnapRebuilt.showVAT) : (dbVatSnapRebuilt.showVat !== undefined ? Boolean(dbVatSnapRebuilt.showVat) : (finalRecord.showVat ?? finalRecord.showVAT ?? false));
        const taxRateValRebuilt = dbVatSnapRebuilt.vatPercent !== undefined ? Number(dbVatSnapRebuilt.vatPercent) : (finalRecord.taxRate !== undefined ? Number(finalRecord.taxRate) : 8);
        const isPostTaxValRebuilt = dbVatSnapRebuilt.priceMode ? (dbVatSnapRebuilt.priceMode === "afterTax") : (finalRecord.isPostTax ?? true);

        let subTotalValRebuilt = dbVatSnapRebuilt.subTotal !== undefined ? Number(dbVatSnapRebuilt.subTotal) : totalAmount;
        let vatAmountValRebuilt = dbVatSnapRebuilt.vatAmount !== undefined ? Number(dbVatSnapRebuilt.vatAmount) : Math.round((subTotalValRebuilt * taxRateValRebuilt) / 100);
        let totalWithTaxValRebuilt = dbVatSnapRebuilt.grandTotal !== undefined ? Number(dbVatSnapRebuilt.grandTotal) : (subTotalValRebuilt + vatAmountValRebuilt);

        const restoredVatSnapshotRebuilt = {
          showVAT: showVatValRebuilt,
          showVat: showVatValRebuilt,
          vatPercent: taxRateValRebuilt,
          priceMode: isPostTaxValRebuilt ? ("afterTax" as const) : ("beforeTax" as const),
          subTotal: subTotalValRebuilt,
          vatAmount: vatAmountValRebuilt,
          grandTotal: totalWithTaxValRebuilt
        };

        const rebuiltBM02: FormData = {
          docNumber: 'QTMH-BM02',
          title: finalRecord.title || 'V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ',
          date: orderDate,
          location: 'Tp. Hồ Chí Minh',
          recipients: finalRecord.recipients && finalRecord.recipients.length > 0 ? finalRecord.recipients : ['Hội Đồng Thành Viên', 'BGĐ Công ty TNHH MTV Xây Dựng IJC'],
          grounds: finalRecord.grounds && finalRecord.grounds.length > 0 ? finalRecord.grounds : [
            `Căn cứ Phiếu đề nghị cung cấp vật tư BM06 ngày ${orderDate} của dự án ${finalRecord.projectId || 'Cát Tường'}`,
            'Căn cứ hồ sơ thiết kế và dự toán được duyệt.'
          ],
          items: mappedBM02Items,
          totalAmount: subTotalValRebuilt,
          taxRate: taxRateValRebuilt,
          taxAmount: vatAmountValRebuilt,
          totalWithTax: totalWithTaxValRebuilt,
          totalAmountWithVat: totalWithTaxValRebuilt,
          showVat: showVatValRebuilt,
          showVAT: showVatValRebuilt,
          isPostTax: isPostTaxValRebuilt,
          vatSnapshot: restoredVatSnapshotRebuilt,
          proposingCompany: company,
          originalFileName: finalRecord.originalFileName || `auto_generated_from_bm06_${orderDate}`,
          phongKeToan: finalRecord.phongKeToan || 'Nguyễn Mai Thy',
          nguoiLap: proposer || 'Trần Nam Anh',
          giamDoc: finalRecord.giamDoc || 'Nguyễn Xuân Nam',
          duyetHDTV: finalRecord.duyetHDTV || 'Trần Nguyên Thảo',
          benGiaoTen: finalRecord.benGiaoTen || proposer || 'Trần Thành Tài',
          benGiaoChucVu: finalRecord.benGiaoChucVu || 'Trưởng bộ phận',
          benNhan1: finalRecord.benNhan1 || 'Đỗ Thế Viễn',
          benNhan1ChucVu: finalRecord.benNhan1ChucVu || 'Phó phòng KT',
          benNhan2: finalRecord.benNhan2 || 'Lê Minh Chánh',
          benNhan2ChucVu: finalRecord.benNhan2ChucVu || 'NV',
          requestContent: finalRecord.requestContent || (window as any)?._currentMaterialConfig?.bm02?.requestContent || "",
          mucDichSuDungNoiDung: normalizeMultilineContent(purpose),
          mucDichSuDungDiaDiem: location,
          soTienBangChu: finalRecord.soTienBangChu || "",
          isCustomSoTienBangChu: finalRecord.isCustomSoTienBangChu ?? false,
          thoiHanThanhToan: finalRecord.thoiHanThanhToan || INITIAL_BM02.thoiHanThanhToan,
          selectedUnits: selectedUnits,
          sourceType: 'BM06',
          isGroupedDisplay: isGroupedDisplay,
          displayMode: finalRecord.displayMode || (isGroupedDisplay ? "GROUPED_EQUAL" : "DETAIL_BY_UNIT")
        };

        setBm02Data(rebuiltBM02);
      }

      const srcBM04Early = record.bm04 || record.bm04Data;
      // Restore BBNT
      const restoredReceiverListBM06 = extractReceiverList(dbBM032) || extractReceiverList(finalRecord) || extractReceiverList(srcBM04Early) || extractReceiverList(record);
      const targetReceiverListBM06 = (restoredReceiverListBM06 && restoredReceiverListBM06.length > 0)
        ? restoredReceiverListBM06
        : DEFAULT_RECEIVER_LIST;
      const restoredReceiverCompanyBM06 = extractReceiverCompany(dbBM032) || extractReceiverCompany(finalRecord) || extractReceiverCompany(srcBM04Early) || extractReceiverCompany(record) || company || 'CÔNG TY TNHH MTV XÂY DỰNG IJC';

      let rebuiltBBNT: BBNTData | null = null;
      if (dbBM032) {
        const normDbCat = normalizeMultilineContent(dbBM032.category || dbBM032.doiTuong?.hangMuc || purpose || '');
        setBbntData({
          ...dbBM032,
          category: normDbCat || dbBM032.category || '',
          doiTuong: {
            ...dbBM032.doiTuong,
            hangMuc: normDbCat || dbBM032.doiTuong?.hangMuc || '',
          },
          receiverCompany: dbBM032.receiverCompany || restoredReceiverCompanyBM06,
          receiverList: targetReceiverListBM06
        });
      } else {
        let itemsToRestore = mappedSelectedItems;
        if (isGroupedDisplay) {
          itemsToRestore = groupItemsForExport(mappedSelectedItems);
        } else {
          const normalRows = mappedSelectedItems.filter((r: any) => !r.isSharedCost);
          const sharedRows = mappedSelectedItems.filter((r: any) => r.isSharedCost);
          const groupedSharedRows = groupItemsForExport(sharedRows);
          itemsToRestore = [...normalRows, ...groupedSharedRows];
        }
        const autoDateBM032 = addOneDayToString(orderDate) || orderDate;
        rebuiltBBNT = {
          docNumber: 'QTMH-BM03.2',
          location: 'Tp. Hồ Chí Minh',
          date: finalRecord.date_bbnt || autoDateBM032,
          project: finalRecord.projectId || (selectedUnits.length > 0 ? selectedUnits[0].projectId : ""),
          category: normalizeMultilineContent(purpose || finalRecord.unitId || (selectedUnits.length > 0 ? selectedUnits[0].unitId : "")), // Updated to use purpose from BM06/BM02
          address: location,
          senderCompany: finalRecord.senderCompany || record.senderCompany || '',
          senderList: (finalRecord.senderList && finalRecord.senderList.length > 0) ? finalRecord.senderList : (record.senderList || []),
          receiverCompany: restoredReceiverCompanyBM06,
          receiverList: targetReceiverListBM06,
          startTime: finalRecord.startTime || '08h00',
          startDate: finalRecord.startDate || autoDateBM032,
          endTime: finalRecord.endTime || '17h00',
          endDate: finalRecord.endDate || autoDateBM032,
          locationDetail: location,
          grounds: finalRecord.grounds_bbnt || finalRecord.grounds || [
            `Hợp đồng thiết kế thi công và các phụ lục kèm theo;`,
            `Phiếu đề nghị mua vật tư BM06 ngày ${orderDate};`,
            `Biên bản giao nhận vật tư thực phẩm bàn giao.`
          ],
          items: itemsToRestore.map((item: any, idx: number) => ({
            id: `BM02-itm-${item.id || item.itemId || item.estimateItemId || 'itm'}-${item.unitId || ''}-${idx}`,
            stt: idx + 1,
            description: item.name + (item.specification ? ` (${item.specification})` : ''),
            unit: item.unit,
            requestedQty: item.orderQty,
            acceptedQty: item.orderQty,
            note: item.notes || '',
            projectId: item.projectId || '',
            unitId: item.unitId || '',
            isGroupedEstimate: item.isGroupedEstimate || false,
            isSharedCost: item.isSharedCost || false,
          })),
          originalFileName: finalRecord.originalFileName || `auto_generated_from_bm06_${orderDate}`,
          soHDNT: finalRecord.soHDNT || '02BTI/HĐNT2026',
          ngayKyHD: finalRecord.ngayKyHD || orderDate,
          maBM02: '',
          selectedUnits: selectedUnits,
          sourceType: 'BM06',
          isGroupedDisplay: isGroupedDisplay,
          displayMode: finalRecord.displayMode || (isGroupedDisplay ? "GROUPED_EQUAL" : "DETAIL_BY_UNIT")
        };

        setBbntData(rebuiltBBNT);
      }

      const autoDateBM04 = addOneDayToString(orderDate) || orderDate;
      const srcBM04 = record.bm04 || record.bm04Data;
      if (srcBM04) {
        const normSrcBM04Cat = normalizeMultilineContent(srcBM04.category || srcBM04.doiTuong?.hangMuc || (dbBM032 && (dbBM032.category || dbBM032.doiTuong?.hangMuc)) || purpose || '');
        setBm04Data({
          ...srcBM04,
          formType: 'BM04',
          docNumber: srcBM04.docNumber || 'QTMH-BM04',
          category: normSrcBM04Cat || srcBM04.category || '',
          doiTuong: {
            ...srcBM04.doiTuong,
            hangMuc: normSrcBM04Cat || srcBM04.doiTuong?.hangMuc || '',
          },
          date: (srcBM04.date && !srcBM04.date.includes('...') && !srcBM04.date.includes('2025')) ? srcBM04.date : autoDateBM04,
          startDate: (srcBM04.startDate && !srcBM04.startDate.includes('...') && !srcBM04.startDate.includes('2025')) ? srcBM04.startDate : autoDateBM04,
          endDate: (srcBM04.endDate && !srcBM04.endDate.includes('...') && !srcBM04.endDate.includes('2025')) ? srcBM04.endDate : autoDateBM04,
          originalFileName: srcBM04.originalFileName || finalRecord.originalFileName || `auto_generated_from_bm06_${orderDate}`,
          receiverCompany: srcBM04.receiverCompany || restoredReceiverCompanyBM06,
          receiverList: targetReceiverListBM06
        });
      } else if (dbBM032) {
        const normDbBM04Cat = normalizeMultilineContent(dbBM032.category || dbBM032.doiTuong?.hangMuc || purpose || '');
        setBm04Data({
          ...dbBM032,
          formType: 'BM04',
          title: (window as any)?._currentMaterialConfig?.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
          docNumber: 'QTMH-BM04',
          category: normDbBM04Cat || dbBM032.category || '',
          doiTuong: {
            ...dbBM032.doiTuong,
            hangMuc: normDbBM04Cat || dbBM032.doiTuong?.hangMuc || '',
          },
          date: (dbBM032.date && !dbBM032.date.includes('...') && !dbBM032.date.includes('2025')) ? dbBM032.date : autoDateBM04,
          startDate: (dbBM032.startDate && !dbBM032.startDate.includes('...') && !dbBM032.startDate.includes('2025')) ? dbBM032.startDate : autoDateBM04,
          endDate: (dbBM032.endDate && !dbBM032.endDate.includes('...') && !dbBM032.endDate.includes('2025')) ? dbBM032.endDate : autoDateBM04,
          originalFileName: dbBM032.originalFileName || finalRecord.originalFileName || `auto_generated_from_bm06_${orderDate}`,
          receiverCompany: dbBM032.receiverCompany || restoredReceiverCompanyBM06,
          receiverList: targetReceiverListBM06
        });
      } else if (rebuiltBBNT) {
        setBm04Data({
          ...rebuiltBBNT,
          formType: 'BM04',
          title: (window as any)?._currentMaterialConfig?.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
          docNumber: 'QTMH-BM04',
          date: autoDateBM04,
          startDate: autoDateBM04,
          endDate: autoDateBM04,
          receiverCompany: restoredReceiverCompanyBM06,
          receiverList: targetReceiverListBM06,
          originalFileName: rebuiltBBNT.originalFileName || finalRecord.originalFileName || `auto_generated_from_bm06_${orderDate}`
        });
      }

      (window as any)._currentRecordId = bm06Id;
      setCurrentRecordId(bm06Id);

      const loaiVatTu = finalRecord.loaiVatTu || 'BeTong';
      (window as any)._loaiVatTuHienTai = loaiVatTu;
      setCurrentMaterialType(loaiVatTu);

      // Fetch and apply material-specific configuration to forms
      try {
        let matConfig = await MaterialTypeService.getMaterialTypeConfig(loaiVatTu);
        const activeMatObj = danhSachVatTu.find(v => v.id === loaiVatTu);
        matConfig = enrichMaterialConfig(matConfig, loaiVatTu, activeMatObj?.ten || loaiVatTu);
        (window as any)._currentMaterialConfig = matConfig;
        applyMaterialConfigToForms(matConfig);
      } catch (e) {
        console.warn("Failed to apply material config in loadRecordData BM06 branch:", e);
      }

      // Explicitly guarantee snapshot receiverList and receiverCompany persist
      setBbntData(prev => ({
        ...prev,
        receiverCompany: restoredReceiverCompanyBM06,
        receiverList: targetReceiverListBM06
      }));
      setBm04Data(prev => ({
        ...prev,
        receiverCompany: restoredReceiverCompanyBM06,
        receiverList: targetReceiverListBM06
      }));

      setActiveTab('BM02');
      setHasData(true);
      setShowHistory(false);
      loadMaterialPrices();
      loadPriceDateOptions();
      setToast({ message: "Đã tải dữ liệu phiếu!", type: 'success' });
      return;
    }

    const srcBM02 = record.bm02 || record;
    const srcBBNT = record.bm032 || record.bbntData;

    const parsedSubtotal = (srcBM02.items || srcBM02.danhSachVatTu || record.items || record.danhSachVatTu || []).reduce((acc: number, it: any) => acc + ((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)), 0);

    const dbVatSnapDirect = srcBM02.vatSnapshot || record.vatSnapshot || {};
    const showVatValDirect = dbVatSnapDirect.showVAT !== undefined ? Boolean(dbVatSnapDirect.showVAT) : (dbVatSnapDirect.showVat !== undefined ? Boolean(dbVatSnapDirect.showVat) : (srcBM02.showVat ?? srcBM02.showVAT ?? record.showVat ?? record.showVAT ?? false));
    const taxRateValDirect = dbVatSnapDirect.vatPercent !== undefined ? Number(dbVatSnapDirect.vatPercent) : (srcBM02.taxRate !== undefined ? Number(srcBM02.taxRate) : (record.taxRate !== undefined ? Number(record.taxRate) : (record.tax_rate !== undefined ? Number(record.tax_rate) : 8)));
    const isPostTaxValDirect = dbVatSnapDirect.priceMode ? (dbVatSnapDirect.priceMode === "afterTax") : (srcBM02.isPostTax ?? record.isPostTax ?? true);

    let subTotalValDirect = dbVatSnapDirect.subTotal !== undefined ? Number(dbVatSnapDirect.subTotal) : (srcBM02.totalAmount !== undefined ? Number(srcBM02.totalAmount) : (record.totalAmount !== undefined ? Number(record.totalAmount) : parsedSubtotal));
    let vatAmountValDirect = showVatValDirect 
      ? (dbVatSnapDirect.vatAmount !== undefined ? Number(dbVatSnapDirect.vatAmount) : (srcBM02.taxAmount !== undefined ? Number(srcBM02.taxAmount) : (record.taxAmount !== undefined ? Number(record.taxAmount) : Math.round((subTotalValDirect * taxRateValDirect) / 100))))
      : 0;
    let totalWithTaxValDirect = showVatValDirect 
      ? (dbVatSnapDirect.grandTotal !== undefined ? Number(dbVatSnapDirect.grandTotal) : (srcBM02.totalWithTax !== undefined ? Number(srcBM02.totalWithTax) : (srcBM02.totalAmountWithVat !== undefined ? Number(srcBM02.totalAmountWithVat) : (record.totalWithTax !== undefined ? Number(record.totalWithTax) : (record.totalAmountWithVat !== undefined ? Number(record.totalAmountWithVat) : (record.tongTien !== undefined ? Number(record.tongTien) : (subTotalValDirect + vatAmountValDirect)))))))
      : subTotalValDirect;

    const restoredVatSnapshotDirect = {
      showVAT: showVatValDirect,
      showVat: showVatValDirect,
      vatPercent: taxRateValDirect,
      priceMode: isPostTaxValDirect ? ("afterTax" as const) : ("beforeTax" as const),
      subTotal: subTotalValDirect,
      vatAmount: vatAmountValDirect,
      grandTotal: totalWithTaxValDirect
    };

    const loadedMaPhieu = extractMaPhieu(record) || extractMaPhieu(srcBM02) || extractMaPhieu(srcBBNT) || '';

    const mappedBM02: FormData = {
      ...INITIAL_BM02,
      ...srcBM02,
      maPhieu: loadedMaPhieu,
      maPhieuNguon: loadedMaPhieu,
      docNumber: 'QTMH-BM02',
      title: srcBM02.title || record.title || "V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ",
      date: srcBM02.date || record.ngayLap,
      location: (srcBM02.location && !srcBM02.location.toLowerCase().includes('thuộc') && !srcBM02.location.toLowerCase().includes('lô') && !srcBM02.location.toLowerCase().includes('khu')) ? srcBM02.location : 'Tp. Hồ Chí Minh',
      recipients: srcBM02.recipients || record.recipients || INITIAL_BM02.recipients,
      grounds: srcBM02.grounds || record.grounds || record.grounds_BM02 || INITIAL_BM02.grounds,
      items: (srcBM02.items || srcBM02.danhSachVatTu || record.items || record.danhSachVatTu || []).map((it: any, idx: number) => {
        const uPrice = Number(it.unitPrice) || 0;
        const q = Number(it.quantity) || 0;
        const lTotal = it.lineTotal !== undefined ? Number(it.lineTotal) : (it.total !== undefined ? Number(it.total) : q * uPrice);
        return {
          ...it,
          id: it.id || `BM02-itm-${idx + 1}`,
          stt: idx + 1,
          quantity: q,
          unitPrice: uPrice,
          lineTotal: lTotal,
          total: lTotal
        };
      }),
      totalAmount: subTotalValDirect,
      taxRate: taxRateValDirect,
      taxAmount: vatAmountValDirect,
      totalWithTax: totalWithTaxValDirect,
      totalAmountWithVat: totalWithTaxValDirect,
      showVat: showVatValDirect,
      showVAT: showVatValDirect,
      isPostTax: isPostTaxValDirect,
      vatSnapshot: restoredVatSnapshotDirect,
      proposingCompany: srcBM02.proposingCompany || record.nguoiLap,
      originalFileName: srcBM02.originalFileName || record.originalFileName || "",
      phongKeToan: srcBM02.phongKeToan || record.phongKeToan || INITIAL_BM02.phongKeToan,
      nguoiLap: srcBM02.nguoiLap || record.nguoiLapTen || INITIAL_BM02.nguoiLap,
      giamDoc: srcBM02.giamDoc || record.giamDoc || INITIAL_BM02.giamDoc,
      duyetHDTV: srcBM02.duyetHDTV || record.duyetHDTV || INITIAL_BM02.duyetHDTV,
      requestContent: srcBM02.requestContent || record.requestContent || (window as any)?._currentMaterialConfig?.bm02?.requestContent || "",
      mucDichSuDungNoiDung: normalizeMultilineContent(srcBM02.mucDichSuDungNoiDung || record.mucDichSuDungNoiDung || INITIAL_BM02.mucDichSuDungNoiDung),
      mucDichSuDungDiaDiem: srcBM02.mucDichSuDungDiaDiem || record.mucDichSuDungDiaDiem || INITIAL_BM02.mucDichSuDungDiaDiem,
      soTienBangChu: srcBM02.soTienBangChu || record.soTienBangChu || "",
      isCustomSoTienBangChu: srcBM02.isCustomSoTienBangChu ?? record.isCustomSoTienBangChu ?? false,
      thoiHanThanhToan: srcBM02.thoiHanThanhToan || record.thoiHanThanhToan || INITIAL_BM02.thoiHanThanhToan,
      selectedUnits: srcBM02.selectedUnits || record.selectedUnits || [],
      isGroupedDisplay: srcBM02.isGroupedDisplay || record.isGroupedDisplay || false,
      displayMode: srcBM02.displayMode || record.displayMode || 'DETAILED',
      sourceType: srcBM02.sourceType || record.sourceType || 'PDF'
    };

    setBm02Data(mappedBM02);
    
    console.log("Loading record, config found:", !!record.cauHinh, record);

    if (record.cauHinh) {
        setDanhSachVatTu(record.cauHinh);
    }

    const srcBM04 = record.bm04 || record.bm04Data;

    // Restore BBNT data
    const restoredReceiverListStd = extractReceiverList(srcBBNT) || extractReceiverList(record) || extractReceiverList(srcBM04) || extractReceiverList(srcBM02);
    const targetReceiverListStd = (restoredReceiverListStd && restoredReceiverListStd.length > 0)
      ? restoredReceiverListStd
      : DEFAULT_RECEIVER_LIST;
    const restoredReceiverCompanyStd = extractReceiverCompany(srcBBNT) || extractReceiverCompany(record) || extractReceiverCompany(srcBM04) || extractReceiverCompany(srcBM02) || 'CÔNG TY TNHH MTV XÂY DỰNG IJC';

    if (srcBBNT) {
      const bm02Loc = srcBM02.location || srcBM02.mucDichSuDungDiaDiem || record.location || record.diaDiem || record.mucDichSuDungDiaDiem || '';
      const rawCat = srcBBNT.category || srcBBNT.doiTuong?.hangMuc || srcBM02.mucDichSuDungNoiDung || record.mucDichSuDungNoiDung || '';
      const normCat = normalizeMultilineContent(rawCat);
      setBbntData({
        ...srcBBNT,
        formType: 'BM03.2',
        docNumber: 'QTMH-BM03.2',
        category: normCat || srcBBNT.category || '',
        doiTuong: {
          ...srcBBNT.doiTuong,
          hangMuc: normCat || srcBBNT.doiTuong?.hangMuc || '',
        },
        receiverCompany: srcBBNT.receiverCompany || restoredReceiverCompanyStd || '',
        receiverList: targetReceiverListStd,
        address: bm02Loc || srcBBNT.address || srcBBNT.location || '',
        locationDetail: bm02Loc || srcBBNT.locationDetail || srcBBNT.address || '',
        originalFileName: srcBBNT.originalFileName || record.originalFileName || "",
        selectedUnits: srcBBNT.selectedUnits || record.selectedUnits || [],
        isGroupedDisplay: srcBBNT.isGroupedDisplay !== undefined ? srcBBNT.isGroupedDisplay : (record.isGroupedDisplay || false),
        displayMode: srcBBNT.displayMode || record.displayMode || 'DETAILED',
        sourceType: srcBBNT.sourceType || record.sourceType || 'PDF'
      });
    } else {
      // Fallback: sync from BM02 if BBNT data wasn't saved in this record
      const dateC = record.ngayLap || new Date().toISOString().split('T')[0];
      const bbntDate = addOneDayToString(dateC);
      
      const mappedBBNT: BBNTData = {
        ...INITIAL_BM03,
        receiverCompany: restoredReceiverCompanyStd || INITIAL_BM03.receiverCompany,
        receiverList: targetReceiverListStd,
        location: 'Tp. Hồ Chí Minh',
        date: bbntDate,
        startDate: bbntDate,
        endDate: bbntDate,
        items: (record.items || record.danhSachVatTu || []).map((it: any, idx: number) => ({
          id: it.id || `BM02-itm-${idx + 1}`,
          stt: it.stt || idx + 1,
          description: it.name,
          unit: it.unit,
          requestedQty: it.quantity,
          acceptedQty: it.quantity,
          note: it.note,
          unitPrice: it.unitPrice || 0,
          total: it.total || (it.quantity * (it.unitPrice || 0))
        })),
        selectedUnits: record.selectedUnits || [],
        isGroupedDisplay: record.isGroupedDisplay || false,
        displayMode: record.displayMode || 'DETAILED',
        sourceType: record.sourceType || 'PDF'
      };
      setBbntData(mappedBBNT);
      setBm04Data({
        ...mappedBBNT,
        formType: 'BM04',
        title: (window as any)?._currentMaterialConfig?.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
        docNumber: 'QTMH-BM04'
      });
    }

    const defaultRecordDate = (srcBBNT?.date && !srcBBNT.date.includes('...') && !srcBBNT.date.includes('2025'))
      ? srcBBNT.date
      : (addOneDayToString(srcBM02.date || record.ngayLap) || srcBM02.date || record.ngayLap || '');
    const defaultRecordOrig = srcBM04?.originalFileName || srcBBNT?.originalFileName || srcBM02.originalFileName || record.originalFileName || (typeof window !== 'undefined' && ((window as any)._currentOriginalFileName || (window as any)._currentBM02FileName)) || "";

    if (srcBM04) {
      const bm02Loc = srcBM02.location || srcBM02.mucDichSuDungDiaDiem || record.location || record.diaDiem || record.mucDichSuDungDiaDiem || '';
      const rawBM04Cat = srcBM04.category || srcBM04.doiTuong?.hangMuc || (srcBBNT && (srcBBNT.category || srcBBNT.doiTuong?.hangMuc)) || srcBM02.mucDichSuDungNoiDung || record.mucDichSuDungNoiDung || '';
      const normBM04Cat = normalizeMultilineContent(rawBM04Cat);
      setBm04Data({
        ...srcBM04,
        formType: 'BM04',
        docNumber: 'QTMH-BM04',
        category: normBM04Cat || srcBM04.category || '',
        doiTuong: {
          ...srcBM04.doiTuong,
          hangMuc: normBM04Cat || srcBM04.doiTuong?.hangMuc || '',
        },
        date: (srcBM04.date && !srcBM04.date.includes('...') && !srcBM04.date.includes('2025')) ? srcBM04.date : defaultRecordDate,
        startDate: (srcBM04.startDate && !srcBM04.startDate.includes('...') && !srcBM04.startDate.includes('2025')) ? srcBM04.startDate : defaultRecordDate,
        endDate: (srcBM04.endDate && !srcBM04.endDate.includes('...') && !srcBM04.endDate.includes('2025')) ? srcBM04.endDate : defaultRecordDate,
        receiverCompany: srcBM04.receiverCompany || restoredReceiverCompanyStd || '',
        receiverList: targetReceiverListStd,
        address: bm02Loc || srcBM04.address || srcBM04.location || '',
        locationDetail: bm02Loc || srcBM04.locationDetail || srcBM04.address || '',
        originalFileName: defaultRecordOrig,
        selectedUnits: srcBM04.selectedUnits || record.selectedUnits || [],
        isGroupedDisplay: srcBM04.isGroupedDisplay !== undefined ? srcBM04.isGroupedDisplay : (record.isGroupedDisplay || false),
        displayMode: srcBM04.displayMode || record.displayMode || 'DETAILED',
        sourceType: srcBM04.sourceType || record.sourceType || 'PDF'
      });
    } else if (srcBBNT) {
      const bm02Loc = srcBM02.location || srcBM02.mucDichSuDungDiaDiem || record.location || record.diaDiem || record.mucDichSuDungDiaDiem || '';
      const rawBM04Cat = srcBBNT.category || srcBBNT.doiTuong?.hangMuc || srcBM02.mucDichSuDungNoiDung || record.mucDichSuDungNoiDung || '';
      const normBM04Cat = normalizeMultilineContent(rawBM04Cat);
      setBm04Data({
        ...srcBBNT,
        formType: 'BM04',
        title: (window as any)?._currentMaterialConfig?.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
        docNumber: 'QTMH-BM04',
        category: normBM04Cat || srcBBNT.category || '',
        doiTuong: {
          ...srcBBNT.doiTuong,
          hangMuc: normBM04Cat || srcBBNT.doiTuong?.hangMuc || '',
        },
        date: defaultRecordDate,
        startDate: defaultRecordDate,
        endDate: defaultRecordDate,
        receiverCompany: srcBBNT.receiverCompany || restoredReceiverCompanyStd || '',
        receiverList: targetReceiverListStd,
        address: bm02Loc || srcBBNT.address || srcBBNT.location || '',
        locationDetail: bm02Loc || srcBBNT.locationDetail || srcBBNT.address || '',
        originalFileName: defaultRecordOrig,
        selectedUnits: srcBBNT.selectedUnits || record.selectedUnits || [],
        isGroupedDisplay: srcBBNT.isGroupedDisplay !== undefined ? srcBBNT.isGroupedDisplay : (record.isGroupedDisplay || false),
        displayMode: srcBBNT.displayMode || record.displayMode || 'DETAILED',
        sourceType: srcBBNT.sourceType || record.sourceType || 'PDF'
      });
    }

    if (defaultRecordOrig) {
      (window as any)._currentOriginalFileName = defaultRecordOrig;
      (window as any)._currentBM02FileName = defaultRecordOrig;
    }

    (window as any)._currentRecordId = record.id;
    setCurrentRecordId(record.id);

    // Re-apply configuration to ensure it overrides loaded data (Source of Truth)
    if (window._cauHinh && record.sourceType !== 'BM06') {
      applyCauHinhToForms(window._cauHinh);
    }

    const loaiVatTu = record.loaiVatTu || 'BeTong';
    (window as any)._loaiVatTuHienTai = loaiVatTu;
    setCurrentMaterialType(loaiVatTu);

    // Fetch and apply material-specific configuration to forms
    try {
      let matConfig = await MaterialTypeService.getMaterialTypeConfig(loaiVatTu);
      const activeMatObj = danhSachVatTu.find(v => v.id === loaiVatTu);
      matConfig = enrichMaterialConfig(matConfig, loaiVatTu, activeMatObj?.ten || loaiVatTu);
      (window as any)._currentMaterialConfig = matConfig;
      applyMaterialConfigToForms(matConfig);
    } catch (e) {
      console.warn("Failed to apply material config in loadRecordData standard branch:", e);
    }

    // Explicitly guarantee snapshot receiverList and receiverCompany persist
    setBbntData(prev => ({
      ...prev,
      receiverCompany: restoredReceiverCompanyStd,
      receiverList: targetReceiverListStd
    }));
    setBm04Data(prev => ({
      ...prev,
      receiverCompany: restoredReceiverCompanyStd,
      receiverList: targetReceiverListStd
    }));

    // Restore saved signatures if present in snapshot/record
    const restoredKyTen = srcBM02?.kyTenList || record.kyTenBM02 || record.kyTenList || record.bm02?.kyTenList;
    if (restoredKyTen && Array.isArray(restoredKyTen) && restoredKyTen.length > 0) {
      setKyTenBM02(restoredKyTen);
    }

    const recType = record.loaiTaiLieu || record.type || 'BM02';
    if (recType === 'BBNT' || recType === 'BM03.2') {
      setActiveTab('BBNT');
    } else {
      setActiveTab('BM02');
    }

    loadMaterialPrices();
    loadPriceDateOptions();

    setHasData(true);
    setShowHistory(false);
    setToast({ message: "Đã tải dữ liệu phiếu từ lịch sử!", type: 'success' });
  };

  const updateBM02Title = (value: string) => {
    setBm02Data(prev => ({ ...prev, title: value }));
    // Sync to BBNT category
    const prefix = layTieuDeBM02(currentMaterialType);
    let content = value;
    if (value.startsWith(prefix)) {
      content = value.replace(prefix, '').trim();
      (window as any)._tieuDeTuFile = content;
    }

    // Smart split content for BBNT
    let finalProject = '';
    let finalCategory = content;
    let finalAddress = '';

    const lowerContent = finalCategory.toLowerCase();
    if (lowerContent.includes('thuộc dự án')) {
      const parts = finalCategory.split(/thuộc dự án/i);
      finalCategory = parts[0].trim();
      finalProject = parts[1].trim();
    } else if (lowerContent.includes('dự án')) {
      const parts = finalCategory.split(/dự án/i);
      if (parts[0].trim().length > 5) {
        finalCategory = parts[0].trim();
        finalProject = parts[1].trim();
      }
    }

    if (finalCategory.toLowerCase().includes('tại')) {
      const parts = finalCategory.split(/tại/i);
      if (parts[0].trim().length > 5) {
        finalCategory = parts[0].trim();
        finalAddress = parts[1].trim();
      }
    }

    // 4. Ensure non-empty values and smart redistribution
    if (!finalProject && finalCategory) {
      // Try to find project in category
      const projectKeywords = ['khu nhà ở', 'dự án', 'biệt thự', 'chung cư'];
      for (const kw of projectKeywords) {
        if (finalCategory.toLowerCase().includes(kw)) {
          const idx = finalCategory.toLowerCase().indexOf(kw);
          finalProject = finalCategory.substring(idx).trim();
          break;
        }
      }
    }

    if (!finalAddress) {
      // Construct address from project and location
      finalAddress = `${finalProject ? finalProject + ' ' : ''}${bm02Data.location || 'Tp. Hồ Chí Minh'}`;
    }

    // Clean up trailing punctuation
    const cleanup = (t: string) => t.replace(/[,-\s\.]+$/, "").trim();
    finalCategory = cleanup(finalCategory);
    finalProject = cleanup(finalProject);
    finalAddress = cleanup(finalAddress);

    setBbntData(prev => ({ 
      ...prev, 
      category: finalCategory,
      project: finalProject || prev.project,
      address: finalAddress || prev.address
    }));
  };

  const updateBBNTCategory = (value: string) => {
    setBbntData(prev => ({ ...prev, category: value }));
    setBm04Data(prev => ({ ...prev, category: value }));
    (window as any)._tieuDeTuFile = value;
    setBm02Data(prev => ({
      ...prev,
      title: "V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ",
      mucDichSuDungNoiDung: value
    }));
  };

  const updateBM04Category = (value: string) => {
    setBm04Data(prev => ({ ...prev, category: value }));
    setBbntData(prev => ({ ...prev, category: value }));
    (window as any)._tieuDeTuFile = value;
    setBm02Data(prev => ({
      ...prev,
      title: "V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ",
      mucDichSuDungNoiDung: value
    }));
  };

  const applyOcrResultToState = async (ocrResult: OcrPreviewData) => {
    try {
      (window as any)._currentBM06Data = null;
      (window as any)._currentBM06Record = null;
      const originalName = ocrResult.fileName.replace(/\.[^/.]+$/, "");
      // Mã phiếu phải trích từ tên file upload có cú pháp: XDIJC-QTMH-BM01-[số phiếu]
      const fileCode = extractMaPhieuFromFileName(ocrResult.fileName) || extractMaPhieuFromFileName(originalName);
      const docCode = (ocrResult.maPhieu && isValidMaPhieu(ocrResult.maPhieu)) ? ocrResult.maPhieu.trim() : null;
      const autoExtractedMaPhieu = (fileCode && isValidMaPhieu(fileCode))
        ? formatStandardMaPhieu(fileCode)
        : (docCode && isValidMaPhieu(docCode) ? formatStandardMaPhieu(docCode) : 'XDIJC-QTMH-BM01-');
      
      let processedHangMuc = normalizeMultilineContent(ocrResult.hangMuc || "");
      (window as any)._tieuDeTuFile = processedHangMuc;

      const tieuDeHoanChinh = "V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ";
      const phanTuFile = processedHangMuc;
      const phanDiaDiemFile = ocrResult.diaDiem || "Tp. Hồ Chí Minh";

      // Sprint 1: Business Service - Load Master Catalog for active material category
      const activeLoai = (window as any)._loaiVatTuHienTai || currentMaterialType || 'BeTong';
      const masterCatalog = await MaterialMatchingService.getMasterCatalog(activeLoai);

      const mappedItems = ocrResult.items.map((it: any, idx: number) => {
        const q = parseVNNumber(it.quantity, 0);
        const p = parseVNNumber(it.unitPrice, 0);
        const duToan = it.duToanQty !== undefined && it.duToanQty !== null ? parseVNNumber(it.duToanQty, q) : q;
        const luyKe = it.luyKeQty !== undefined && it.luyKeQty !== null ? parseVNNumber(it.luyKeQty, 0) : 0;

        let officialName = it.name;
        let officialUnit = it.unit || 'kg';
        let officialUnitPrice = p;
        let matchedCatalogId: string | undefined = it.matchedCatalogId || undefined;
        let isMatched = !!it.isMatchedWithCatalog;
        let confidence = it.confidence || 0;
        let matchMethod = it.matchMethod || 'none';

        if (isMatched && matchedCatalogId) {
          // Already matched / confirmed in preview modal
          const cat = masterCatalog.find(c => c.id === matchedCatalogId || cleanMaterialName(c.tenVatTu) === cleanMaterialName(it.name));
          if (cat) {
            officialName = cat.tenVatTu;
            officialUnit = cat.donVi || officialUnit;
            officialUnitPrice = cat.giaHienHanh > 0 ? cat.giaHienHanh : p;
          }
        } else {
          // Execute Business Service: Material Matching
          const matchRes = MaterialMatchingService.matchItem(it.originalOcrName || it.name, masterCatalog);
          confidence = matchRes.confidence;
          matchMethod = matchRes.matchMethod;

          if (matchRes.matched && matchRes.confidence >= 90 && matchRes.matchedName) {
            officialName = matchRes.matchedName;
            officialUnit = matchRes.unit || it.unit || 'kg';
            officialUnitPrice = matchRes.unitPrice > 0 ? matchRes.unitPrice : p;
            matchedCatalogId = matchRes.matchedMaterialId || undefined;
            isMatched = true;
          }
        }

        const tot = Math.round(q * officialUnitPrice * 100) / 100;

        return {
          id: `BM02-ocr-${idx}-${Date.now()}`,
          stt: idx + 1,
          name: officialName,
          unit: officialUnit,
          quantity: q,
          unitPrice: officialUnitPrice,
          total: tot,
          lineTotal: tot,
          note: it.note || (!isMatched && officialUnitPrice === 0 ? '[Cần nhập đơn giá]' : ''),
          duToanQty: duToan,
          luyKeQty: luyKe,
          isMatchedWithCatalog: isMatched,
          matchedCatalogId,
          matchedCatalogName: isMatched ? officialName : undefined,
          originalOcrName: it.originalOcrName || it.name,
          confidence,
          matchMethod,
          originalCatalogData: isMatched ? {
            name: officialName,
            unit: officialUnit,
            unitPrice: officialUnitPrice,
            maVatTu: matchedCatalogId
          } : undefined
        };
      });

      const totalAmount = Math.round(mappedItems.reduce((acc, item) => acc + (item.total || 0), 0));

      const safeFallbackMaPhieu = (code: string | undefined) => {
        if (!code) return '';
        const trimmed = code.trim();
        return isTemplateCodeOnly(trimmed) ? '' : trimmed;
      };

      const finalAppliedMaPhieu = autoExtractedMaPhieu || safeFallbackMaPhieu(bm02Data.maPhieu);

      // Extract and clean proposer name from file upload (e.g. "Đỗ Thế Viễn")
      const rawProposer = ocrResult.nguoiDeNghi || (ocrResult as any).proposer || (ocrResult as any).nguoiLap || '';
      const extractedProposer = cleanProposerName(rawProposer);
      if (extractedProposer) {
        (window as any)._currentProposerName = extractedProposer;
      }

      const newBM02: FormData = {
        ...bm02Data,
        maPhieu: finalAppliedMaPhieu,
        maPhieuNguon: finalAppliedMaPhieu,
        docNumber: 'QTMH-BM02',
        title: tieuDeHoanChinh,
        project_name: ocrResult.congTrinh || bm02Data.project_name || '',
        proposingCompany: ocrResult.nhaCungCap || ocrResult.proposingCompany || bm02Data.proposingCompany,
        date: ocrResult.ngayBaoGia || bm02Data.date,
        mucDichSuDungNoiDung: phanTuFile,
        mucDichSuDungDiaDiem: phanDiaDiemFile,
        soTienBangChu: ocrResult.soTienBangChu || numberToVietnameseWords(totalAmount),
        isCustomSoTienBangChu: !!ocrResult.soTienBangChu,
        thoiHanThanhToan: ocrResult.thoiHanThanhToan || bm02Data.thoiHanThanhToan,
        nguoiDeNghi: extractedProposer || bm02Data.nguoiDeNghi,
        pBanDeNghi: extractedProposer || bm02Data.pBanDeNghi,
        items: mappedItems,
        totalAmount,
        originalFileName: originalName,
        sourceType: 'PDF',
        selectedUnits: [],
        isGroupedDisplay: false,
        displayMode: 'DETAILED'
      };

      setBm02Data(newBM02);

      // Auto-update BM02 signature for P.BAN ĐỀ NGHỊ
      if (extractedProposer) {
        setKyTenBM02(prev => updateKyTenWithPBanDeNghi(prev, extractedProposer));
      }

      // Auto-generate BBNT (BM03.2) directly from BM02 state
      const dateC = ocrResult.ngayBaoGia || newBM02.date;
      const bbntDate = addOneDayToString(dateC);

      const baseRecList = (bbntData.receiverList && bbntData.receiverList.length > 0)
        ? bbntData.receiverList
        : DEFAULT_RECEIVER_LIST;
      const targetReceiverList = extractedProposer
        ? updateReceiverListWithChiHuyTruong(baseRecList, extractedProposer)
        : baseRecList;

      setBbntData(prev => ({
        ...prev,
        maPhieu: finalAppliedMaPhieu || safeFallbackMaPhieu(prev.maPhieu),
        docNumber: 'QTMH-BM03.2',
        date: bbntDate,
        startDate: bbntDate,
        endDate: bbntDate,
        address: phanDiaDiemFile,
        locationDetail: phanDiaDiemFile,
        project: ocrResult.congTrinh || extractCongTrinhFromDiaDiem(phanDiaDiemFile) || prev.project || '',
        category: phanTuFile || prev.category || '',
        senderCompany: ocrResult.nhaCungCap || ocrResult.proposingCompany || prev.senderCompany || '',
        receiverList: targetReceiverList,
        nguoiDeNghi: extractedProposer || prev.nguoiDeNghi,
        chiHuyTruong: extractedProposer || prev.chiHuyTruong,
        doiTuong: {
          ...prev.doiTuong,
          congTrinh: ocrResult.congTrinh || extractCongTrinhFromDiaDiem(phanDiaDiemFile) || prev.doiTuong?.congTrinh || '',
          hangMuc: phanTuFile || prev.doiTuong?.hangMuc || '',
          diaDiem: phanDiaDiemFile || prev.doiTuong?.diaDiem || ''
        },
        items: mappedItems.map((it, idx) => ({
          id: it.id,
          stt: idx + 1,
          description: it.name,
          unit: it.unit,
          requestedQty: it.quantity,
          acceptedQty: it.quantity,
          isCustomAcceptedQty: false,
          note: it.note,
          unitPrice: it.unitPrice,
          total: it.total
        })),
        originalFileName: originalName,
        sourceType: 'PDF',
        selectedUnits: [],
        isGroupedDisplay: false,
        displayMode: 'DETAILED'
      }));

      // Auto-generate BM04 directly from BM02 state (identical date & format to BM03.2)
      setBm04Data(prev => ({
        ...prev,
        formType: 'BM04',
        title: (window as any)?._currentMaterialConfig?.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
        maPhieu: finalAppliedMaPhieu || safeFallbackMaPhieu(prev.maPhieu),
        docNumber: 'QTMH-BM04',
        date: bbntDate,
        startDate: bbntDate,
        endDate: bbntDate,
        address: phanDiaDiemFile,
        locationDetail: phanDiaDiemFile,
        project: ocrResult.congTrinh || extractCongTrinhFromDiaDiem(phanDiaDiemFile) || prev.project || '',
        category: phanTuFile || prev.category || '',
        senderCompany: ocrResult.nhaCungCap || ocrResult.proposingCompany || prev.senderCompany || '',
        receiverList: targetReceiverList,
        nguoiDeNghi: extractedProposer || prev.nguoiDeNghi,
        chiHuyTruong: extractedProposer || prev.chiHuyTruong,
        doiTuong: {
          ...prev.doiTuong,
          congTrinh: ocrResult.congTrinh || extractCongTrinhFromDiaDiem(phanDiaDiemFile) || prev.doiTuong?.congTrinh || '',
          hangMuc: phanTuFile || prev.doiTuong?.hangMuc || '',
          diaDiem: phanDiaDiemFile || prev.doiTuong?.diaDiem || ''
        },
        items: mappedItems.map((it, idx) => ({
          id: `BM04-ocr-${it.id || idx}`,
          stt: idx + 1,
          description: it.name,
          unit: it.unit,
          requestedQty: it.quantity,
          acceptedQty: it.quantity,
          isCustomAcceptedQty: false,
          note: it.note,
          unitPrice: it.unitPrice,
          total: it.total
        })),
        originalFileName: originalName,
        sourceType: 'PDF',
        selectedUnits: [],
        isGroupedDisplay: false,
        displayMode: 'DETAILED'
      }));

      (window as any)._currentOriginalFileName = originalName;
      (window as any)._currentBM02FileName = originalName;

      // Áp dụng lại cấu hình hệ thống
      if (window._cauHinh) {
        applyCauHinhToForms(window._cauHinh);
      }

      // Re-apply proposer after config load to guarantee preservation
      if (extractedProposer) {
        setKyTenBM02(prev => updateKyTenWithPBanDeNghi(prev, extractedProposer));
        setBbntData(prev => ({
          ...prev,
          receiverList: updateReceiverListWithChiHuyTruong(prev.receiverList, extractedProposer)
        }));
        setBm04Data(prev => ({
          ...prev,
          receiverList: updateReceiverListWithChiHuyTruong(prev.receiverList, extractedProposer)
        }));
      }

      setHasData(true);
      setCurrentRecordId(null);
      setIsProcessing(false);
      setActiveTab('BM02'); // Direct display in Template BM02 for immediate editing

      setToast({ message: 'Đã trích xuất AI OCR và đổ toàn bộ dữ liệu vào Template BM02!', type: 'success' });

    } catch (e: any) {
      console.error("Lỗi khi đổ dữ liệu OCR vào BM02:", e);
      setToast({ message: `Lỗi: ${e.message}`, type: 'error' });
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const mimeType = file.type || 'application/pdf';
          const base64 = (reader.result as string).split(',')[1];
          
          // Execute AI OCR extraction & Auto-map directly into BM02
          const ocrResult = await extractBm02Ocr(base64, mimeType, file.name);
          
          // Direct pipeline: map straight to BM02 template state and view
          await applyOcrResultToState(ocrResult);
        } catch (err: any) {
          console.error("Gemini OCR Error:", err);
          if (err.message?.includes("Requested entity was not found") || err.status === "NOT_FOUND") {
            setIsApiKeySelected(false);
            setError("Vui lòng chọn API Key để tiếp tục sử dụng dịch vụ AI.");
          } else if (err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("RESOURCE_EXHAUSTED")) {
            setError("Bạn đã vượt quá hạn mức sử dụng AI (Quota Exceeded). Vui lòng thử lại sau hoặc sử dụng API Key khác.");
          } else if (err.message?.includes("503") || err.message?.includes("high demand") || err.message?.includes("UNAVAILABLE")) {
            setError("Hệ thống AI hiện đang có lượng truy cập cao đột biến (503 High Demand). Vui lòng thử lại sau ít giây.");
          } else {
            setError(err.message || "Đã có lỗi xảy ra khi xử lý trích xuất AI OCR.");
          }
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || "Đã có lỗi xảy ra.");
      setIsProcessing(false);
    }
  };

  const handleConfirmOcr = async (confirmedData: OcrPreviewData) => {
    setIsOcrPreviewOpen(false);
    await applyOcrResultToState(confirmedData);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const getUnifiedOriginalName = () => {
    return bm02Data.originalFileName || bbntData.originalFileName || bm04Data.originalFileName || (typeof window !== 'undefined' && ((window as any)._currentOriginalFileName || (window as any)._currentBM02FileName)) || '';
  };

  const getExportBM02Data = (): FormData => {
    const orig = getUnifiedOriginalName();
    const processedItems = (bm02Data.items || []).map((it, idx) => {
      const q = Number(it.quantity) || 0;
      const p = Number(it.unitPrice) || 0;
      const t = it.total !== undefined && it.total !== null && !isNaN(Number(it.total))
        ? Number(it.total)
        : Math.round(q * p * 100) / 100;
      return {
        ...it,
        stt: idx + 1,
        quantity: q,
        unitPrice: p,
        total: t,
        lineTotal: t
      };
    });
    return {
      ...bm02Data,
      items: processedItems,
      docNumber: 'QTMH-BM02',
      originalFileName: bm02Data.originalFileName || orig,
      nguoiDeNghi: (window as any)._currentProposerName || bm02Data.nguoiDeNghi,
      pBanDeNghi: (window as any)._currentProposerName || bm02Data.pBanDeNghi
    };
  };

  const getExportBBNTData = (): BBNTData => {
    const orig = getUnifiedOriginalName();
    const d = (bbntData.date && !bbntData.date.includes('...') && !bbntData.date.includes('2025'))
      ? bbntData.date
      : (addOneDayToString(bm02Data.date) || bm02Data.date || '');
    return {
      ...bbntData,
      formType: 'BM03.2',
      docNumber: 'QTMH-BM03.2',
      originalFileName: bbntData.originalFileName || orig,
      category: bbntData.category || bm02Data.mucDichSuDungNoiDung || '',
      date: d,
      startDate: (bbntData.startDate && !bbntData.startDate.includes('...') && !bbntData.startDate.includes('2025')) ? bbntData.startDate : d,
      endDate: (bbntData.endDate && !bbntData.endDate.includes('...') && !bbntData.endDate.includes('2025')) ? bbntData.endDate : d,
      senderCompany: resolvedSenderCompany,
      bbnt_benA_congTy: resolvedSenderCompany,
      bbnt_nhaCungCap: resolvedSenderCompany,
      senderList: resolvedSenderList,
      bbnt_benA_daiDien: resolvedSenderList[0]?.name || bbntData.bbnt_benA_daiDien || '',
      receiverCompany: resolvedReceiverCompany,
      bbnt_benB_congTy: resolvedReceiverCompany,
      receiverList: resolvedReceiverList,
      bbnt_benB_daiDien: resolvedReceiverList[0]?.name || bbntData.bbnt_benB_daiDien || ''
    };
  };

  const getExportBM04Data = (): BBNTData => {
    const orig = getUnifiedOriginalName();
    const d = (bm04Data.date && !bm04Data.date.includes('...') && !bm04Data.date.includes('2025'))
      ? bm04Data.date
      : (bbntData.date && !bbntData.date.includes('...') && !bbntData.date.includes('2025')
          ? bbntData.date
          : (addOneDayToString(bm02Data.date) || bm02Data.date || ''));
    return {
      ...bm04Data,
      formType: 'BM04',
      docNumber: 'QTMH-BM04',
      originalFileName: bm04Data.originalFileName || orig,
      category: bm04Data.category || bbntData.category || bm02Data.mucDichSuDungNoiDung || '',
      date: d,
      startDate: (bm04Data.startDate && !bm04Data.startDate.includes('...') && !bm04Data.startDate.includes('2025')) ? bm04Data.startDate : d,
      endDate: (bm04Data.endDate && !bm04Data.endDate.includes('...') && !bm04Data.endDate.includes('2025')) ? bm04Data.endDate : d,
      senderCompany: resolvedSenderCompany,
      bbnt_benA_congTy: resolvedSenderCompany,
      bbnt_nhaCungCap: resolvedSenderCompany,
      senderList: resolvedSenderList,
      bbnt_benA_daiDien: resolvedSenderList[0]?.name || bm04Data.bbnt_benA_daiDien || '',
      receiverCompany: resolvedReceiverCompany,
      bbnt_benB_congTy: resolvedReceiverCompany,
      receiverList: resolvedReceiverList,
      bbnt_benB_daiDien: resolvedReceiverList[0]?.name || bm04Data.bbnt_benB_daiDien || ''
    };
  };

  const handleExport = () => {
    if (activeTab === 'BM02') {
      exportToDocx(getExportBM02Data(), logoUrl, kyTenBM02);
    } else if (activeTab === 'BM04') {
      exportBBNTToDocx(getExportBM04Data(), logoUrl);
    } else {
      exportBBNTToDocx(getExportBBNTData(), logoUrl);
    }
  };

  const handleExportAllDocx = async () => {
    // Export BM02, BM03.2, and BM04
    await exportToDocx(getExportBM02Data(), logoUrl, kyTenBM02);
    await exportBBNTToDocx(getExportBBNTData(), logoUrl);
    await exportBBNTToDocx(getExportBM04Data(), logoUrl);
  };

  const removeLogo = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLogoUrl(null);
  };

  const handleExcelExport = () => {
    if (activeTab === 'BM02') {
      exportToExcel(getExportBM02Data(), logoUrl, kyTenBM02);
    } else if (activeTab === 'BM04') {
      exportBBNTToExcel(getExportBM04Data(), logoUrl);
    } else {
      exportBBNTToExcel(getExportBBNTData(), logoUrl);
    }
  };

  const handlePdfExport = () => {
    const orig = getUnifiedOriginalName();
    const elementId = activeTab === 'BM02' ? 'document-bm02' : (activeTab === 'BM04' ? 'document-bm04' : 'document-bbnt');
    const fileName = activeTab === 'BM02' 
      ? (orig ? `${orig}_BM02` : `To_Trinh_BM02`)
      : (activeTab === 'BM04'
          ? (orig ? `${orig}_BM04` : `BB_Giao_Nhan_BM04`)
          : (orig ? `${orig}_BM03.2` : `BBNT_BM03.2`));
    exportToPDF(elementId, fileName);
  };

  const handleImageExport = () => {
    const orig = getUnifiedOriginalName();
    const elementId = activeTab === 'BM02' ? 'document-bm02' : (activeTab === 'BM04' ? 'document-bm04' : 'document-bbnt');
    const fileName = activeTab === 'BM02' 
      ? (orig ? `${orig}_BM02` : `To_Trinh_BM02`)
      : (activeTab === 'BM04'
          ? (orig ? `${orig}_BM04` : `BB_Giao_Nhan_BM04`)
          : (orig ? `${orig}_BM03.2` : `BBNT_BM03.2`));
    exportToImage(elementId, fileName);
  };

  const checkAndPromptPriceUpdate = async (rowItem: LineItem, newPrice: number) => {
    if (newPrice <= 0) return;

    try {
      const result = await OrderService.checkMasterMaterialItemByName(rowItem.name);
      if (result) {
        const { matchedTypeId, matchedItemId, oldPrice } = result;
        if (oldPrice !== newPrice) {
          setPriceConfirmData({
            itemId: matchedItemId, // mapping to masterItemId
            typeId: matchedTypeId, // extra field
            itemName: rowItem.name,
            oldPrice: oldPrice,
            newPrice: newPrice,
            rowId: rowItem.id,
            projectId: "", // Not needed for master material
            unitId: "" // Not needed for master material
          });
          setShowPriceConfirmModal(true);
        }
      }
    } catch (e) {
      console.error("Lỗi khi kiểm tra đơn giá danh mục:", e);
    }
  };

  const handleTogglePostTax = (newIsPostTax: boolean) => {
    setBm02Data(prev => {
      const currentIsPostTax = prev.isPostTax !== false; // default true
      if (currentIsPostTax === newIsPostTax) return prev;

      const taxRate = prev.taxRate !== undefined ? Number(prev.taxRate) : 8;
      const rateFactor = 1 + taxRate / 100;

      const newItems = (prev.items || []).map(item => {
        const oldPrice = Number(item.unitPrice) || 0;
        let newPrice = oldPrice;
        if (currentIsPostTax && !newIsPostTax) {
          // Convert from Post-tax to Pre-tax
          newPrice = Math.round(oldPrice / rateFactor);
        } else if (!currentIsPostTax && newIsPostTax) {
          // Convert from Pre-tax to Post-tax
          newPrice = Math.round(oldPrice * rateFactor);
        }
        const qty = Number(item.quantity) || 0;
        const newTotal = Math.round(qty * newPrice);
        return {
          ...item,
          unitPrice: newPrice,
          total: newTotal,
          lineTotal: newTotal
        };
      });

      const newTotalAmount = newItems.reduce((sum, it) => sum + (it.total || 0), 0);
      return {
        ...prev,
        isPostTax: newIsPostTax,
        items: newItems,
        totalAmount: newTotalAmount
      };
    });
  };

  const checkPriceChangesForSave = async (): Promise<BM02ItemPriceChange[]> => {
    return await BM02PriceUpdateService.compareWithMasterPrice(bm02Data.items || []);
  };

  const getMasterPriceForName = (itemName: string): number => {
    if (!itemName) return 0;
    const matched = timGiaVatTu(itemName, materialPrices);
    if (matched) {
      const { price } = getPriceForDate(matched, selectedPriceDate);
      if (price > 0) return price;
      return Number(matched.unitPrice) || extractPriceFromMaterial(matched) || 0;
    }
    return 0;
  };

  const updateBM02Item = (id: string, field: keyof LineItem, value: any) => {
    setBm02Data(prev => {
      const items = prev.items || [];
      const newItems = items.map(item => {
        if (item.id === id) {
          let updated = { ...item, [field]: value };
          
          if (field === 'name') {
            const material = timGiaVatTu(value, materialPrices);
            if (material) {
              const dateToUse = item.selectedPriceDate || selectedPriceDate;
              const { price, dateLabel } = getPriceForDate(material, dateToUse);
              const finalPrice = price > 0 ? price : (Number(material.unitPrice) || 0);
              const matName = material.tenVatTu || material.name || value;
              const matUnit = material.donVi || material.unit || updated.unit || 'm3';

              updated = {
                ...updated,
                unit: matUnit,
                unitPrice: finalPrice,
                total: Math.round((Number(updated.quantity) || 0) * finalPrice),
                priceFound: finalPrice > 0,
                priceDate: dateLabel || 'Đơn giá danh mục',
                selectedPriceDate: dateToUse,
                matchedCatalogId: material.id,
                isMatchedWithCatalog: true,
                matchedCatalogName: matName
              };
            } else {
              updated = {
                ...updated,
                priceFound: (Number(updated.unitPrice) || 0) > 0,
                isMatchedWithCatalog: false,
                matchedCatalogId: undefined,
                matchedCatalogName: undefined
              };
            }
          }

          if (field === 'quantity' || field === 'unitPrice') {
            const q = Number(updated.quantity) || 0;
            const p = Number(updated.unitPrice) || 0;
            const lTot = Math.round(q * p * 100) / 100;
            updated.total = lTot;
            updated.lineTotal = lTot;
          }

          // Check if user edited matched item post-fill
          if (updated.originalCatalogData) {
            const orig = updated.originalCatalogData;
            const isDiff = updated.name !== orig.name || updated.unit !== orig.unit || Number(updated.unitPrice) !== Number(orig.unitPrice);
            if (isDiff) {
              updated.isUserEditedPostFill = true;
              updated.userEditWarning = 'Thông tin vật tư đã thay đổi so với Danh mục quản lý vật tư.';
            } else {
              updated.isUserEditedPostFill = false;
              updated.userEditWarning = undefined;
            }
          }

          return updated;
        }
        return item;
      });

      return BM02PriceUpdateService.recalculateBM02Totals({ ...prev, items: newItems });
    });

    // Sync with BBNT (BM03.2) and BM04 in real-time
    const bm02ItemIndex = (bm02Data.items || []).findIndex(it => it.id === id);
    const currentBm02Item = bm02ItemIndex !== -1 ? bm02Data.items[bm02ItemIndex] : null;

    const syncItemToBBNT = (prevItems: BBNTItem[]) => {
      const items = prevItems || [];
      return items.map((item, idx) => {
        const isMatch = item.id === id || 
                        (item.id && id && (item.id.includes(id) || id.includes(item.id))) ||
                        (bm02ItemIndex !== -1 && idx === bm02ItemIndex) ||
                        (currentBm02Item && item.description && currentBm02Item.name && item.description.trim().toLowerCase() === currentBm02Item.name.trim().toLowerCase());

        if (isMatch) {
          const updated = { ...item };
          if (field === 'name') {
            updated.description = value;
            const material = timGiaVatTu(value, materialPrices);
            if (material) updated.unit = material.donVi || material.unit || updated.unit;
          }
          if (field === 'unit') updated.unit = value;
          if (field === 'quantity') {
            const numVal = Number(value) || 0;
            updated.requestedQty = numVal;
            // Mặc định đồng bộ 2 cột KL nghiệm thu (BM03.2) và KL giao nhận (BM04) theo BM02
            updated.acceptedQty = numVal;
            updated.isCustomAcceptedQty = false;
            updated.total = numVal * (Number(updated.unitPrice) || 0);
          }
          if (field === 'unitPrice') {
            const priceVal = Number(value) || 0;
            updated.unitPrice = priceVal;
            updated.total = (Number(updated.acceptedQty) || Number(updated.requestedQty) || 0) * priceVal;
          }
          if (field === 'note') {
            // CỘT ghi chú của BM03.2 và BM04: đồng bộ tức thời theo BM02
            updated.note = value || '';
          }
          return updated;
        }
        return item;
      });
    };

    setBbntData(prev => ({ ...prev, items: syncItemToBBNT(prev.items || []) }));
    setBm04Data(prev => ({ ...prev, items: syncItemToBBNT(prev.items || []) }));
  };

  const confirmAndRegisterMaterialToCatalog = async (item: LineItem) => {
    const nameTrim = (item.name || '').trim();
    const unitTrim = (item.unit || '').trim();
    const priceNum = Number(item.unitPrice) || 0;

    if (!nameTrim) {
      setToast({ message: 'Vui lòng nhập Tên vật tư!', type: 'error' });
      return;
    }
    if (!unitTrim) {
      setToast({ message: 'Vui lòng nhập Đơn vị tính (ĐVT)!', type: 'error' });
      return;
    }
    if (priceNum <= 0) {
      setToast({ message: 'Vui lòng nhập Đơn giá hợp lệ lớn hơn 0!', type: 'error' });
      return;
    }

    try {
      const activeLoai = currentMaterialType || (window as any)._loaiVatTuHienTai || 'BeTong';

      const res = await MaterialService.addOrUpdateMaterialInCatalog(activeLoai, {
        id: item.matchedCatalogId || item.id,
        name: nameTrim,
        unit: unitTrim,
        unitPrice: priceNum,
        specification: item.note || ''
      });

      if (res.success && res.item) {
        const catalogItem = res.item;
        // Save Alias for AI recognition in future OCRs
        const ocrName = (item as any).originalOcrName || nameTrim;
        MaterialMatchingService.saveAliasMapping(ocrName, {
          id: catalogItem.id,
          tenVatTu: catalogItem.tenVatTu || catalogItem.name,
          donVi: catalogItem.donVi || catalogItem.unit,
          giaHienHanh: priceNum
        });

        // Update item state in BM02
        setBm02Data(prev => {
          const items = (prev.items || []).map(it => {
            if (it.id === item.id) {
              return {
                ...it,
                name: catalogItem.tenVatTu || catalogItem.name,
                unit: catalogItem.donVi || catalogItem.unit,
                unitPrice: priceNum,
                total: Math.round((Number(it.quantity) || 0) * priceNum),
                matchedCatalogId: catalogItem.id,
                isMatchedWithCatalog: true,
                matchedCatalogName: catalogItem.tenVatTu || catalogItem.name,
                priceFound: true,
                priceDate: 'Đơn giá danh mục',
                isUserEditedPostFill: false,
                originalCatalogData: {
                  name: catalogItem.tenVatTu || catalogItem.name,
                  unit: catalogItem.donVi || catalogItem.unit,
                  unitPrice: priceNum,
                  maVatTu: catalogItem.id
                }
              };
            }
            return it;
          });
          return BM02PriceUpdateService.recalculateBM02Totals({ ...prev, items });
        });

        // Reload prices in memory
        await loadMaterialPrices();

        setToast({
          message: `Đã cập nhật vật tư "${catalogItem.tenVatTu || catalogItem.name}" vào Danh mục Quản lý vật tư!`,
          type: 'success'
        });
      }
    } catch (e: any) {
      console.error('Lỗi khi cập nhật vật tư vào Danh mục:', e);
      setToast({ message: `Lỗi: ${e.message || e}`, type: 'error' });
    }
  };

  const handleUnitPriceCommit = async (item: LineItem, newUnitPrice?: number) => {
    const currentPrice = newUnitPrice !== undefined ? newUnitPrice : Number(item.unitPrice || 0);
    if (!item.name || currentPrice <= 0) return;

    if (showSavePriceConfirmModal) return;

    if (item._lastConfirmedUnitPrice === currentPrice) return;

    const testItem = { ...item, unitPrice: currentPrice };
    const priceChanges = await BM02PriceUpdateService.compareWithMasterPrice([testItem], materialPrices);

    if (priceChanges.length > 0) {
      priceChanges[0].rowId = item.id;
      setSavePriceConfirmList(priceChanges);
      setSavePriceOption('MASTER_CATALOG');
      setShowSavePriceConfirmModal(true);
      setPendingSaveAction(null);
    } else {
      setBm02Data(prev => ({
        ...prev,
        items: (prev.items || []).map(i => i.id === item.id ? { ...i, _lastConfirmedUnitPrice: currentPrice } : i)
      }));
    }
  };

  const handleCancelPriceConfirm = () => {
    if (savePriceConfirmList && savePriceConfirmList.length > 0) {
      setBm02Data(prev => {
        const updatedItems = (prev.items || []).map(it => {
          const matched = savePriceConfirmList.find(c => 
            (c.rowId && c.rowId === it.id) || 
            (c.itemName && c.itemName.trim().toLowerCase() === it.name?.trim().toLowerCase())
          );
          if (matched) {
            return {
              ...it,
              unitPrice: matched.oldPrice,
              total: Math.round((Number(it.quantity) || 0) * matched.oldPrice),
              _lastConfirmedUnitPrice: matched.oldPrice
            };
          }
          return it;
        });
        return BM02PriceUpdateService.recalculateBM02Totals({ ...prev, items: updatedItems });
      });
      setToast({ message: "Đã hủy bỏ và khôi phục lại đơn giá cũ", type: "info" });
    }
    setShowSavePriceConfirmModal(false);
    setPendingSaveAction(null);
    setIsSaving(false);
  };

  const addBM02Item = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const stt = bm02Data.items.length + 1;
    
    const newItem: LineItem = {
      id,
      stt,
      name: '',
      unit: 'm3',
      quantity: 0,
      unitPrice: 0,
      total: 0,
      note: '',
      selectedPriceDate: selectedPriceDate,
      duToanQty: 0,
      luyKeQty: 0
    };
    
    const newBBNTItem: BBNTItem = {
      id,
      stt,
      description: '',
      unit: 'm3',
      requestedQty: 0,
      acceptedQty: 0,
      note: ''
    };

    setBm02Data(prev => {
      const newItems = [...prev.items, newItem];
      const newTotal = newItems.reduce((sum, item) => sum + (item.total || 0), 0);
      return { ...prev, items: newItems, totalAmount: newTotal };
    });
    setBbntData(prev => ({ ...prev, items: [...prev.items, newBBNTItem] }));
    setBm04Data(prev => ({ ...prev, items: [...prev.items, newBBNTItem] }));
  };

  const removeItem = (id: string) => {
    setBm02Data(prev => {
      const items = prev.items || [];
      const newItems = items.filter(item => item.id !== id).map((item, idx) => ({ ...item, stt: idx + 1 }));
      const newTotal = newItems.reduce((sum, item) => sum + (item.total || 0), 0);
      return { ...prev, items: newItems, totalAmount: newTotal };
    });
    setBbntData(prev => {
      const items = prev.items || [];
      const newItems = items.filter(item => item.id !== id).map((item, idx) => ({ ...item, stt: idx + 1 }));
      return { ...prev, items: newItems };
    });
    setBm04Data(prev => {
      const items = prev.items || [];
      const newItems = items.filter(item => item.id !== id).map((item, idx) => ({ ...item, stt: idx + 1 }));
      return { ...prev, items: newItems };
    });
  };

  const updateBBNTItem = (id: string, field: keyof BBNTItem, value: any, isBM04: boolean = false) => {
    const currentList = (isBM04 ? bm04Data.items : bbntData.items) || [];
    const targetIdx = currentList.findIndex(x => x.id === id || (x.id && id && (x.id.includes(id) || id.includes(x.id))));
    const targetItem = targetIdx !== -1 ? currentList[targetIdx] : null;

    const updater = (prevItems: BBNTItem[]) => {
      const items = prevItems || [];
      return items.map((item, idx) => {
        const isMatch = item.id === id || 
                        (item.id && id && (item.id.includes(id) || id.includes(item.id))) ||
                        (targetIdx !== -1 && idx === targetIdx) ||
                        (targetItem && item.description && targetItem.description && item.description.trim().toLowerCase() === targetItem.description.trim().toLowerCase());

        if (isMatch) {
          const updated = { ...item };
          if (field === 'acceptedQty') {
            const isEmpty = value === '' || value === null || value === undefined;
            if (isEmpty) {
              updated.isCustomAcceptedQty = false;
              updated.acceptedQty = updated.requestedQty || 0;
            } else {
              updated.isCustomAcceptedQty = true;
              updated.acceptedQty = Number(value) || 0;
            }
            updated.total = (updated.acceptedQty || 0) * (updated.unitPrice || 0);
          } else if (field === 'requestedQty') {
            const numReq = Number(value) || 0;
            updated.requestedQty = numReq;
            if (!updated.isCustomAcceptedQty) {
              updated.acceptedQty = numReq;
            }
            updated.total = (updated.acceptedQty || 0) * (updated.unitPrice || 0);
          } else if (field === 'total') {
            updated.total = Number(value) || 0;
          } else {
            (updated as any)[field] = value;
          }
          return updated;
        }
        return item;
      });
    };

    // Đồng bộ tức thời cả 2 biểu mẫu BM03.2 và BM04
    setBbntData(prev => ({ ...prev, items: updater(prev.items || []) }));
    setBm04Data(prev => ({ ...prev, items: updater(prev.items || []) }));

    // Đồng bộ về BM02 cho các trường chung
    if (field === 'description' || field === 'unit' || field === 'requestedQty' || field === 'note') {
      setBm02Data(prev => {
        const items = prev.items || [];
        const newItems = items.map((item, idx) => {
          const isMatch = item.id === id || 
                          (item.id && id && (item.id.includes(id) || id.includes(item.id))) ||
                          (targetIdx !== -1 && idx === targetIdx) ||
                          (targetItem && item.name && targetItem.description && item.name.trim().toLowerCase() === targetItem.description.trim().toLowerCase());
          if (isMatch) {
            const updated = { ...item };
            if (field === 'description') updated.name = value;
            if (field === 'unit') updated.unit = value;
            if (field === 'requestedQty') {
              updated.quantity = Number(value) || 0;
              updated.total = (updated.quantity || 0) * (updated.unitPrice || 0);
            }
            if (field === 'note') updated.note = value;
            return updated;
          }
          return item;
        });
        return BM02PriceUpdateService.recalculateBM02Totals({ ...prev, items: newItems });
      });
    }
  };

  // =========================================================================
  // ĐỒNG BỘ 2 CHIỀU GIỮA BM03.2 VÀ BM04 (BÊN GIAO, BÊN NHẬN, ĐỐI TƯỢNG, V.V.)
  // =========================================================================
  const syncSenderCompany = (company: string) => {
    setBbntData(prev => ({ ...prev, senderCompany: company, bbnt_benA_congTy: company, bbnt_nhaCungCap: company }));
    setBm04Data(prev => ({ ...prev, senderCompany: company, bbnt_benA_congTy: company, bbnt_nhaCungCap: company }));
    setBm02Data(prev => ({ ...prev, proposingCompany: company }));
  };

  const syncSenderRepresentative = (index: number, field: 'name' | 'position' | 'salutation', value: string) => {
    const updateList = (prevList: any[]) => {
      const list = [...(prevList || [])];
      while (list.length <= index) {
        list.push({ name: '', position: '', salutation: 'Ông' });
      }
      list[index] = { ...list[index], [field]: value };
      return list;
    };
    setBbntData(prev => {
      const base = (prev.senderList && prev.senderList.length > 0) ? prev.senderList : (bm04Data.senderList || []);
      return { ...prev, senderList: updateList(base) };
    });
    setBm04Data(prev => {
      const base = (prev.senderList && prev.senderList.length > 0) ? prev.senderList : (bbntData.senderList || []);
      return { ...prev, senderList: updateList(base) };
    });
  };

  const syncAddSenderRepresentative = () => {
    const newRep = { name: '', position: '', salutation: 'Ông' };
    setBbntData(prev => {
      const base = (prev.senderList && prev.senderList.length > 0) ? prev.senderList : (bm04Data.senderList || []);
      return { ...prev, senderList: [...base, newRep] };
    });
    setBm04Data(prev => {
      const base = (prev.senderList && prev.senderList.length > 0) ? prev.senderList : (bbntData.senderList || []);
      return { ...prev, senderList: [...base, newRep] };
    });
  };

  const syncRemoveSenderRepresentative = (index: number) => {
    setBbntData(prev => {
      const nl = [...(prev.senderList || bm04Data.senderList || [])];
      if (nl.length > index) {
        nl.splice(index, 1);
      }
      return { ...prev, senderList: nl };
    });
    setBm04Data(prev => {
      const nl = [...(prev.senderList || bbntData.senderList || [])];
      if (nl.length > index) {
        nl.splice(index, 1);
      }
      return { ...prev, senderList: nl };
    });
  };

  const syncReceiverCompany = (company: string) => {
    setBbntData(prev => ({ ...prev, receiverCompany: company, bbnt_benB_congTy: company }));
    setBm04Data(prev => ({ ...prev, receiverCompany: company, bbnt_benB_congTy: company }));
  };

  const syncReceiverList = (newList: BM032Representative[]) => {
    setBbntData(prev => ({ ...prev, receiverList: newList }));
    setBm04Data(prev => ({ ...prev, receiverList: newList }));

    // If Chỉ huy trưởng was updated in receiverList, auto-sync to P.BAN ĐỀ NGHỊ in BM02
    const chtRep = newList.find(r => isChiHuyTruongPosition(r.position));
    if (chtRep && chtRep.name && chtRep.name.trim()) {
      const cleanName = cleanProposerName(chtRep.name);
      (window as any)._currentProposerName = cleanName;
      setBm02Data(prev => ({ ...prev, nguoiDeNghi: cleanName, pBanDeNghi: cleanName, chiHuyTruong: cleanName }));
      setKyTenBM02(prev => updateKyTenWithPBanDeNghi(prev, cleanName));
    }
  };

  const syncLocation = (loc: string) => {
    setBbntData(prev => ({ ...prev, location: loc }));
    setBm04Data(prev => ({ ...prev, location: loc }));
  };

  const syncDate = (newDate: string) => {
    setBbntData(prev => ({ ...prev, date: newDate, startDate: newDate, endDate: newDate }));
    setBm04Data(prev => ({ ...prev, date: newDate, startDate: newDate, endDate: newDate }));
  };

  const syncProject = (project: string) => {
    setBbntData(prev => ({ ...prev, project, doiTuong: { ...(prev.doiTuong || {}), congTrinh: project } }));
    setBm04Data(prev => ({ ...prev, project, doiTuong: { ...(prev.doiTuong || {}), congTrinh: project } }));
  };

  const syncDiaDiem = (val: string) => {
    const autoProject = extractCongTrinhFromDiaDiem(val);
    setBbntData(prev => ({
      ...prev,
      address: val,
      locationDetail: val,
      project: autoProject || prev.project,
      doiTuong: { ...(prev.doiTuong || {}), diaDiem: val, congTrinh: autoProject || prev.doiTuong?.congTrinh }
    }));
    setBm04Data(prev => ({
      ...prev,
      address: val,
      locationDetail: val,
      project: autoProject || prev.project,
      doiTuong: { ...(prev.doiTuong || {}), diaDiem: val, congTrinh: autoProject || prev.doiTuong?.congTrinh }
    }));
    setBm02Data(prev => ({ ...prev, mucDichSuDungDiaDiem: val, location: val }));
  };

  const syncStartTime = (val: string) => {
    setBbntData(prev => ({ ...prev, startTime: val }));
    setBm04Data(prev => ({ ...prev, startTime: val }));
  };

  const syncEndTime = (val: string) => {
    setBbntData(prev => ({ ...prev, endTime: val }));
    setBm04Data(prev => ({ ...prev, endTime: val }));
  };

  const syncLocationDetail = (val: string) => {
    setBbntData(prev => ({ ...prev, locationDetail: val }));
    setBm04Data(prev => ({ ...prev, locationDetail: val }));
  };

  const syncGrounds = (index: number, val: string) => {
    setBbntData(prev => {
      const ng = [...(prev.grounds || bm04Data.grounds || [])];
      while (ng.length <= index) ng.push('');
      ng[index] = val;
      return { ...prev, grounds: ng };
    });
    setBm04Data(prev => {
      const ng = [...(prev.grounds || bbntData.grounds || [])];
      while (ng.length <= index) ng.push('');
      ng[index] = val;
      return { ...prev, grounds: ng };
    });
  };

  const syncAddGround = () => {
    setBbntData(prev => {
      const base = (prev.grounds && prev.grounds.length > 0) ? prev.grounds : (bm04Data.grounds || []);
      return { ...prev, grounds: [...base, ''] };
    });
    setBm04Data(prev => {
      const base = (prev.grounds && prev.grounds.length > 0) ? prev.grounds : (bbntData.grounds || []);
      return { ...prev, grounds: [...base, ''] };
    });
  };

  const syncRemoveGround = (index: number) => {
    setBbntData(prev => {
      const ng = [...(prev.grounds || bm04Data.grounds || [])];
      if (ng.length > index) ng.splice(index, 1);
      return { ...prev, grounds: ng };
    });
    setBm04Data(prev => {
      const ng = [...(prev.grounds || bbntData.grounds || [])];
      if (ng.length > index) ng.splice(index, 1);
      return { ...prev, grounds: ng };
    });
  };

  const renderBM02Row = (it: LineItem, idx: number, sttDisp: number) => {
    const isBM06Source = bm02Data.sourceType === 'BM06';
    const rowKey = it.id ? `bm02-row-${it.id}-${idx}` : `bm02-row-${idx}`;
    return (
      <tr key={rowKey} className="group text-xs">
        <td className="border border-black p-1 text-center font-bold relative">
          {sttDisp}
          {!isBM06Source && (
            <button 
              type="button"
              onClick={() => removeItem(it.id)}
              className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          )}
        </td>
        <td className="border border-black p-1">
            <div className="relative">
              {it.isProjectShared && (
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[8.5px] font-black bg-blue-600 text-white rounded uppercase">
                    CP DỰ ÁN • {getProjectTotalUnits(it.projectId) || it.totalProjectUnits || 1} CĂN
                  </span>
                  <span className="text-[8px] text-blue-700 font-bold bg-blue-50 px-1 py-0.5 rounded border border-blue-100">
                    Áp dụng cho: {bm02Data.selectedUnits?.length || 0}/{getProjectTotalUnits(it.projectId) || it.totalProjectUnits || 1} căn đang lập phiếu
                  </span>
                </div>
              )}
              <textarea 
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = `${Math.max(20, el.scrollHeight)}px`;
                  }
                }}
                rows={Math.max(1, (it.name || '').split('\n').reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 22)), 0))}
                className="w-full bg-transparent border-none text-red-600 font-medium focus:ring-0 p-0 text-xs resize-none overflow-hidden block leading-normal align-middle" 
                value={it.name || ''} 
                onChange={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.max(20, e.target.scrollHeight)}px`;
                  if (!isBM06Source) handleMaterialSearch(it.id, e.target.value);
                }}
                onFocus={() => {
                  if (!isBM06Source) {
                    setFocusedItemId(it.id);
                    if (!it.name || !it.name.trim()) {
                      setSuggestions(materialPrices || []);
                    } else {
                      handleMaterialSearch(it.id, it.name);
                    }
                  }
                }}
                onClick={() => {
                  if (!isBM06Source) {
                    setFocusedItemId(it.id);
                    if (!it.name || !it.name.trim()) {
                      setSuggestions(materialPrices || []);
                    } else {
                      handleMaterialSearch(it.id, it.name);
                    }
                  }
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setFocusedItemId(prev => prev === it.id ? null : prev);
                  }, 250);
                  if (it.name && it.name.trim() && !it.isMatchedWithCatalog) {
                    const matched = timGiaVatTu(it.name, materialPrices);
                    if (matched) {
                      selectMaterial(it.id, matched);
                    }
                  }
                }}
                readOnly={isBM06Source}
                style={{ minHeight: '1.25rem' }}
                placeholder="Chọn hoặc nhập tên vật tư..."
              />
              {!isBM06Source && focusedItemId === it.id && (suggestions || []).length > 0 && (
                <div className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-[999] max-h-60 overflow-y-auto">
                  {(suggestions || []).map(s => {
                    const sName = s.tenVatTu || (s as any).name;
                    const sUnit = s.donVi || (s as any).unit;
                    const sPrice = Number(s.unitPrice) || getLatestPriceInfo(s).price || 0;
                    const sSpec = s.quyCach || (s as any).specification;
                    return (
                      <button
                        type="button"
                        key={s.id}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs transition-colors border-b border-slate-100 last:border-none cursor-pointer flex items-center justify-between gap-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectMaterial(it.id, s);
                        }}
                      >
                        <div>
                          <div className="font-bold text-slate-900">{sName}</div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            {sUnit} {sSpec ? `• ${sSpec}` : ''}
                          </div>
                        </div>
                        <div className="text-[11px] font-mono font-bold text-blue-700 whitespace-nowrap">
                          {sPrice > 0 ? `${sPrice.toLocaleString('vi-VN')} đ` : 'Chưa có giá'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {(() => {
                const isNamePresent = !!(it.name && it.name.trim());
                const catalogMatch = isNamePresent ? timGiaVatTu(it.name, materialPrices) : null;
                const isExisting = !!catalogMatch || !!it.isMatchedWithCatalog;

                if (!isBM06Source && isNamePresent && !isExisting) {
                  return (
                    <div className="flex items-center gap-1.5 mt-1 print:hidden">
                      <button
                        type="button"
                        onClick={async () => {
                          const activeLoai = currentMaterialType || (window as any)._loaiVatTuHienTai || 'BeTong';
                          const res = await MaterialService.addOrUpdateMaterialInCatalog(activeLoai, {
                            name: it.name,
                            unit: it.unit || 'm3',
                            unitPrice: Number(it.unitPrice) || 0,
                            specification: it.note || ''
                          });
                          if (res.success && res.item) {
                            await loadMaterialPrices();
                            setBm02Data(prev => ({
                              ...prev,
                              items: (prev.items || []).map(r => r.id === it.id ? {
                                ...r,
                                matchedCatalogId: res.item.id,
                                isMatchedWithCatalog: true,
                                matchedCatalogName: res.item.tenVatTu || res.item.name,
                                priceFound: Number(r.unitPrice) > 0,
                                priceDate: 'Đơn giá danh mục'
                              } : r)
                            }));
                            setToast({
                              type: 'success',
                              message: `Đã thêm mới vật tư "${it.name}" vào Danh mục vật tư (${activeLoai})!`
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold transition-all cursor-pointer shadow-2xs"
                        title="Thêm trực tiếp vật tư này vào Danh mục Quản lý vật tư"
                      >
                        <Plus size={11} className="text-blue-600 shrink-0" />
                        <span>Thêm vào Danh mục</span>
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
              {it.isUserEditedPostFill && (
                <div className="flex items-center gap-1.5 p-1 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] mt-1 print:hidden">
                  <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                  <span className="font-semibold text-[10px]">Thông tin vật tư đã thay đổi so với Danh mục quản lý vật tư.</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const activeLoai = (window as any)._loaiVatTuHienTai || 'BeTong';
                      const ok = await MaterialMatchingService.syncEditedItemToCatalog(
                        activeLoai,
                        {
                          id: it.matchedCatalogId || it.id,
                          name: it.name,
                          unit: it.unit,
                          unitPrice: it.unitPrice,
                          quyCach: it.note
                        }
                      );
                      if (ok) {
                        setBm02Data(prev => ({
                          ...prev,
                          items: (prev.items || []).map(row => row.id === it.id ? {
                            ...row,
                            isUserEditedPostFill: false,
                            userEditWarning: undefined,
                            originalCatalogData: {
                              name: it.name,
                              unit: it.unit,
                              unitPrice: it.unitPrice,
                              quyCach: it.note
                            }
                          } : row)
                        }));
                        setToast({ type: 'success', message: 'Đã đồng bộ thông tin vật tư mới vào Danh mục quản lý vật tư!' });
                      }
                    }}
                    className="ml-auto px-1.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[9px] cursor-pointer whitespace-nowrap"
                  >
                    Đồng bộ vào Danh mục
                  </button>
                </div>
              )}
            </div>
        </td>
        <td className="border border-black p-1">
            <input 
              className="w-full bg-transparent border-none text-center text-red-600 focus:ring-0 p-0 text-xs" 
              value={it.unit || ''} 
              onChange={(e) => !isBM06Source && updateBM02Item(it.id, 'unit', e.target.value)} 
              readOnly={isBM06Source}
            />
        </td>
        <td className="border border-black p-1 text-center font-bold">
            <VNFormattedInput className="font-bold text-center text-xs text-red-600" value={it.duToanQty || 0} onChange={(val) => !isBM06Source && updateBM02Item(it.id, 'duToanQty', val)} readOnly={isBM06Source} />
        </td>
        <td className="border border-black p-1 text-center font-bold">
            <VNFormattedInput className="font-bold text-center text-xs" value={it.luyKeQty || 0} onChange={(val) => !isBM06Source && updateBM02Item(it.id, 'luyKeQty', val)} readOnly={isBM06Source} />
        </td>
        <td className="border border-black p-1 text-center font-bold">
            <VNFormattedInput className="font-bold text-center text-xs text-red-600" value={it.quantity || 0} onChange={(val) => !isBM06Source && updateBM02Item(it.id, 'quantity', val)} readOnly={isBM06Source} />
        </td>
        <td className="border border-black p-1 text-center font-bold">
          {(() => {
            const masterVal = getMasterPriceForName(it.name);
            const currentVal = Number(it.unitPrice) || 0;
            const isDifferent = masterVal > 0 && currentVal > 0 && masterVal !== currentVal;
            const isMatched = masterVal > 0 && currentVal > 0 && masterVal === currentVal;
            const hasNoMasterPrice = masterVal === 0 && currentVal > 0;

            return (
              <div className="relative group/price flex items-center justify-center gap-1">
                <VNFormattedInput 
                  isCurrency={true}
                  className={`font-bold text-center text-xs w-full ${isDifferent ? 'text-amber-600 font-black' : 'text-red-600'}`} 
                  value={it.unitPrice || 0} 
                  onChange={(val) => updateBM02Item(it.id, 'unitPrice', val)} 
                  onCommit={(val) => handleUnitPriceCommit(it, val)}
                />
                
                {isMatched && (
                  <div 
                    className="shrink-0 text-[11px] cursor-help transition-transform hover:scale-125 select-none print:hidden" 
                    title={`🟢 Đồng bộ: đơn giá trùng với Danh mục vật tư.\n• Đơn giá Danh mục: ${masterVal.toLocaleString('vi-VN')} đ\n• Đơn giá trên BM02: ${currentVal.toLocaleString('vi-VN')} đ`}
                  >
                    🟢
                  </div>
                )}

                {(isDifferent || hasNoMasterPrice) && (
                  <div className="flex items-center gap-1 shrink-0 print:hidden">
                    <div 
                      className="text-[11px] cursor-help animate-pulse transition-transform hover:scale-125 select-none" 
                      title={hasNoMasterPrice ? `🟡 Vật tư chưa có đơn giá trong Danh mục. Bấm "Lưu" để lưu giá này vào Danh mục.` : `🟡 Đã chỉnh sửa: đơn giá trên BM02 khác với Danh mục vật tư\n• Đơn giá Danh mục: ${masterVal.toLocaleString('vi-VN')} đ\n• Đơn giá trên BM02: ${currentVal.toLocaleString('vi-VN')} đ`}
                    >
                      🟡
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const activeLoai = currentMaterialType || (window as any)._loaiVatTuHienTai || 'BeTong';
                        const res = await MaterialService.addOrUpdateMaterialInCatalog(activeLoai, {
                          id: it.matchedCatalogId,
                          name: it.name,
                          unit: it.unit || 'm3',
                          unitPrice: currentVal,
                          specification: it.note || ''
                        });
                        if (res.success && res.item) {
                          await loadMaterialPrices();
                          setBm02Data(prev => ({
                            ...prev,
                            items: (prev.items || []).map(r => r.id === it.id ? {
                              ...r,
                              matchedCatalogId: res.item.id,
                              isMatchedWithCatalog: true,
                              matchedCatalogName: res.item.tenVatTu || res.item.name,
                              isUserEditedPostFill: false,
                              _lastConfirmedUnitPrice: currentVal
                            } : r)
                          }));
                          setToast({
                            type: 'success',
                            message: `Đã cập nhật đơn giá ${currentVal.toLocaleString('vi-VN')} đ của "${it.name}" vào Danh mục vật tư (${activeLoai})!`
                          });
                        }
                      }}
                      className="px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded border border-amber-300 font-extrabold text-[9px] transition-all cursor-pointer flex items-center gap-0.5 shadow-2xs whitespace-nowrap"
                      title="Cập nhật trực tiếp đơn giá này ngược lại vào Danh mục quản lý vật tư"
                    >
                      <Save size={10} className="text-amber-700 shrink-0" />
                      <span>Lưu giá</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </td>
        <td className="border border-black p-1 text-right font-bold text-xs">
            {formatBM02Currency((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
        </td>
        <td className="border border-black p-1 text-left">
            <input className="w-full bg-transparent border-none focus:ring-0 p-0 text-xs" value={it.note || ''} onChange={(e) => updateBM02Item(it.id, 'note', e.target.value)} />
        </td>
      </tr>
    );
  };

  const syncAcceptedQtyAndNotesFromBM02 = () => {
    const bm02Items = bm02Data.items || [];
    const syncMapper = (items: BBNTItem[]) => {
      return (items || []).map((bItem, idx) => {
        const matchedBM02 = bm02Items.find(it => it.id === bItem.id || (it.id && bItem.id && (it.id.includes(bItem.id) || bItem.id.includes(it.id)))) ||
                            bm02Items[idx] ||
                            bm02Items.find(it => it.name && bItem.description && it.name.trim().toLowerCase() === bItem.description.trim().toLowerCase());
        if (matchedBM02) {
          const q = Number(matchedBM02.quantity) || 0;
          return {
            ...bItem,
            requestedQty: q,
            acceptedQty: q,
            isCustomAcceptedQty: false,
            note: matchedBM02.note !== undefined ? matchedBM02.note : (bItem.note || ''),
            unitPrice: Number(matchedBM02.unitPrice) || Number(bItem.unitPrice) || 0,
            total: q * (Number(matchedBM02.unitPrice) || Number(bItem.unitPrice) || 0)
          };
        }
        return bItem;
      });
    };

    setBbntData(prev => ({ ...prev, items: syncMapper(prev.items || []) }));
    setBm04Data(prev => ({ ...prev, items: syncMapper(prev.items || []) }));
    setToast({ message: "Đã đồng bộ lại toàn bộ KL nghiệm thu, KL giao nhận và Ghi chú theo BM02!", type: "success" });
  };

  const renderBBNTRow = (it: BBNTItem, idx: number, sttDisp: number, isBM04: boolean = false) => {
    const rowKey = it.id ? `${isBM04 ? 'bm04' : 'bbnt'}-row-${it.id}-${idx}` : `${isBM04 ? 'bm04' : 'bbnt'}-row-${idx}`;
    return (
      <tr key={rowKey} className="group text-[11px] hover:bg-slate-50 transition-colors">
        <td className="border border-black p-1 text-center font-bold">
          {sttDisp}
        </td>
        <td className="border border-black p-1 text-left font-semibold">
            <textarea 
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = `${Math.max(20, el.scrollHeight)}px`;
                }
              }}
              rows={Math.max(1, (stripAppliedUnitsSuffix(it.description || '')).split('\n').reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 22)), 0))}
              className={`w-full bg-transparent border-none ${isBM04 ? 'text-emerald-800' : 'text-red-650'} focus:ring-0 p-0 resize-none overflow-hidden block leading-normal align-middle`} 
              value={stripAppliedUnitsSuffix(it.description || '')} 
              onChange={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.max(20, e.target.scrollHeight)}px`;
                updateBBNTItem(it.id, 'description', e.target.value, isBM04);
              }} 
              style={{ minHeight: '1.25rem' }}
            />
        </td>
        <td className="border border-black p-1 text-center">
            <input className={`w-full bg-transparent border-none text-center ${isBM04 ? 'text-emerald-800' : 'text-red-650'} focus:ring-0 p-0`} value={it.unit || ''} onChange={(e) => updateBBNTItem(it.id, 'unit', e.target.value, isBM04)} />
        </td>
        <td className="border border-black p-1 font-bold text-center">
            <VNFormattedInput className="font-bold text-center" value={it.requestedQty || 0} onChange={(val) => updateBBNTItem(it.id, 'requestedQty', val, isBM04)} />
        </td>
        <td className="border border-black p-1 font-bold text-center">
            <VNFormattedInput className="font-bold text-center" value={it.acceptedQty || 0} onChange={(val) => {
                updateBBNTItem(it.id, 'acceptedQty', val, isBM04);
                const newTotal = val * (it.unitPrice || 0);
                updateBBNTItem(it.id, 'total', newTotal, isBM04);
            }} />
        </td>
        <td className="border border-black p-1 text-left">
            <input className="w-full bg-transparent border-none focus:ring-0 p-0" value={it.note || ''} onChange={(e) => updateBBNTItem(it.id, 'note', e.target.value, isBM04)} />
        </td>
      </tr>
    );
  };

  if (!currentUser) {
    return (
      <Auth 
        onLogin={(user) => {
          localStorage.setItem('currentUser', JSON.stringify(user));
          setCurrentUser(user);
          setCurrentMaterialType(null);
          localStorage.removeItem('bti_current_material_type');
        }} 
      />
    );
  }

  const fixedSenderCompanyRender = getFixedSenderCompany((window as any)._currentMaterialConfig, (window as any)._cauHinh);
  const fixedSenderRepsRender = getFixedSenderRepresentatives((window as any)._currentMaterialConfig, (window as any)._cauHinh);

  const resolvedSenderCompany = (!currentRecordId && isValidSenderCompany(fixedSenderCompanyRender))
    ? fixedSenderCompanyRender
    : (isValidSenderCompany(bbntData.senderCompany)
      ? bbntData.senderCompany
      : (isValidSenderCompany(bm04Data.senderCompany)
        ? bm04Data.senderCompany
        : (fixedSenderCompanyRender || bbntData.senderCompany || bm04Data.senderCompany || '')));

  const resolvedSenderList = (!currentRecordId && fixedSenderRepsRender.length > 0 && fixedSenderRepsRender[0].name.trim() !== '')
    ? (hasValidRepresentatives(bbntData.senderList) ? bbntData.senderList : fixedSenderRepsRender)
    : (hasValidRepresentatives(bbntData.senderList)
      ? bbntData.senderList
      : (hasValidRepresentatives(bm04Data.senderList)
        ? bm04Data.senderList
        : (fixedSenderRepsRender.length > 0
          ? fixedSenderRepsRender
          : [{ salutation: 'Ông', name: '', position: '' }])));

  const resolvedGroundsList = (bbntData.grounds && bbntData.grounds.length > 0)
    ? bbntData.grounds
    : ((bm04Data.grounds && bm04Data.grounds.length > 0) ? bm04Data.grounds : INITIAL_BM03.grounds);

  const resolvedReceiverCompany = bbntData.receiverCompany || bm04Data.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC';

  const baseReceiverList = (bbntData.receiverList && bbntData.receiverList.length > 0)
    ? bbntData.receiverList
    : ((bm04Data.receiverList && bm04Data.receiverList.length > 0) ? bm04Data.receiverList : DEFAULT_RECEIVER_LIST);

  const activeProposer = (window as any)._currentProposerName || bm02Data.nguoiDeNghi;
  const resolvedReceiverList = activeProposer
    ? updateReceiverListWithChiHuyTruong(baseReceiverList, activeProposer)
    : baseReceiverList;

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      {/* SIDEBAR BÊN TRÁI */}
      <aside className={`transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-[#1e293b] flex flex-col border-r border-slate-800 flex-shrink-0 relative z-40`}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3 min-h-[73px]">
          <div 
            onClick={resetToMain}
            className="flex items-center gap-2 cursor-pointer hover:bg-slate-800/30 p-1.5 -m-1.5 rounded-lg transition-colors flex-shrink-0"
            title="Về cửa sổ chính & Reset"
          >
            <div className="bg-slate-800 w-9 h-9 rounded-lg flex items-center justify-center text-blue-500 flex-shrink-0 overflow-hidden">
              {brandConfig.logoBase64 ? (
                <img src={brandConfig.logoBase64} alt="Brand Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <LayoutGrid size={20} />
              )}
            </div>
            {!sidebarCollapsed && (
              <h1 className="text-lg font-black text-white tracking-tight leading-none animate-fade-in uppercase">
                {brandConfig.whiteText || "BTI"}{" "}
                <span className="text-blue-500">{brandConfig.colorText || "Smart"}</span>
              </h1>
            )}
          </div>
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors flex-shrink-0"
            title={sidebarCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}          </button>
        </div>

        <div className={`flex-1 overflow-y-auto custom-scrollbar ${sidebarCollapsed ? 'p-2' : 'p-4'} flex flex-col gap-6`}>
          
          {/* CHỌN VẬT TƯ */}
          {canEdit(currentUser) && (
            <>
          <div className="space-y-1">
            {!sidebarCollapsed && (
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2">CHỌN VẬT TƯ</p>
            )}
            {sidebarCollapsed ? (
              <div className="flex flex-col gap-2 items-center">
                {danhSachVatTu.filter(item => item.trangThai !== 'hidden').map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      handleInterceptAction(() => {
                        chonLoaiVatTu(item.id);
                      });
                    }}
                    title={item.ten}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${currentMaterialType === item.id ? 'bg-blue-600 border border-blue-500 text-white scale-110 shadow-lg shadow-blue-500/20' : 'bg-slate-800 hover:bg-slate-705 text-slate-300 border border-transparent'}`}
                  >
                    {item.icon}
                  </button>
                ))}
              </div>
            ) : (
              <div className="relative">
                <select 
                  value={currentMaterialType || ''}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    if (nextVal) {
                      handleInterceptAction(() => {
                        chonLoaiVatTu(nextVal);
                      });
                    } else {
                      handleInterceptAction(() => {
                        setCurrentMaterialType(null);
                      });
                    }
                  }}
                  className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer pr-10"
                >
                  <option value="" disabled>-- Chọn vật tư cần trình --</option>
                  {danhSachVatTu.filter(item => item.trangThai !== 'hidden').map(item => (
                    <option key={item.id} value={item.id}>{item.ten}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            )}
          </div>

          <div className="w-full h-px bg-slate-800"></div>
            </>
          )}

          {/* QUẢN LÝ */}
          <div className="space-y-1">
            {!sidebarCollapsed && (
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2">QUẢN LÝ</p>
            )}
            
            {sidebarCollapsed ? (
              <div className="flex flex-col gap-2 items-center">
                <button 
                  onClick={() => handleInterceptAction(async () => { await loadRecords(); setShowHistory(true); })} 
                  title="Lịch sử trình phiếu"
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white bg-transparent border border-transparent transition-all cursor-pointer"
                >
                  <History size={18} />
                </button>
                <button 
                  onClick={() => handleInterceptAction(() => setIsManageMode(!isManageMode))} 
                  title="Quản lý vật tư"
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer ${isManageMode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white bg-transparent border border-transparent'}`}
                >
                  <Settings size={18} />
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <button 
                  onClick={() => handleInterceptAction(async () => { await loadRecords(); setShowHistory(true); })} 
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                >
                  <History size={18} /> Lịch sử trình phiếu
                </button>
                <button 
                  onClick={() => handleInterceptAction(() => setIsManageMode(!isManageMode))} 
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${isManageMode ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  <Settings size={18} /> Quản lý vật tư
                </button>
              </div>
            )}
          </div>

          <div className="w-full h-px bg-slate-800"></div>

          {/* CẤU HÌNH */}
          <div className="space-y-1">
            {!sidebarCollapsed && (
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2">CẤU HÌNH</p>
            )}
            {sidebarCollapsed ? (
              <div className="flex flex-col gap-2 items-center">
                {isAdmin(currentUser) ? (
                  <>
                    <button 
                      onClick={() => handleInterceptAction(() => setShowMaterialContentConfig(true))} 
                      title="Cấu hình nội dung VT"
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white bg-transparent border border-transparent transition-all cursor-pointer"
                    >
                      <Files size={18} />
                    </button>
                    <button 
                      onClick={() => handleInterceptAction(() => setShowFirebaseModal(true))} 
                      title="Cấu hình Firebase"
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white bg-transparent border border-transparent transition-all cursor-pointer"
                    >
                      <Database size={18} />
                    </button>
                    <button 
                      onClick={() => handleInterceptAction(() => switchTab('QuanLyUser'))} 
                      title="Tài khoản-Nhật ký"
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer ${activeTab === 'QuanLyUser' || activeTab === 'NhatKyAudit' ? 'bg-rose-600/25 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                    >
                      <Users size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      disabled 
                      title="Chỉ tài khoản Admin được truy cập" 
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 bg-transparent opacity-30 cursor-not-allowed border border-transparent relative"
                    >
                      <Files size={18} />
                      <Lock size={10} className="absolute bottom-1 right-1 text-rose-400 bg-[#0f172a] rounded-full p-[1px]" />
                    </button>
                    <button 
                      disabled 
                      title="Chỉ tài khoản Admin được truy cập" 
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 bg-transparent opacity-30 cursor-not-allowed border border-transparent relative"
                    >
                      <Database size={18} />
                      <Lock size={10} className="absolute bottom-1 right-1 text-rose-400 bg-[#0f172a] rounded-full p-[1px]" />
                    </button>
                    <button 
                      disabled 
                      title="Chỉ tài khoản Admin được truy cập" 
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 bg-transparent opacity-30 cursor-not-allowed border border-transparent relative"
                    >
                      <Users size={18} />
                      <Lock size={10} className="absolute bottom-1 right-1 text-rose-400 bg-[#0f172a] rounded-full p-[1px]" />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {isAdmin(currentUser) ? (
                  <>
                    <button 
                      onClick={() => handleInterceptAction(() => setShowMaterialContentConfig(true))} 
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer animate-pulse-subtle"
                    >
                      <Files size={18} /> Cấu hình nội dung VT
                    </button>
                    <button 
                      onClick={() => handleInterceptAction(() => setShowFirebaseModal(true))} 
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                    >
                      <Database size={18} /> Cấu hình Firebase
                    </button>
                    <button 
                      onClick={() => handleInterceptAction(() => switchTab('QuanLyUser'))} 
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${activeTab === 'QuanLyUser' || activeTab === 'NhatKyAudit' ? 'bg-rose-600/20 text-rose-400 font-bold border-l-2 border-rose-500' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                    >
                      <Users size={18} /> Tài khoản-Nhật ký
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      disabled 
                      title="Chỉ tài khoản Admin được truy cập" 
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 opacity-40 cursor-not-allowed"
                    >
                      <Files size={18} /> Cấu hình nội dung VT
                      <Lock size={14} className="text-slate-500 ml-auto shrink-0" />
                    </button>
                    <button 
                      disabled 
                      title="Chỉ tài khoản Admin được truy cập" 
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 opacity-40 cursor-not-allowed"
                    >
                      <Database size={18} /> Cấu hình Firebase
                      <Lock size={14} className="text-slate-500 ml-auto shrink-0" />
                    </button>
                    <button 
                      disabled 
                      title="Chỉ tài khoản Admin được truy cập" 
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 opacity-40 cursor-not-allowed"
                    >
                      <Users size={18} /> Tài khoản-Nhật ký
                      <Lock size={14} className="text-slate-500 ml-auto shrink-0" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => handleInterceptAction(handleLogout)}
            title={sidebarCollapsed ? "Đăng xuất" : undefined}
            className={`w-full flex items-center justify-center ${sidebarCollapsed ? 'p-2' : 'gap-2 px-4 py-2.5'} bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold transition-all border border-slate-700/50 cursor-pointer`}
          >
            <LogOut size={16} /> 
            {!sidebarCollapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>

      {showThemVatTuModal && (
        <ThemVatTuModal 
          onClose={() => {
            setShowThemVatTuModal(false);
            setVatTuCanSua(undefined);
          }}
          onSave={luuVatTuMoi}
          danhSachHienTai={danhSachVatTu}
          vatTuCanSua={vatTuCanSua}
        />
      )}

      {showFirebaseModal && isAdmin(currentUser) && (
        <FirebaseModal onClose={() => setShowFirebaseModal(false)} currentUser={currentUser} setToast={setToast} />
      )}

      {/* AI OCR Preview Modal */}
      <BM02OcrPreviewModal
        isOpen={isOcrPreviewOpen}
        ocrData={ocrPreviewData}
        onClose={() => {
          setIsOcrPreviewOpen(false);
          setOcrPreviewData(null);
        }}
        onConfirm={handleConfirmOcr}
      />




      {showPriceConfirmModal && priceConfirmData && (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in text-slate-800">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-up">
            <header className="p-5 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2.5 rounded-full">
                <RefreshCw size={20} className="animate-spin-slow" />
              </div>
              <div>
                <h3 className="font-extrabold text-blue-900 text-base leading-tight">Cập Nhật Đơn Giá Dự Toán</h3>
                <p className="text-[11px] text-blue-700 font-medium">Hệ thống phát hiện thay đổi đơn giá nguyên vật liệu</p>
              </div>
            </header>
            
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase">Vật tư:</span>
                  <span className="text-slate-800 font-extrabold text-right">{priceConfirmData.itemName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase">Hạng mục:</span>
                  <span className="text-slate-800 font-extrabold text-right">Toàn hệ thống (Danh mục quản lý)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-xl">
                  <div className="text-[10px] text-rose-500 font-bold uppercase tracking-wider mb-0.5">Đơn giá cũ</div>
                  <div className="text-sm font-extrabold text-rose-700 line-through">
                    {(priceConfirmData.oldPrice || 0).toLocaleString('vi-VN')} đ
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-3.5 rounded-xl">
                  <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-0.5">Đơn giá mới</div>
                  <div className="text-sm font-extrabold text-emerald-700">
                    {(priceConfirmData.newPrice || 0).toLocaleString('vi-VN')} đ
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 font-medium text-justify leading-relaxed">
                Bạn có muốn cập nhật đơn giá mới này vào Danh mục quản lý vật tư chính không? Nếu đồng ý, đơn giá mới sẽ được áp dụng tự động cho các phiếu sau này. Nếu chọn không, đơn giá mới chỉ áp dụng cho phiếu BM02 hiện tại.
              </p>
            </div>

            <footer className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  // Do not revert, just close and keep the price for current BM02
                  setShowPriceConfirmModal(false);
                  setPriceConfirmData(null);
                  setToast({ message: "Đã áp dụng đơn giá cho phiếu hiện tại", type: "success" });
                }}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-600 transition-all uppercase tracking-wide cursor-pointer"
              >
                Chỉ áp dụng BM02
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await OrderService.updateMasterMaterialPrice(
                      priceConfirmData.typeId,
                      priceConfirmData.itemId,
                      priceConfirmData.newPrice
                    );

                    // Log activity
                    await AuditLogService.log(
                      currentUser?.username || 'khách',
                      currentUser?.role || 'viewer',
                      'UPDATE',
                      'BM02',
                      `Cập nhật giá vật tư "${priceConfirmData.itemName}" từ BM02: ${priceConfirmData.oldPrice.toLocaleString('vi-VN')} -> ${priceConfirmData.newPrice.toLocaleString('vi-VN')} đ`,
                      priceConfirmData.itemId,
                      null,
                      null,
                      { name: priceConfirmData.itemName, oldPrice: priceConfirmData.oldPrice, newPrice: priceConfirmData.newPrice, source: 'BM02' }
                    ).catch(() => {});

                    setToast({ message: "Cập nhật đơn giá vào Danh mục vật tư thành công!", type: "success" });
                  } catch (err: any) {
                    setToast({ message: `Lỗi cập nhật: ${err.message || err}`, type: "error" });
                  }
                  setShowPriceConfirmModal(false);
                  setPriceConfirmData(null);
                }}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-blue-100 uppercase tracking-wide cursor-pointer"
              >
                Đồng ý cập nhật
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* KHU VỰC NỘI DUNG CHÍNH (MAIN AREA) */}
      {isAdmin(currentUser) && (activeTab === 'NhatKyAudit' || activeTab === 'QuanLyUser') ? (
        <div className="flex-grow flex flex-col min-w-0 bg-[#0f172a] text-slate-200 overflow-y-auto p-6 scrollbar-thin">
          <div className="max-w-7xl mx-auto w-full">
            <div className="flex justify-end items-center mb-3">
              <button 
                onClick={() => {
                  switchTab('BM02'); 
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg text-xs font-bold transition-all uppercase tracking-wider cursor-pointer border border-slate-700"
              >
                Quay lại biểu mẫu
              </button>
            </div>
            <QuanTriTab 
              currentUser={currentUser} 
              initialSubTab={activeTab === 'QuanLyUser' ? 'users' : 'logs'} 
              onClose={() => {
                switchTab('BM02');
              }} 
            />
          </div>
        </div>
      ) : isManageMode ? (
        <MaterialManager 
          danhSachVatTu={danhSachVatTu}
          setDanhSachVatTu={setDanhSachVatTu}
          luuVatTuMoi={luuVatTuMoi}
          sapXepVatTu={sapXepVatTu}
          anVatTu={anVatTu}
          hienVatTu={hienVatTu}
          currentUser={currentUser}
          setToast={setToast}
          onClose={() => setIsManageMode(false)}
        />
      ) : (!currentMaterialType || activeTab === 'BaoCao') ? (
        <Dashboard 
          isFirebaseInitialized={isFirebaseInitialized} 
          setToast={setToast} 
          refreshTrigger={reportRefreshTrigger}
          onSelectOrderRecord={loadRecordData}
        />
      ) : (
      <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a] shadow-xl relative z-10 animate-fade-in">
        <header className="bg-[#1e293b] border-b border-[#334155] py-2 px-6 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="font-medium text-slate-300 flex items-center gap-2 text-sm bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700 custom-dashboard-indicator">
              <span className="opacity-50">Đang chọn:</span> 
              <span className="text-white font-bold tracking-wide uppercase text-sm border-l border-slate-700 pl-2 ml-1">
                 {danhSachVatTu.find(l => l.id === currentMaterialType)?.ten || 'TẤT CẢ VẬT TƯ'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button title="Thông báo" className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors relative">
               <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1e293b]"></span>
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
             </button>
             <button title="Hỗ trợ" className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
             </button>
             <div className="w-px h-6 bg-slate-700 mx-1"></div>
             <div className="flex items-center gap-3">
               <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 p-1 pr-3 rounded-full select-none">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-inner text-xs">
                     {currentUser?.username?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="hidden md:block leading-tight">
                     <div className="font-bold text-xs text-slate-200">@{currentUser?.username}</div>
                     <div className="text-[9px] uppercase tracking-wider font-extrabold text-blue-400 mt-0.5">
                       {currentUser?.role === 'admin' ? 'Quyền Admin' : currentUser?.role === 'editor' ? 'Biên tập' : 'Người xem'}
                     </div>
                  </div>
               </div>
               <button 
                 onClick={() => handleInterceptAction(handleLogout)}
                 title="Đăng xuất khỏi hệ thống" 
                 className="p-1.5 px-2.5 bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 rounded-lg lg:rounded-xl hover:border-rose-950/40 hover:bg-rose-950/20 transition-all text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95"
               >
                 <LogOut size={13} />
                 <span>Thoát</span>
               </button>
             </div>
          </div>
        </header>

        {/* Tầng 2: Page Header & Action Bar */}
        <div className="bg-[#1e293b] border-b border-[#334155] shadow-sm">
          <div className="w-full px-6 h-14 flex items-center justify-between">
            {/* Bên trái: Navigation Tabs (Underline tabs) */}
            <nav className="flex items-center h-full gap-6">
              <button 
                onClick={() => handleInterceptAction(() => switchTab('BM02'))}
                className={`h-full px-1 flex items-center text-sm font-semibold border-b-2 transition-all relative top-[1px] ${activeTab === 'BM02' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                1. ĐN CCVT (BM02)
              </button>
              <button 
                onClick={() => handleInterceptAction(() => switchTab('BBNT'))}
                className={`h-full px-1 flex items-center text-sm font-semibold border-b-2 transition-all relative top-[1px] ${activeTab === 'BBNT' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                2. BBNT (BM03.2)
              </button>
              <button 
                onClick={() => handleInterceptAction(() => switchTab('BM04'))}
                className={`h-full px-1 flex items-center text-sm font-semibold border-b-2 transition-all relative top-[1px] ${activeTab === 'BM04' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                3. BB GIAO NHẬN (BM04)
              </button>
              <button 
                onClick={() => handleInterceptAction(() => switchTab('BaoCao'))}
                className={`h-full px-1 flex items-center text-sm font-semibold border-b-2 transition-all relative top-[1px] ${activeTab === 'BaoCao' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                4. BÁO CÁO (BM02)
              </button>
            </nav>

            {/* Bên phải: Nhóm Nút Hành Động */}
            <div className="flex items-center gap-3">
              {canCreate(currentUser) && (
                <label className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg cursor-pointer hover:from-blue-500 hover:to-indigo-500 transition-all text-xs font-bold shadow-md shadow-blue-900/50 border border-blue-400/40 active:scale-95">
                  <Sparkles size={14} className="animate-pulse text-amber-300" />
                  <span>AI OCR (PDF/Word/Excel/Ảnh)</span>
                  <input type="file" className="hidden" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.jpg,.jpeg,.png,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleFileUpload} />
                </label>
              )}

              {canEdit(currentUser) && (
                <button 
                  onClick={saveToFirebase}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-blue-400 rounded-lg hover:bg-slate-700 hover:text-blue-300 transition-all text-xs font-bold border border-slate-700 hover:border-slate-600 disabled:opacity-50 active:scale-95"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {currentRecordId ? "Cập nhật" : "Lưu dữ liệu"}
                </button>
              )}

                  {/* Dropdown Xuất File */}
                  <div className="relative group">
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 hover:border-slate-500 hover:bg-slate-700 transition-all text-xs font-bold active:scale-95">
                      <Download size={14} />
                      Xuất File
                      <span className="text-[8px] opacity-50">▼</span>
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl shadow-black opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] overflow-hidden">
                      <button 
                        onClick={handleExport}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors border-b border-slate-700/50"
                      >
                        <FileText size={16} className="text-blue-400" />
                        Xuất Word (.docx)
                      </button>
                      <button 
                        onClick={handleExportAllDocx}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-amber-500 hover:bg-slate-700 transition-colors border-b border-slate-700/50 font-medium"
                      >
                        <Files size={16} className="text-amber-500" />
                        Tải tất cả biểu mẫu (.docx)
                      </button>
                      <button 
                        onClick={handleExcelExport}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors border-b border-slate-700/50"
                      >
                        <FileSpreadsheet size={16} className="text-green-500" />
                        Xuất Excel (.xlsx)
                      </button>
                      <button 
                        onClick={handlePdfExport}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors border-b border-slate-700/50"
                      >
                        <FileText size={16} className="text-red-500" />
                        Xuất PDF (.pdf)
                      </button>
                      <button 
                        onClick={handleImageExport}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                      >
                        <ImageIcon size={16} className="text-purple-400" />
                        Xuất Ảnh (.png)
                      </button>
                    </div>
                  </div>
                  
              
            </div>
          </div>
        </div>

      <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-900/80 custom-scrollbar">
        {isProcessing && (
          <div className="fixed inset-0 bg-white/60 backdrop-blur-md z-50 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="font-bold text-slate-800 animate-pulse tracking-wide uppercase">AI đang phân tích tài liệu...</p>
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto mb-6 flex items-center gap-3 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">
            <AlertCircle size={20} />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {activeTab === 'BM02' ? (
          <div className="mx-auto max-w-[800px] mb-4 space-y-4">
            {/* BANNER NHẬP MÃ PHIẾU */}
            <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600/20 text-indigo-400 p-2 rounded-lg border border-indigo-500/30">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="maPhieuInputBM02" className="text-xs font-black text-slate-200 uppercase tracking-wider">
                      MÃ PHIẾU <span className="text-rose-400">*</span>
                    </label>
                    {isDuplicateMaPhieu ? (
                      <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle size={10} /> Trùng mã
                      </span>
                    ) : isTemplateCodeOnly(bm02Data.maPhieu) && (bm02Data.maPhieu || "").trim() !== "" ? (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold flex items-center gap-1" title="Vui lòng nhập thêm số hiệu phiếu (ví dụ: XDIJC-QTMH-BM01-26070048 hoặc 26070048)">
                        <AlertCircle size={10} /> Cần thêm số hiệu
                      </span>
                    ) : (bm02Data.maPhieu || "").trim() !== "" ? (
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 size={10} /> Mã hợp lệ
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle size={10} /> Bắt buộc nhập
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">Mã định danh Snapshot BM02/BM03.2 (không hiển thị trên file in/xuất)</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-sm min-w-[240px]">
                <input
                  id="maPhieuInputBM02"
                  type="text"
                  placeholder="VD: XDIJC-QTMH-BM01-26090074"
                  value={bm02Data.maPhieu || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBm02Data(prev => ({ ...prev, maPhieu: val, maPhieuNguon: val }));
                    setBbntData(prev => ({ ...prev, maPhieu: val }));
                    setBm04Data(prev => ({ ...prev, maPhieu: val }));
                  }}
                  onBlur={(e) => {
                    const formatted = formatStandardMaPhieu(e.target.value);
                    if (formatted && formatted !== e.target.value) {
                      setBm02Data(prev => ({ ...prev, maPhieu: formatted, maPhieuNguon: formatted }));
                      setBbntData(prev => ({ ...prev, maPhieu: formatted }));
                      setBm04Data(prev => ({ ...prev, maPhieu: formatted }));
                    }
                  }}
                  className={`w-full px-3.5 py-2 bg-slate-900 border rounded-lg text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                    isDuplicateMaPhieu 
                      ? "border-rose-500 focus:ring-rose-500/50" 
                      : isTemplateCodeOnly(bm02Data.maPhieu) && (bm02Data.maPhieu || "").trim() !== ""
                        ? "border-amber-500/70 focus:ring-amber-500/50"
                        : (bm02Data.maPhieu || "").trim() !== "" 
                          ? "border-emerald-500/70 focus:ring-emerald-500/50" 
                          : "border-slate-600 focus:ring-indigo-500"
                  }`}
                />
              </div>
            </div>

            <div id="document-bm02" className="bg-white shadow-2xl rounded-sm border border-slate-300 mx-auto max-w-[800px] document-font p-12 md:p-16 space-y-4 min-h-[1100px] text-black relative">

            {/* Source and Synced Badge Component */}
            <div className="absolute top-4 right-4 print:hidden flex items-center gap-2 z-10 select-none">
              {bm02Data.sourceType === 'BM06' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 rounded-full text-xs font-bold shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  📋 From BM06 Form
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors border border-sky-200 rounded-full text-xs font-bold shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                  </span>
                  📄 From PDF Extract
                </span>
              )}
              
              {currentRecordId && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all duration-500 ${
                  bm02Synced 
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100" 
                    : "bg-indigo-50/50 text-indigo-600 border-indigo-200/60"
                }`}>
                  <svg className={`w-3.5 h-3.5 ${bm02Synced ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                  </svg>
                  {bm02Synced ? "Synced!" : "Live Synced"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-[1.2fr_3fr_1fr] border border-black mb-2">
              <div className="border-r border-black p-4 flex items-center justify-center relative group">
                {logoUrl ? (
                  <div className="relative">
                    <img src={logoUrl} alt="Logo" className="max-h-16 object-contain" />
                    <button 
                      onClick={removeLogo}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                      title="Xóa Logo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="bti-logo-container">
                    <div className="bti-box"><span className="bti-letter">B</span></div>
                    <div className="bti-box"><span className="bti-letter">T</span></div>
                    <div className="bti-box"><span className="bti-letter">I</span></div>
                  </div>
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-[10px] font-bold uppercase">
                  <Upload size={14} className="mr-1" /> Chọn Logo
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              </div>
              <div className="border-r border-black p-4 flex flex-col items-center justify-center text-center">
                <div className="font-bold text-xl mb-1 uppercase">Tờ trình</div>
                <textarea 
                  className="w-full text-center font-normal text-red-600 bg-transparent border-none focus:ring-0 p-0 text-[13pt] resize-none"
                  value={bm02Data.title || ''}
                  rows={3}
                  readOnly
                />
              </div>
              <div className="p-2 flex items-center justify-center font-bold text-xs uppercase">QTMH-BM02</div>
            </div>

            <div className="text-right italic text-red-600 flex justify-end gap-1 items-center mb-2">
                <input className="bg-transparent border-none text-right focus:ring-0 p-0 italic w-44" value={(bm02Data.location && !bm02Data.location.toLowerCase().includes('thuộc') && !bm02Data.location.toLowerCase().includes('lô') && !bm02Data.location.toLowerCase().includes('khu')) ? bm02Data.location : 'Tp. Hồ Chí Minh'} onChange={(e) => setBm02Data({...bm02Data, location: e.target.value})} />,
                <input className="bg-transparent border-none text-left focus:ring-0 p-0 italic w-80" value={chuanHoaNgay(bm02Data.date) || ''} onChange={(e) => {
                  const newDate = e.target.value;
                  setBm02Data({...bm02Data, date: newDate});
                  const bbntDate = addOneDayToString(newDate);
                  setBbntData(prev => ({
                    ...prev,
                    date: bbntDate,
                    startDate: bbntDate,
                    endDate: bbntDate
                  }));
                  setBm04Data(prev => ({
                    ...prev,
                    date: bbntDate,
                    startDate: bbntDate,
                    endDate: bbntDate
                  }));
                }} />
            </div>

            <div className="space-y-1">
              <div className="flex gap-4">
                <span className="font-bold min-w-[80px]">Kính gửi:</span>
                <div className="flex-1 space-y-0.5 font-bold">
                  {(bm02Data.recipients || []).map((r, i) => <div key={i} className="flex gap-2"><span>-</span><input className="bg-transparent border-none focus:ring-0 p-0 w-full" value={r || ''} onChange={(e) => {
                      const newRec = [...(bm02Data.recipients || [])];
                      newRec[i] = e.target.value;
                      setBm02Data({...bm02Data, recipients: newRec});
                  }} /></div>)}
                </div>
              </div>
              <div className="space-y-0.5">
                {(bm02Data.grounds || []).map((g, i) => <div key={i} className="flex gap-2"><span>-</span><textarea className="bg-transparent border-none focus:ring-0 p-0 w-full resize-none h-auto min-h-[1.3em]" value={g || ''} rows={Math.ceil((g || '').length/80)} onChange={(e) => {
                    const newGr = [...(bm02Data.grounds || [])];
                    newGr[i] = e.target.value;
                    setBm02Data({...bm02Data, grounds: newGr});
                }} /></div>)}
              </div>
            </div>

            <div className="mt-1 flex">
              <textarea 
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = `${Math.max(24, el.scrollHeight)}px`;
                  }
                }}
                className="bg-transparent border-b border-dashed border-slate-300 hover:border-slate-400 focus:border-red-600 focus:ring-0 p-0 w-full resize-none min-h-[1.5em] text-justify print:border-none"
                value={bm02Data.requestContent || ''}
                rows={Math.max(2, Math.ceil((bm02Data.requestContent || '').length / 90))}
                placeholder="Nhập nội dung đề nghị..."
                onChange={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.max(24, e.target.scrollHeight)}px`;
                  setBm02Data({...bm02Data, requestContent: e.target.value});
                }}
              />
            </div>

            <div className="mt-4 space-y-2">
              <h3 className="font-bold border-b-2 border-black inline-block uppercase underline whitespace-nowrap">1/ Mục đích sử dụng:</h3>
              <div className="flex gap-2 items-start pl-2">
                <span className="font-bold text-slate-800 min-w-[100px]">- Nội dung:</span>
                <textarea 
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${Math.max(20, el.scrollHeight)}px`;
                    }
                  }}
                  className="bg-transparent border-b border-dashed border-slate-300 hover:border-slate-400 focus:border-red-600 focus:ring-0 p-0 w-full resize-none min-h-[1.3em] text-red-600 font-medium"
                  value={bm02Data.mucDichSuDungNoiDung || ''}
                  rows={Math.max(1, (bm02Data.mucDichSuDungNoiDung || '').split('\n').length)}
                  placeholder="[Thay đổi theo nội dung file đính kèm]"
                  onChange={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.max(20, e.target.scrollHeight)}px`;
                    const val = e.target.value;
                    setBm02Data({ ...bm02Data, mucDichSuDungNoiDung: val });
                    setBbntData(prev => ({ ...prev, category: val }));
                  }}
                />
              </div>
              <div className="flex gap-2 items-start pl-2">
                <span className="font-bold text-slate-800 min-w-[100px]">- Địa điểm:</span>
                <textarea 
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${Math.max(20, el.scrollHeight)}px`;
                    }
                  }}
                  className="bg-transparent border-b border-dashed border-slate-300 hover:border-slate-400 focus:border-red-600 focus:ring-0 p-0 w-full resize-none min-h-[1.3em] text-red-600 font-medium"
                  value={bm02Data.mucDichSuDungDiaDiem || bm02Data.location || ''}
                  rows={Math.max(1, ((bm02Data.mucDichSuDungDiaDiem || bm02Data.location) || '').split('\n').length)}
                  placeholder="[Thay đổi theo nội dung file đính kèm]"
                  onChange={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.max(20, e.target.scrollHeight)}px`;
                    const val = e.target.value;
                    setBm02Data({ ...bm02Data, mucDichSuDungDiaDiem: val, location: val });
                    setBbntData(prev => ({ ...prev, address: val, locationDetail: val }));
                  }}
                />
              </div>
            </div>

            <div className="space-y-2 mt-6">
              <div className="flex flex-wrap justify-between items-center gap-4">
                <h3 className="font-bold border-b-2 border-black inline-block uppercase underline whitespace-nowrap">2/ Mua vật tư, thiết bị, dịch vụ:</h3>
                
                <div className="flex-1 flex flex-wrap items-center justify-end gap-3">
                  {/* Unit Price Mode Controls */}
                  <div className="flex items-center gap-3 bg-slate-100 p-2 px-3 rounded-lg border border-slate-200 shadow-sm text-xs print:hidden">
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                      <label className="flex items-center gap-1 cursor-pointer font-bold hover:text-blue-700 transition-colors select-none">
                        <input 
                          type="radio"
                          name="unitPriceType"
                          checked={bm02Data.isPostTax === false}
                          onChange={() => handleTogglePostTax(false)}
                          className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                        <span>Đơn giá trước thuế</span>
                      </label>

                      <label className="flex items-center gap-1 cursor-pointer font-bold hover:text-blue-700 transition-colors select-none">
                        <input 
                          type="radio"
                          name="unitPriceType"
                          checked={bm02Data.isPostTax !== false}
                          onChange={() => handleTogglePostTax(true)}
                          className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                        <span>Đơn giá sau thuế</span>
                      </label>
                    </div>
                  </div>


                  
                  {bm02Data.sourceType !== 'BM06' && (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const hasDiffOrNew = (bm02Data.items || []).some(it => {
                          const p = Number(it.unitPrice) || 0;
                          if (!it.name || !it.name.trim() || p <= 0) return false;
                          const masterP = getMasterPriceForName(it.name);
                          return masterP !== p;
                        });
                        if (hasDiffOrNew) {
                          return (
                            <button
                              type="button"
                              onClick={async () => {
                                const activeLoai = currentMaterialType || (window as any)._loaiVatTuHienTai || 'BeTong';
                                const validItems = (bm02Data.items || []).filter(it => it.name && it.name.trim() && Number(it.unitPrice) > 0);
                                let updatedCount = 0;
                                for (const it of validItems) {
                                  const res = await MaterialService.addOrUpdateMaterialInCatalog(activeLoai, {
                                    id: it.matchedCatalogId,
                                    name: it.name,
                                    unit: it.unit || 'm3',
                                    unitPrice: Number(it.unitPrice),
                                    specification: it.note || ''
                                  });
                                  if (res.success) updatedCount++;
                                }
                                await loadMaterialPrices(activeLoai);
                                setToast({
                                  type: 'success',
                                  message: `Đã lưu thành công ${updatedCount} vật tư và đơn giá vào Danh mục (${activeLoai})!`
                                });
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer animate-pulse"
                              title="Cập nhật toàn bộ đơn giá và tên vật tư trên BM02 trực tiếp ngược lại vào Danh mục quản lý vật tư"
                            >
                              <Save size={13} />
                              <span>Lưu tất cả vào Danh mục</span>
                            </button>
                          );
                        }
                        return null;
                      })()}

                      <button 
                        type="button"
                        onClick={async () => {
                          const activeLoai = currentMaterialType || (window as any)._loaiVatTuHienTai || 'BeTong';
                          await loadMaterialPrices();
                          setToast({ type: 'success', message: `Đã làm mới dữ liệu từ Danh mục vật tư (${activeLoai})!` });
                        }}
                        className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-blue-600 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Tải lại giá mới nhất từ Danh mục quản lý vật tư"
                      >
                        <RefreshCw size={13} className="text-slate-500" />
                        <span>Đồng bộ từ Danh mục</span>
                      </button>

                      <button onClick={addBM02Item} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-full border border-blue-200 shadow-sm flex-shrink-0" title="Thêm dòng vật tư mới">
                        <Plus size={20} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {(() => {
                const missingPriceItems = (bm02Data.items || []).filter(it => 
                  !it.unitPrice || Number(it.unitPrice) <= 0 || !it.name?.trim() || !it.unit?.trim() || !it.isMatchedWithCatalog
                );
                if (missingPriceItems.length === 0) return null;
                return (
                  <div className="mb-6 p-5 bg-red-50 border border-red-200 rounded-2xl text-xs space-y-3 print:hidden shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-red-700 font-extrabold uppercase tracking-wider text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="p-1 bg-red-100 rounded-lg text-red-650">⚠️</span>
                        <span>Cảnh báo: {missingPriceItems.length} vật tư chưa có trong Danh mục / chưa đủ thông tin!</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const validItems = missingPriceItems.filter(it => it.name?.trim() && it.unit?.trim() && Number(it.unitPrice) > 0);
                          if (validItems.length === 0) {
                            setToast({ type: 'error', message: 'Vui lòng điền đủ Tên, ĐVT và Đơn giá trước khi lưu vào Danh mục!' });
                            return;
                          }
                          const activeLoai = currentMaterialType || (window as any)._loaiVatTuHienTai || 'BeTong';
                          for (const it of validItems) {
                            await MaterialService.addOrUpdateMaterialInCatalog(activeLoai, {
                              id: it.matchedCatalogId || it.id,
                              name: it.name,
                              unit: it.unit || 'm3',
                              unitPrice: Number(it.unitPrice) || 0,
                              specification: it.note || ''
                            });
                          }
                          await loadMaterialPrices();
                          setToast({ type: 'success', message: `Đã cập nhật ${validItems.length} vật tư vào Danh mục Quản lý vật tư (${activeLoai})!` });
                        }}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all cursor-pointer whitespace-nowrap"
                        title="Lưu tất cả các vật tư đã điền đủ thông tin vào Danh mục Quản lý vật tư"
                      >
                        <CheckCircle2 size={13} />
                        <span>Lưu tất cả vào Danh mục</span>
                      </button>
                    </div>
                    <p className="text-slate-600 font-semibold leading-relaxed">
                      Các vật tư dưới đây chưa được đối chiếu hoặc thiếu Tên, ĐVT, Đơn giá.
                      Bạn có thể kiểm tra, chỉnh sửa trực tiếp nội dung bên dưới và bấm nút <strong>"Xác nhận & Cập nhật Danh mục"</strong> để đồng bộ trực tiếp vào Danh mục quản lý vật tư:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white/80 p-3 rounded-xl border border-red-100/80 max-h-96 overflow-y-auto">
                      {missingPriceItems.map((it, idx) => {
                        const nameTrim = (it.name || '').trim();
                        const unitTrim = (it.unit || '').trim();
                        const priceNum = Number(it.unitPrice) || 0;
                        const isValid = nameTrim.length > 0 && unitTrim.length > 0 && priceNum > 0;

                        return (
                          <div key={it.id ? `missing-price-${it.id}-${idx}` : `missing-price-${idx}`} className="flex flex-col gap-2.5 p-3 bg-white rounded-xl border border-red-200 shadow-sm transition-all hover:border-red-300">
                            {/* Original OCR Name Badge if available and different */}
                            {(it as any).originalOcrName && (it as any).originalOcrName !== it.name && (
                              <div className="text-[10px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 font-medium break-words leading-tight">
                                <strong>Tên OCR gốc:</strong> {(it as any).originalOcrName}
                              </div>
                            )}

                            {/* Tên vật tư input field - full width, NO TRUNCATION */}
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tên vật tư (bắt buộc):</label>
                                {it.unitId && (
                                  <span className="text-[10px] text-slate-400 font-medium">({formatUnitNameForTable(it.unitId) || "Căn"})</span>
                                )}
                              </div>
                              <input
                                type="text"
                                value={it.name || ''}
                                onChange={(e) => updateBM02Item(it.id, 'name', e.target.value)}
                                placeholder="Nhập đầy đủ tên vật tư..."
                                className={`w-full px-2.5 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border ${!nameTrim ? 'border-red-300 bg-red-50/30' : 'border-slate-200 focus:border-blue-500'} rounded-lg font-bold text-slate-900 focus:outline-none transition-all text-xs`}
                              />
                            </div>

                            {/* ĐVT + Đơn giá inputs */}
                            <div className="grid grid-cols-2 gap-2 items-end">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">ĐVT (bắt buộc):</label>
                                <input
                                  type="text"
                                  value={it.unit || ''}
                                  onChange={(e) => updateBM02Item(it.id, 'unit', e.target.value)}
                                  placeholder="m3, kg, ca..."
                                  className={`w-full px-2.5 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border ${!unitTrim ? 'border-red-300 bg-red-50/30' : 'border-slate-200 focus:border-blue-500'} rounded-lg font-bold text-slate-900 focus:outline-none transition-all text-xs`}
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Đơn giá (đồng):</label>
                                <div className="flex items-center gap-1">
                                  <VNFormattedInput
                                    align="right"
                                    className={`w-full px-2.5 py-1.5 bg-red-50/50 hover:bg-red-50 focus:bg-white border ${priceNum <= 0 ? 'border-red-300' : 'border-red-200 focus:border-red-400'} rounded-lg font-black text-right text-slate-900 focus:outline-none transition-all text-xs`}
                                    value={it.unitPrice || 0}
                                    onChange={(val) => updateBM02Item(it.id, 'unitPrice', val)}
                                  />
                                  <span className="text-[10px] text-slate-400 font-mono shrink-0">đ</span>
                                </div>
                              </div>
                            </div>

                            {/* Status / Confirm Button */}
                            <div className="pt-2 flex items-center justify-between border-t border-slate-100 gap-2">
                              {!isValid ? (
                                <span className="text-[10px] font-bold text-red-600 bg-red-100/60 px-2 py-0.5 rounded">
                                  ⚠️ Yêu cầu Tên + ĐVT + Đơn giá
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  ✓ Đã đủ thông tin
                                </span>
                              )}

                              <button
                                type="button"
                                disabled={!isValid}
                                onClick={() => confirmAndRegisterMaterialToCatalog(it)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-extrabold text-[11px] shadow-sm flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                              >
                                <CheckCircle2 size={13} />
                                <span>Xác nhận & Cập nhật Danh mục</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <table className="w-full border-collapse border border-black text-sm text-black">
                <thead>
                  <tr className="font-bold text-center bg-slate-50 text-[10px]">
                    <td className="border border-black p-1 w-10">STT</td>
                    <td className="border border-black p-1">Tên vật tư/thiết bị/dịch vụ</td>
                    <td className="border border-black p-1 w-12">Đvt</td>
                    <td className="border border-black p-1 w-20">Tổng khối lượng/ số lượng... theo dự toán/kế hoạch</td>
                    <td className="border border-black p-1 w-20">Lũy kế các kỳ trước</td>
                    <td className="border border-black p-1 w-24">Khối lượng/số lượng cần cung cấp kỳ này</td>
                    <td className="border border-black p-1 w-20">Đơn giá kỳ này (đồng)</td>
                    <td className="border border-black p-1 w-24">Thành tiền kỳ này</td>
                    <td className="border border-black p-1 w-20">Ghi chú</td>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const items = bm02Data.items || [];
                    const h = getHierarchy(bm02Data.selectedUnits, items);
                    const isGrouped = bm02Data.isGroupedDisplay || bm02Data.displayMode === "GROUPED_EQUAL";

                    if (isGrouped) {
                      const renderedRows: React.ReactNode[] = [];
                      const totalSelectedUnits = bm02Data.selectedUnits?.length || 0;
                      
                      renderedRows.push(
                        <tr key="grouped-bm02-hd" className="bg-slate-50 border-y border-black font-black text-[10pt] leading-normal h-10 select-none">
                          <td className="p-1 border border-black font-black text-slate-950 text-center text-[10.5pt]">
                            ★
                          </td>
                          <td className="p-2 border border-black text-left font-black text-slate-900 text-[9.5pt] tracking-tight pl-3" colSpan={8}>
                            DANH SÁCH VẬT TƯ GỘP ({totalSelectedUnits} căn): {(bm02Data.selectedUnits || []).map(u => u.unitId).join(", ")}
                          </td>
                        </tr>
                      );

                      items.forEach((it, idx) => {
                        renderedRows.push(renderBM02Row(it, idx, idx + 1));
                      });

                      return renderedRows;
                    }

                    if (h.list.length === 0 || bm02Data.sourceType === 'PDF' || items.every(it => !it.unitId && !it.projectId)) {
                      return items.map((it, idx) => renderBM02Row(it, idx, idx + 1));
                    }

                    const renderedRows: React.ReactNode[] = [];

                    h.list.forEach((u, groupIdx) => {
                      const projId = u.projectId;
                      const unitId = u.unitId;
                      const groupItems = items.filter(
                        it => !it.isSharedCost && (it.projectId || '').toLowerCase() === projId.toLowerCase() && 
                              (it.unitId || '').toLowerCase() === unitId.toLowerCase()
                      );

                      // Add 1 header row: DỰ ÁN: [Tên dự án] - CĂN: [Tên căn]
                      // No cell merging (colSpan ignored) - separate cells clearly, just like BM06
                      renderedRows.push(
                        <tr key={`group-hd-${projId}-${unitId}`} className="bg-slate-50 border-y border-black font-black text-[10pt] leading-normal h-10 select-none">
                          <td className="p-1 border border-black font-black text-slate-950 text-center text-[10.5pt]">
                            {toRoman(groupIdx)}
                          </td>
                          <td className="p-2 border border-black text-left font-black text-slate-900 text-[9.5pt] tracking-tight pl-3">
                            {formatUnitNameForTable(unitId)}
                          </td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black font-bold"></td>
                          <td className="p-1 border border-black"></td>
                        </tr>
                      );

                      let groupStt = 0;
                      groupItems.forEach((it) => {
                        groupStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBM02Row(it, originalIdx, groupStt));
                      });
                    });

                    const sharedItems = items.filter(it => it.isSharedCost);
                    if (sharedItems.length > 0) {
                      renderedRows.push(
                        <tr key="shared-hd" className="bg-slate-50 border-y border-black font-black text-[10pt] leading-normal h-10 select-none">
                          <td className="border border-black p-1 text-center font-bold text-slate-950 text-[10.5pt]">★</td>
                          <td className="p-2 border border-black text-left font-black text-slate-900 text-[9.5pt] tracking-tight pl-3 uppercase">
                            CHI PHÍ CHIA ĐỀU CÁC CĂN ({(bm02Data.selectedUnits || []).length} căn): {(bm02Data.selectedUnits || []).map((u:any) => u.unitId).join(", ")}
                          </td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black font-bold"></td>
                          <td className="p-1 border border-black"></td>
                        </tr>
                      );
                      let sharedStt = 0;
                      sharedItems.forEach((it) => {
                        sharedStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBM02Row(it, originalIdx, sharedStt));
                      });
                    }

                    const orphanItems = items.filter(it => {
                      if (it.isSharedCost) return false;
                      const proj = it.projectId || '';
                      const unit = it.unitId || '';
                      return !h.list.some(u => 
                        u.projectId.toLowerCase() === proj.toLowerCase() && 
                        u.unitId.toLowerCase() === unit.toLowerCase()
                      );
                    });

                    if (orphanItems.length > 0) {
                      renderedRows.push(
                        <tr key="orphan-hd" className="bg-slate-100 border-y border-black font-bold text-xs select-none">
                          <td className="border border-black p-1 text-center font-bold">X</td>
                          <td className="p-2 border border-black text-left uppercase text-slate-700 tracking-wider font-extrabold pl-4">
                            VẬT TƯ KHÁC / CHƯA PHÂN LOẠI
                          </td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black font-bold"></td>
                          <td className="p-1 border border-black"></td>
                        </tr>
                      );
                      let orphanStt = 0;
                      orphanItems.forEach((it) => {
                        orphanStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBM02Row(it, originalIdx, orphanStt));
                      });
                    }

                    return renderedRows;
                  })()}
                  {(() => {
                    const taxRateVal = bm02Data.taxRate !== undefined ? Number(bm02Data.taxRate) : (bm02Data.vatSnapshot?.vatPercent ?? 10);
                    const showVatVal = bm02Data.showVat ?? bm02Data.showVAT ?? bm02Data.vatSnapshot?.showVAT ?? bm02Data.vatSnapshot?.showVat ?? false;

                    const rawLineSum = (bm02Data.items || []).reduce((acc, it) => {
                      const q = Number(it.quantity) || 0;
                      const p = Number(it.unitPrice) || 0;
                      const lTot = it.total !== undefined && it.total !== null && !isNaN(Number(it.total))
                        ? Number(it.total)
                        : Math.round(q * p * 100) / 100;
                      return acc + lTot;
                    }, 0);
                    const lineSum = Math.round(rawLineSum);

                    let totalPreTax = lineSum;
                    let vatAmount = showVatVal ? Math.round((lineSum * taxRateVal) / 100) : 0;
                    let totalWithVat = showVatVal ? (totalPreTax + vatAmount) : lineSum;

                    if (!showVatVal) {
                      return (
                        <tr className="font-bold bg-slate-50 text-xs">
                          <td colSpan={7} className="border border-black p-1 text-center uppercase font-bold">
                            <div className="flex items-center justify-between px-2">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800 hover:text-blue-700 transition-colors select-none print:hidden">
                                <input 
                                  type="checkbox"
                                  checked={false}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setBm02Data(prev => {
                                      const newRate = prev.taxRate !== undefined ? Number(prev.taxRate) : 10;
                                      const rSum = (prev.items || []).reduce((acc, it) => {
                                        const q = Number(it.quantity) || 0;
                                        const p = Number(it.unitPrice) || 0;
                                        const lTot = it.total !== undefined && it.total !== null && !isNaN(Number(it.total))
                                          ? Number(it.total)
                                          : Math.round(q * p * 100) / 100;
                                        return acc + lTot;
                                      }, 0);
                                      const lSum = Math.round(rSum);

                                      let sub = lSum;
                                      let vAmt = checked ? Math.round((sub * newRate) / 100) : 0;
                                      let gTot = sub + vAmt;

                                      const snap = {
                                        showVAT: checked,
                                        showVat: checked,
                                        vatPercent: newRate,
                                        subTotal: sub,
                                        vatAmount: vAmt,
                                        grandTotal: gTot
                                      };

                                      return {
                                        ...prev,
                                        showVat: checked,
                                        showVAT: checked,
                                        taxRate: newRate,
                                        taxAmount: vAmt,
                                        totalAmount: sub,
                                        totalWithTax: gTot,
                                        totalAmountWithVat: gTot,
                                        soTienBangChu: prev.isCustomSoTienBangChu ? prev.soTienBangChu : numberToVietnameseWords(gTot),
                                        vatSnapshot: snap
                                      };
                                    });
                                  }}
                                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-400 cursor-pointer"
                                />
                                <span className="text-[11px] font-bold text-slate-700">HIỂN THỊ VAT</span>
                              </label>
                              <span className="print:inline flex-1 text-center font-bold">TỔNG CỘNG (ĐÃ BAO GỒM THUẾ VAT)</span>
                            </div>
                          </td>
                          <td className="border border-black p-1 text-right font-bold">
                            {totalWithVat.toLocaleString('vi-VN')}
                          </td>
                          <td className="border border-black p-1"></td>
                        </tr>
                      );
                    }

                    return (
                      <>
                        <tr className="font-bold bg-slate-50 text-xs">
                          <td colSpan={7} className="border border-black p-1 text-center uppercase font-bold">
                            <div className="flex items-center justify-between px-2">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800 hover:text-blue-700 transition-colors select-none print:hidden">
                                <input 
                                  type="checkbox"
                                  checked={true}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setBm02Data(prev => {
                                      const newRate = prev.taxRate !== undefined ? Number(prev.taxRate) : 10;
                                      const rSum = (prev.items || []).reduce((acc, it) => {
                                        const q = Number(it.quantity) || 0;
                                        const p = Number(it.unitPrice) || 0;
                                        const lTot = it.total !== undefined && it.total !== null && !isNaN(Number(it.total))
                                          ? Number(it.total)
                                          : Math.round(q * p * 100) / 100;
                                        return acc + lTot;
                                      }, 0);
                                      const lSum = Math.round(rSum);

                                      let sub = lSum;
                                      let vAmt = checked ? Math.round((sub * newRate) / 100) : 0;
                                      let gTot = sub + vAmt;

                                      const snap = {
                                        showVAT: checked,
                                        showVat: checked,
                                        vatPercent: newRate,
                                        subTotal: sub,
                                        vatAmount: vAmt,
                                        grandTotal: gTot
                                      };

                                      return {
                                        ...prev,
                                        showVat: checked,
                                        showVAT: checked,
                                        taxRate: newRate,
                                        taxAmount: vAmt,
                                        totalAmount: sub,
                                        totalWithTax: gTot,
                                        totalAmountWithVat: gTot,
                                        soTienBangChu: prev.isCustomSoTienBangChu ? prev.soTienBangChu : numberToVietnameseWords(gTot),
                                        vatSnapshot: snap
                                      };
                                    });
                                  }}
                                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-400 cursor-pointer"
                                />
                                <span className="text-[11px] font-bold text-blue-700">HIỂN THỊ VAT</span>
                              </label>
                              <span className="print:inline flex-1 text-center font-bold">Thành tiền kỳ này (chưa bao gồm thuế)</span>
                            </div>
                          </td>
                          <td className="border border-black p-1 text-right font-bold">
                            {totalPreTax.toLocaleString('vi-VN')}
                          </td>
                          <td className="border border-black p-1"></td>
                        </tr>
                        <tr className="font-bold bg-slate-50 text-xs">
                          <td colSpan={7} className="border border-black p-1 text-center uppercase font-bold">
                            Thuế GTGT: [
                            <input 
                              type="number" 
                              min="0"
                              max="100"
                              className="w-10 mx-1 p-0 text-center border-b border-black focus:ring-0 bg-transparent font-bold outline-none text-xs text-red-600" 
                              value={taxRateVal} 
                              onChange={(e) => {
                                const newRate = parseFloat(e.target.value) || 0;
                                setBm02Data(prev => {
                                  const showV = prev.showVat ?? prev.showVAT ?? true;
                                  const rSum = (prev.items || []).reduce((acc, it) => {
                                    const q = Number(it.quantity) || 0;
                                    const p = Number(it.unitPrice) || 0;
                                    const lTot = it.total !== undefined && it.total !== null && !isNaN(Number(it.total))
                                      ? Number(it.total)
                                      : Math.round(q * p * 100) / 100;
                                    return acc + lTot;
                                  }, 0);
                                  const lSum = Math.round(rSum);

                                  let sub = lSum;
                                  let vAmt = showV ? Math.round((sub * newRate) / 100) : 0;
                                  let gTot = sub + vAmt;

                                  const snap = {
                                    showVAT: showV,
                                    showVat: showV,
                                    vatPercent: newRate,
                                    subTotal: sub,
                                    vatAmount: vAmt,
                                    grandTotal: gTot
                                  };

                                  return {
                                    ...prev,
                                    taxRate: newRate,
                                    taxAmount: vAmt,
                                    totalWithTax: gTot,
                                    totalAmountWithVat: gTot,
                                    soTienBangChu: prev.isCustomSoTienBangChu ? prev.soTienBangChu : numberToVietnameseWords(gTot),
                                    vatSnapshot: snap
                                  };
                                });
                              }}
                            />
                            ] %
                          </td>
                          <td className="border border-black p-1 text-right font-bold">
                            {vatAmount.toLocaleString('vi-VN')}
                          </td>
                          <td className="border border-black p-1"></td>
                        </tr>
                        <tr className="font-bold bg-slate-50 text-xs">
                          <td colSpan={7} className="border border-black p-1 text-center uppercase font-bold">
                            Tổng cộng (đã bao gồm thuế GTGT)
                          </td>
                          <td className="border border-black p-1 text-right font-bold">
                            {totalWithVat.toLocaleString('vi-VN')}
                          </td>
                          <td className="border border-black p-1"></td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 mt-4 text-[11pt]">
              {(() => {
                const taxRateVal = bm02Data.taxRate !== undefined ? Number(bm02Data.taxRate) : (bm02Data.vatSnapshot?.vatPercent ?? 10);
                const showVatVal = bm02Data.showVat ?? bm02Data.showVAT ?? bm02Data.vatSnapshot?.showVAT ?? bm02Data.vatSnapshot?.showVat ?? false;
                const rawLineSum = (bm02Data.items || []).reduce((acc, it) => {
                  const q = Number(it.quantity) || 0;
                  const p = Number(it.unitPrice) || 0;
                  const lTot = it.total !== undefined && it.total !== null && !isNaN(Number(it.total))
                    ? Number(it.total)
                    : Math.round(q * p * 100) / 100;
                  return acc + lTot;
                }, 0);
                const lineSum = Math.round(rawLineSum);

                const totalWithVat = showVatVal ? (lineSum + Math.round((lineSum * taxRateVal) / 100)) : lineSum;

                return (
                  <>
                    <div className="flex gap-2 items-start pl-1">
                      <span className="font-bold text-slate-800 min-w-[150px]">Số tiền bằng chữ:</span>
                      <textarea 
                        className="bg-transparent border-b border-dashed border-slate-300 hover:border-slate-400 focus:border-red-600 focus:ring-0 p-0 w-full resize-none h-auto min-h-[1.3em] font-medium"
                        value={bm02Data.isCustomSoTienBangChu ? (bm02Data.soTienBangChu || '') : numberToVietnameseWords(totalWithVat)}
                        rows={2}
                        placeholder="[Tự động tính bằng chữ theo số tiền phía trên]"
                        onChange={(e) => setBm02Data({ ...bm02Data, soTienBangChu: e.target.value, isCustomSoTienBangChu: true })}
                      />
                    </div>
                    
                    <div className="flex gap-2 items-start pl-1">
                      <span className="font-bold text-slate-800 min-w-[150px]">Thời hạn thanh toán:</span>
                      <textarea 
                        className="bg-transparent border-b border-dashed border-slate-300 hover:border-slate-400 focus:border-red-600 focus:ring-0 p-0 w-full resize-none h-auto min-h-[1.3em]"
                        value={bm02Data.thoiHanThanhToan || ''}
                        rows={2}
                        placeholder="Ví dụ: Thanh toán trực tiếp kỳ này..."
                        onChange={(e) => setBm02Data({ ...bm02Data, thoiHanThanhToan: e.target.value })}
                      />
                    </div>

                    <div className="pt-2 font-bold text-slate-900 border-t border-slate-100">
                      3/ Tổng số tiền dự trù kinh phí mua vật tư, thiết bị, dịch vụ kỳ này: <span className="underline">{ totalWithVat.toLocaleString('vi-VN') }</span> đồng.
                    </div>
                  </>
                );
              })()}

              <p className="font-bold italic mt-2 text-slate-800">Kính trình./.</p>
            </div>

            <BM02SignatureSection 
              kyTenList={kyTenBM02} 
              onChange={(updatedList) => {
                setKyTenBM02(updatedList);
                setBm02Synced(false);

                // Auto-sync if P.BAN ĐỀ NGHỊ was changed to BM03.2 and BM04
                const pBanItem = updatedList.find(it => isPBanDeNghiTitle(it.chucDanh) || it.id === 'kt_4');
                if (pBanItem && pBanItem.hoTen && pBanItem.hoTen.trim()) {
                  const cleanName = cleanProposerName(pBanItem.hoTen);
                  (window as any)._currentProposerName = cleanName;
                  setBm02Data(prev => ({ ...prev, nguoiDeNghi: cleanName, pBanDeNghi: cleanName, chiHuyTruong: cleanName }));
                  setBbntData(prev => ({
                    ...prev,
                    receiverList: updateReceiverListWithChiHuyTruong(prev.receiverList, cleanName)
                  }));
                  setBm04Data(prev => ({
                    ...prev,
                    receiverList: updateReceiverListWithChiHuyTruong(prev.receiverList, cleanName)
                  }));
                }
              }} 
            />
          </div>
        </div>
        ) : activeTab === 'BBNT' ? (
          <div className="mx-auto max-w-[850px] mb-4 space-y-4">
            {/* BANNER NHẬP MÃ PHIẾU */}
            <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600/20 text-indigo-400 p-2 rounded-lg border border-indigo-500/30">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="maPhieuInputBBNT" className="text-xs font-black text-slate-200 uppercase tracking-wider">
                      MÃ PHIẾU <span className="text-rose-400">*</span>
                    </label>
                    {isDuplicateMaPhieu ? (
                      <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle size={10} /> Trùng mã
                      </span>
                    ) : isTemplateCodeOnly(bm02Data.maPhieu) && (bm02Data.maPhieu || "").trim() !== "" ? (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold flex items-center gap-1" title="Vui lòng nhập thêm số hiệu phiếu (ví dụ: XDIJC-QTMH-BM01-26070048 hoặc 26070048)">
                        <AlertCircle size={10} /> Cần thêm số hiệu
                      </span>
                    ) : (bm02Data.maPhieu || "").trim() !== "" ? (
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 size={10} /> Mã hợp lệ
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle size={10} /> Bắt buộc nhập
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">Mã định danh Snapshot BM02/BM03.2 (không hiển thị trên file in/xuất)</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-sm min-w-[240px]">
                <input
                  id="maPhieuInputBBNT"
                  type="text"
                  placeholder="VD: XDIJC-QTMH-BM01-26090074"
                  value={bm02Data.maPhieu || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBm02Data(prev => ({ ...prev, maPhieu: val, maPhieuNguon: val }));
                    setBbntData(prev => ({ ...prev, maPhieu: val }));
                    setBm04Data(prev => ({ ...prev, maPhieu: val }));
                  }}
                  onBlur={(e) => {
                    const formatted = formatStandardMaPhieu(e.target.value);
                    if (formatted && formatted !== e.target.value) {
                      setBm02Data(prev => ({ ...prev, maPhieu: formatted, maPhieuNguon: formatted }));
                      setBbntData(prev => ({ ...prev, maPhieu: formatted }));
                      setBm04Data(prev => ({ ...prev, maPhieu: formatted }));
                    }
                  }}
                  className={`w-full px-3.5 py-2 bg-slate-900 border rounded-lg text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                    isDuplicateMaPhieu 
                      ? "border-rose-500 focus:ring-rose-500/50" 
                      : isTemplateCodeOnly(bm02Data.maPhieu) && (bm02Data.maPhieu || "").trim() !== ""
                        ? "border-amber-500/70 focus:ring-amber-500/50"
                        : (bm02Data.maPhieu || "").trim() !== "" 
                          ? "border-emerald-500/70 focus:ring-emerald-500/50" 
                          : "border-slate-600 focus:ring-indigo-500"
                  }`}
                />
              </div>
            </div>

            <div id="document-bbnt" className="bg-white shadow-2xl rounded-sm border border-slate-300 mx-auto max-w-[850px] document-font p-12 md:p-16 space-y-3 min-h-[1100px] text-black relative">

            {/* Source and Synced Badge Component */}
            <div className="absolute top-4 right-4 print:hidden flex items-center gap-2 z-10 select-none">
              {bbntData.sourceType === 'BM06' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 rounded-full text-xs font-bold shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  📋 From BM06 Form
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors border border-sky-200 rounded-full text-xs font-bold shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                  </span>
                  📄 From PDF Extract
                </span>
              )}
              
              {currentRecordId && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all duration-500 ${
                  bbntSynced 
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100" 
                    : "bg-indigo-50/50 text-indigo-600 border-indigo-200/60"
                }`}>
                  <svg className={`w-3.5 h-3.5 ${bbntSynced ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                  </svg>
                  {bbntSynced ? "Synced!" : "Live Synced"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-[1.5fr_3fr_1.5fr] border border-black mb-1">
              <div className="border-r border-black p-4 flex items-center justify-center relative group">
                {logoUrl ? (
                  <div className="relative">
                    <img src={logoUrl} alt="Logo" className="max-h-16 object-contain" />
                    <button 
                      onClick={removeLogo}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                      title="Xóa Logo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="bti-logo-container">
                    <div className="bti-box"><span className="bti-letter">B</span></div>
                    <div className="bti-box"><span className="bti-letter">T</span></div>
                    <div className="bti-box"><span className="bti-letter">I</span></div>
                  </div>
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-[10px] font-bold uppercase">
                  <Upload size={14} className="mr-1" /> Chọn Logo
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              </div>
              <div className="border-r border-black p-4 flex flex-col items-center justify-center text-center">
                <textarea 
                  className="w-full text-center font-bold text-lg uppercase leading-tight text-red-600 bg-transparent border-none focus:ring-0 p-0 resize-none"
                  value={bbntData.title || (window as any)._currentMaterialConfig?.bm032?.title || 'Biên bản nghiệm thu và bàn giao'}
                  onChange={(e) => setBbntData(prev => ({ ...prev, title: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="p-2 flex items-center justify-center font-bold text-xs uppercase">QTMH-BM03.2</div>
            </div>

            <div className="text-right italic text-red-600 flex justify-end gap-1 mb-1">
                <input className="bg-transparent border-none text-right focus:ring-0 p-0 italic w-44" value={(bbntData.location && !bbntData.location.toLowerCase().includes('thuộc') && !bbntData.location.toLowerCase().includes('lô') && !bbntData.location.toLowerCase().includes('khu')) ? bbntData.location : (bm04Data.location || 'Tp. Hồ Chí Minh')} onChange={(e) => syncLocation(e.target.value)} />,
                <input className="bg-transparent border-none text-left focus:ring-0 p-0 italic w-80" value={formatNgay(bbntData.date || bm04Data.date) || ''} onChange={(e) => syncDate(e.target.value)} />
            </div>

            <section className="space-y-0">
              <h2 className="font-bold uppercase">1. ĐỐI TƯỢNG:</h2>
              <div className="ml-4 space-y-0">
                <div className="flex gap-2"><span>- Công trình:</span><input id="bbnt_congTrinh" className="flex-1 bg-transparent border-none focus:ring-0 p-0 font-bold text-red-600" value={bbntData.project || bm04Data.project || extractCongTrinhFromDiaDiem(bm02Data.mucDichSuDungDiaDiem || bm02Data.location || bbntData.address || '')} onChange={(e) => syncProject(e.target.value)} /></div>
                <div className="flex gap-2"><span>- Hạng mục:</span><textarea id="bbnt_hangMuc" className="flex-1 bg-transparent border-none focus:ring-0 p-0 font-bold text-red-600 resize-none h-auto min-h-[1.3em]" rows={Math.max(1, (bbntData.category || '').split('\n').length)} value={bbntData.category || ''} onChange={(e) => { updateBBNTCategory(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.max(20, e.target.scrollHeight)}px`; }} /></div>
                <div className="flex gap-2"><span>- Địa điểm:</span><textarea id="bbnt_diaDiem" className="flex-1 bg-transparent border-none focus:ring-0 p-0 font-bold text-red-600 resize-none h-auto min-h-[1.3em]" rows={Math.max(1, (bm02Data.mucDichSuDungDiaDiem || bm02Data.location || bbntData.address || '').split('\n').length)} value={bm02Data.mucDichSuDungDiaDiem || bm02Data.location || bbntData.address || ''} onChange={(e) => {
                  syncDiaDiem(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.max(20, e.target.scrollHeight)}px`;
                }} /></div>
              </div>
            </section>

            <section className="space-y-0.5 mt-1">
              <h2 className="font-bold uppercase text-[11pt]">2. Thành phần tham gia nghiệm thu:</h2>
              <div className="ml-4 space-y-0.5">
                <div>
                  <div className="font-bold uppercase flex gap-2"><span className="underline">BÊN GIAO:</span> <input className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-red-600 font-bold uppercase" value={resolvedSenderCompany} onChange={(e) => syncSenderCompany(e.target.value)} /></div>
                  <div className="ml-4 space-y-0">
                    {resolvedSenderList.map((r, i) => (
                      <div key={i} className="flex gap-10 items-center">
                        <span className="min-w-[200px] font-medium flex items-center gap-1">
                          - <span 
                              className="cursor-pointer hover:underline text-blue-800 select-none" 
                              title="Bấm để đổi Ông / Bà"
                              onClick={() => syncSenderRepresentative(i, 'salutation', (r.salutation || 'Ông') === 'Bà' ? 'Ông' : 'Bà')}
                            >{r.salutation || 'Ông'}:</span> <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 font-medium w-40" value={r.name || ''} onChange={(e) => syncSenderRepresentative(i, 'name', e.target.value)} />
                        </span>
                        <span className="flex gap-1 items-center">Chức vụ: <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 font-medium w-40" value={r.position || ''} onChange={(e) => syncSenderRepresentative(i, 'position', e.target.value)} /></span>
                        {i > 0 && (
                          <button type="button" onClick={() => syncRemoveSenderRepresentative(i)} className="text-red-500 hover:text-red-700 text-xs px-1 print:hidden" title="Xóa người đại diện này">✕</button>
                        )}
                      </div>
                    ))}
                    <div className="pt-1 print:hidden">
                      <button type="button" onClick={syncAddSenderRepresentative} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                        + Thêm đại diện Bên Giao
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <BM032ReceiverListEditor
                    receiverCompany={resolvedReceiverCompany}
                    onReceiverCompanyChange={syncReceiverCompany}
                    receiverList={resolvedReceiverList}
                    onChange={syncReceiverList}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-0.5">
              <h2 className="font-bold uppercase">3. Thời gian, địa điểm:</h2>
              <div className="ml-8 italic space-y-0">
                <div className="flex gap-1">Bắt đầu: lúc: <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic w-20" value={bbntData.startTime || bm04Data.startTime || ''} onChange={(e) => syncStartTime(e.target.value)} /> <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic w-full" value={formatNgay(bbntData.startDate || bbntData.date || bm04Data.startDate || bm04Data.date) || ''} onChange={(e) => syncDate(e.target.value)} /></div>
                <div className="flex gap-1">Kết thúc: lúc: <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic w-20" value={bbntData.endTime || bm04Data.endTime || ''} onChange={(e) => syncEndTime(e.target.value)} /> <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic w-full" value={formatNgay(bbntData.endDate || bbntData.date || bm04Data.endDate || bm04Data.date) || ''} onChange={(e) => syncDate(e.target.value)} /></div>
                <div className="flex gap-1"><span>Tại công trình:</span> <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic flex-1" value={(bbntData.locationDetail || bm04Data.locationDetail || '').replace(/^Tại công trình:\s*/i, '')} onChange={(e) => syncLocationDetail(e.target.value)} /></div>
              </div>
            </section>

            <section className="space-y-0.5">
              <div className="flex justify-between items-center">
                <h2 className="font-bold uppercase">4. Tài liệu làm căn cứ:</h2>
                <button type="button" onClick={syncAddGround} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium print:hidden" title="Thêm căn cứ">+ Thêm căn cứ</button>
              </div>
              <ul className="ml-8 list-none space-y-0">
                {resolvedGroundsList.map((g, i) => (
                  <li key={i} className="flex gap-2 items-center">
                    <span>-</span>
                    <textarea className={`bg-transparent border-none focus:ring-0 p-0 flex-1 resize-none h-auto min-h-[1.3em] ${(g || '').includes('BTI') ? 'text-red-600 font-medium' : ''}`} value={g || ''} rows={Math.ceil((g || '').length/85)} onChange={(e) => syncGrounds(i, e.target.value)} />
                    {i > 0 && (
                      <button type="button" onClick={() => syncRemoveGround(i)} className="text-red-500 hover:text-red-700 text-xs px-1 print:hidden" title="Xóa căn cứ này">✕</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-1.5">
              <div className="flex justify-between items-center">
                <h2 className="font-bold uppercase">5. Khối lượng công việc:</h2>
                {bm02Data.sourceType !== 'BM06' && (
                  <button onClick={addBM02Item} className="p-1 text-blue-600 hover:bg-blue-50 rounded-full border border-blue-200"><Plus size={16} /></button>
                )}
              </div>
              <table className="w-full border-collapse border border-black text-center text-[11pt]">
                <thead className="font-bold bg-slate-50">
                  <tr>
                    <td className="border border-black p-1 w-10">Stt</td>
                    <td className="border border-black p-1">Diễn giải</td>
                    <td className="border border-black p-1 w-14">ĐVT</td>
                    <td className="border border-black p-1 w-20 text-[10pt] leading-tight">Số lượng yêu cầu</td>
                    <td className="border border-black p-1 w-24 text-[10pt] leading-tight">
                      <span>Số lượng nghiệm thu</span>
                      <button 
                        type="button" 
                        onClick={syncAcceptedQtyAndNotesFromBM02} 
                        title="Đồng bộ lại cột Nghiệm thu & Ghi chú theo đúng khối lượng BM02" 
                        className="block mx-auto text-[8.5pt] text-blue-600 hover:text-blue-800 underline font-normal print:hidden cursor-pointer"
                      >
                        (đồng bộ BM02)
                      </button>
                    </td>
                    <td className="border border-black p-1 w-16">Ghi chú</td>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const items = bbntData.items || [];
                    const h = getHierarchy(bbntData.selectedUnits, items);
                    const isGrouped = bbntData.isGroupedDisplay || bbntData.displayMode === "GROUPED_EQUAL";

                    if (isGrouped) {
                      const renderedRows: React.ReactNode[] = [];
                      const totalSelectedUnits = bbntData.selectedUnits?.length || 0;
                      
                      renderedRows.push(
                        <tr key="grouped-bbnt-hd" className="bg-slate-50 border-y border-black font-black text-[10pt] leading-normal h-10 select-none">
                          <td className="p-1 border border-black font-black text-slate-950 text-center text-[10.5pt]">
                            ★
                          </td>
                          <td className="p-2 border border-black text-left font-black text-slate-900 text-[9.5pt] tracking-tight pl-3" colSpan={5}>
                            DANH SÁCH VẬT TƯ GỘP ({totalSelectedUnits} căn): {(bbntData.selectedUnits || []).map(u => u.unitId).join(", ")}
                          </td>
                        </tr>
                      );

                      items.forEach((it, idx) => {
                        renderedRows.push(renderBBNTRow(it, idx, idx + 1));
                      });

                      return renderedRows;
                    }

                    if (h.list.length === 0) {
                      return items.map((it, idx) => renderBBNTRow(it, idx, idx + 1));
                    }

                    const renderedRows: React.ReactNode[] = [];

                    h.list.forEach((u, groupIdx) => {
                      const projId = u.projectId;
                      const unitId = u.unitId;
                      const groupItems = items.filter(
                        it => !it.isSharedCost && (it.projectId || '').toLowerCase() === projId.toLowerCase() && 
                              (it.unitId || '').toLowerCase() === unitId.toLowerCase()
                      );

                      // Add 1 header row: DỰ ÁN: [Tên dự án] - CĂN: [Tên căn]
                      // No cell merging (colSpan ignored) - separate cells clearly, just like BM06
                      renderedRows.push(
                        <tr key={`group-hd-${projId}-${unitId}`} className="bg-slate-50 border-y border-black font-black text-[10pt] leading-normal h-10 select-none">
                          <td className="p-1 border border-black font-black text-slate-950 text-center text-[10.5pt]">
                            {toRoman(groupIdx)}
                          </td>
                          <td className="p-2 border border-black text-left font-black text-slate-900 text-[9.5pt] tracking-tight pl-3">
                            {formatUnitNameForTable(unitId)}
                          </td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                        </tr>
                      );

                      let groupStt = 0;
                      groupItems.forEach((it) => {
                        groupStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBBNTRow(it, originalIdx, groupStt));
                      });
                    });

                    const sharedItems = items.filter(it => it.isSharedCost);
                    if (sharedItems.length > 0) {
                      renderedRows.push(
                        <tr key="shared-hd-bbnt" className="bg-slate-50 border-y border-black font-black text-[10pt] leading-normal h-10 select-none">
                          <td className="p-1 border border-black font-black text-slate-950 text-center text-[10.5pt]">★</td>
                          <td className="p-2 border border-black text-left font-black text-slate-900 text-[9.5pt] tracking-tight pl-3 uppercase">
                            CHI PHÍ CHIA ĐỀU CÁC CĂN ({(bbntData.selectedUnits || []).length} căn): {(bbntData.selectedUnits || []).map((u:any) => u.unitId).join(", ")}
                          </td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                        </tr>
                      );
                      let sharedStt = 0;
                      sharedItems.forEach((it) => {
                        sharedStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBBNTRow(it, originalIdx, sharedStt));
                      });
                    }

                    const orphanItems = items.filter(it => {
                      if (it.isSharedCost) return false;
                      const proj = it.projectId || '';
                      const unit = it.unitId || '';
                      return !h.list.some(u => 
                        u.projectId.toLowerCase() === proj.toLowerCase() && 
                        u.unitId.toLowerCase() === unit.toLowerCase()
                      );
                    });

                    if (orphanItems.length > 0) {
                      renderedRows.push(
                        <tr key="orphan-hd" className="bg-slate-100 border-y border-black font-bold text-xs select-none">
                          <td className="border border-black p-1 text-center font-bold">X</td>
                          <td className="p-2 border border-black text-left uppercase text-slate-700 tracking-wider font-extrabold pl-4">
                            VẬT TƯ KHÁC / CHƯA PHÂN LOẠI
                          </td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                        </tr>
                      );
                      let orphanStt = 0;
                      orphanItems.forEach((it) => {
                        orphanStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBBNTRow(it, originalIdx, orphanStt));
                      });
                    }

                    return renderedRows;
                  })()}
                </tbody>
              </table>
            </section>

            <section className="space-y-0.5 pt-1">
              <h2 className="font-bold uppercase">6. Đánh giá:</h2>
              <div className="ml-4 space-y-0">
                <div>- Về yêu cầu chất lượng dịch vụ: đạt yêu cầu</div>
                <div>- Về ý kiến khác (nếu có): không có</div>
              </div>
            </section>

            <section className="space-y-0 mt-1">
              <h2 className="font-bold uppercase">7. Kết luận:</h2>
              <div className="ml-4">- Đồng ý nghiệm thu theo khối lượng như trên</div>
            </section>

            <div className="mt-4">
              <h2 className="font-bold uppercase text-center underline mb-4">CHỮ KÝ CÁC BÊN</h2>
              {renderChuKyBBNT(bbntData, false)}
            </div>
          </div>
        </div>
        ) : activeTab === 'BM04' ? (
          <div className="mx-auto max-w-[850px] mb-4 space-y-4">
            {/* BANNER NHẬP MÃ PHIẾU */}
            <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600/20 text-emerald-400 p-2 rounded-lg border border-emerald-500/30">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="maPhieuInputBM04" className="text-xs font-black text-slate-200 uppercase tracking-wider">
                      MÃ PHIẾU <span className="text-rose-400">*</span>
                    </label>
                    {isDuplicateMaPhieu ? (
                      <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle size={10} /> Trùng mã
                      </span>
                    ) : isTemplateCodeOnly(bm02Data.maPhieu) && (bm02Data.maPhieu || "").trim() !== "" ? (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold flex items-center gap-1" title="Vui lòng nhập thêm số hiệu phiếu (ví dụ: XDIJC-QTMH-BM01-26070048 hoặc 26070048)">
                        <AlertCircle size={10} /> Cần thêm số hiệu
                      </span>
                    ) : (bm02Data.maPhieu || "").trim() !== "" ? (
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 size={10} /> Mã hợp lệ
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle size={10} /> Bắt buộc nhập
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">Mã định danh Snapshot BM02/BM03.2/BM04 (không hiển thị trên file in/xuất)</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-sm min-w-[240px]">
                <input
                  id="maPhieuInputBM04"
                  type="text"
                  placeholder="VD: XDIJC-QTMH-BM01-26090074"
                  value={bm02Data.maPhieu || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBm02Data(prev => ({ ...prev, maPhieu: val, maPhieuNguon: val }));
                    setBbntData(prev => ({ ...prev, maPhieu: val }));
                    setBm04Data(prev => ({ ...prev, maPhieu: val }));
                  }}
                  onBlur={(e) => {
                    const formatted = formatStandardMaPhieu(e.target.value);
                    if (formatted && formatted !== e.target.value) {
                      setBm02Data(prev => ({ ...prev, maPhieu: formatted, maPhieuNguon: formatted }));
                      setBbntData(prev => ({ ...prev, maPhieu: formatted }));
                      setBm04Data(prev => ({ ...prev, maPhieu: formatted }));
                    }
                  }}
                  className={`w-full px-3.5 py-2 bg-slate-900 border rounded-lg text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                    isDuplicateMaPhieu 
                      ? "border-rose-500 focus:ring-rose-500/50" 
                      : isTemplateCodeOnly(bm02Data.maPhieu) && (bm02Data.maPhieu || "").trim() !== ""
                        ? "border-amber-500/70 focus:ring-amber-500/50"
                        : (bm02Data.maPhieu || "").trim() !== "" 
                          ? "border-emerald-500/70 focus:ring-emerald-500/50" 
                          : "border-slate-600 focus:ring-emerald-500"
                  }`}
                />
              </div>
            </div>

            <div id="document-bm04" className="bg-white shadow-2xl rounded-sm border border-slate-300 mx-auto max-w-[850px] document-font p-12 md:p-16 space-y-3 min-h-[1100px] text-black relative">

            {/* Source and Synced Badge Component */}
            <div className="absolute top-4 right-4 print:hidden flex items-center gap-2 z-10 select-none">
              {bm04Data.sourceType === 'BM06' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 rounded-full text-xs font-bold shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  📋 From BM06 Form
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors border border-sky-200 rounded-full text-xs font-bold shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                  </span>
                  📄 From PDF Extract
                </span>
              )}
              
              {currentRecordId && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all duration-500 ${
                  bm04Synced 
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-100" 
                    : "bg-emerald-50/50 text-emerald-600 border-emerald-200/60"
                }`}>
                  <svg className={`w-3.5 h-3.5 ${bm04Synced ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                  </svg>
                  {bm04Synced ? "Synced!" : "Live Synced"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-[1.5fr_3fr_1.5fr] border border-black mb-1">
              <div className="border-r border-black p-4 flex items-center justify-center relative group">
                {logoUrl ? (
                  <div className="relative">
                    <img src={logoUrl} alt="Logo" className="max-h-16 object-contain" />
                    <button 
                      onClick={removeLogo}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                      title="Xóa Logo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="bti-logo-container">
                    <div className="bti-box"><span className="bti-letter">B</span></div>
                    <div className="bti-box"><span className="bti-letter">T</span></div>
                    <div className="bti-box"><span className="bti-letter">I</span></div>
                  </div>
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-[10px] font-bold uppercase">
                  <Upload size={14} className="mr-1" /> Chọn Logo
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              </div>
              <div className="border-r border-black p-4 flex flex-col items-center justify-center text-center">
                <textarea 
                  className="w-full text-center font-bold text-lg uppercase leading-tight text-red-600 bg-transparent border-none focus:ring-0 p-0 resize-none"
                  value={bm04Data.title || (window as any)._currentMaterialConfig?.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ'}
                  onChange={(e) => setBm04Data(prev => ({ ...prev, title: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="p-2 flex items-center justify-center font-bold text-xs uppercase">QTMH-BM04</div>
            </div>

            <div className="text-right italic text-red-600 flex justify-end gap-1 mb-1">
                <input className="bg-transparent border-none text-right focus:ring-0 p-0 italic w-44" value={(bm04Data.location && !bm04Data.location.toLowerCase().includes('thuộc') && !bm04Data.location.toLowerCase().includes('lô') && !bm04Data.location.toLowerCase().includes('khu')) ? bm04Data.location : (bbntData.location || 'Tp. Hồ Chí Minh')} onChange={(e) => syncLocation(e.target.value)} />,
                <input className="bg-transparent border-none text-left focus:ring-0 p-0 italic w-80" value={formatNgay(bm04Data.date || bbntData.date) || ''} onChange={(e) => syncDate(e.target.value)} />
            </div>

            <section className="space-y-0.5 mt-1">
              <div>
                <div className="font-bold uppercase flex gap-2"><span className="underline">1. BÊN GIAO:</span> <input className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-red-600 font-bold uppercase" value={resolvedSenderCompany} onChange={(e) => syncSenderCompany(e.target.value)} /></div>
                <div className="ml-4 space-y-0">
                  {resolvedSenderList.map((r, i) => (
                    <div key={i} className="flex gap-10 items-center">
                      <span className="min-w-[200px] font-medium flex items-center gap-1">
                        - <span 
                            className="cursor-pointer hover:underline text-blue-800 select-none" 
                            title="Bấm để đổi Ông / Bà"
                            onClick={() => syncSenderRepresentative(i, 'salutation', (r.salutation || 'Ông') === 'Bà' ? 'Ông' : 'Bà')}
                          >{r.salutation || 'Ông'}:</span> <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 font-medium w-40" value={r.name || ''} onChange={(e) => syncSenderRepresentative(i, 'name', e.target.value)} />
                      </span>
                      <span className="flex gap-1 items-center">Chức vụ: <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 font-medium w-40" value={r.position || ''} onChange={(e) => syncSenderRepresentative(i, 'position', e.target.value)} /></span>
                      {i > 0 && (
                        <button type="button" onClick={() => syncRemoveSenderRepresentative(i)} className="text-red-500 hover:text-red-700 text-xs px-1 print:hidden" title="Xóa người đại diện này">✕</button>
                      )}
                    </div>
                  ))}
                  <div className="pt-1 print:hidden">
                    <button type="button" onClick={syncAddSenderRepresentative} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                      + Thêm đại diện Bên Giao
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <BM032ReceiverListEditor
                  label="2. BÊN NHẬN:"
                  receiverCompany={resolvedReceiverCompany}
                  onReceiverCompanyChange={syncReceiverCompany}
                  receiverList={resolvedReceiverList}
                  onChange={syncReceiverList}
                />
              </div>
            </section>

            <section className="space-y-0.5">
              <h2 className="font-bold uppercase">3. Thời gian, địa điểm:</h2>
              <div className="ml-8 italic space-y-0">
                <div className="flex gap-1">Bắt đầu: lúc: <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic w-20" value={bm04Data.startTime || bbntData.startTime || ''} onChange={(e) => syncStartTime(e.target.value)} /> <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic w-full" value={formatNgay(bm04Data.startDate || bm04Data.date || bbntData.startDate || bbntData.date) || ''} onChange={(e) => syncDate(e.target.value)} /></div>
                <div className="flex gap-1">Kết thúc: lúc: <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic w-20" value={bm04Data.endTime || bbntData.endTime || ''} onChange={(e) => syncEndTime(e.target.value)} /> <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic w-full" value={formatNgay(bm04Data.endDate || bm04Data.date || bbntData.endDate || bbntData.date) || ''} onChange={(e) => syncDate(e.target.value)} /></div>
                <div className="flex gap-1"><span>Tại công trình:</span> <input className="bg-transparent border-none focus:ring-0 p-0 text-red-600 italic flex-1" value={(bm04Data.locationDetail || bbntData.locationDetail || '').replace(/^Tại công trình:\s*/i, '')} onChange={(e) => syncLocationDetail(e.target.value)} /></div>
              </div>
            </section>

            <section className="space-y-0.5">
              <div className="flex justify-between items-center">
                <h2 className="font-bold uppercase">4. Tài liệu làm căn cứ:</h2>
                <button type="button" onClick={syncAddGround} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium print:hidden" title="Thêm căn cứ">+ Thêm căn cứ</button>
              </div>
              <ul className="ml-8 list-none space-y-0">
                {resolvedGroundsList.map((g, i) => (
                  <li key={i} className="flex gap-2 items-center">
                    <span>-</span>
                    <textarea className={`bg-transparent border-none focus:ring-0 p-0 flex-1 resize-none h-auto min-h-[1.3em] ${(g || '').includes('BTI') ? 'text-red-600 font-medium' : ''}`} value={g || ''} rows={Math.ceil((g || '').length/85)} onChange={(e) => syncGrounds(i, e.target.value)} />
                    {i > 0 && (
                      <button type="button" onClick={() => syncRemoveGround(i)} className="text-red-500 hover:text-red-700 text-xs px-1 print:hidden" title="Xóa căn cứ này">✕</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-1">
              <h2 className="font-bold uppercase">5. Nội dung giao nhận:</h2>
              <table className="w-full border-collapse border border-black text-xs">
                <thead>
                  <tr className="bg-slate-100 font-bold text-center">
                    <th className="border border-black p-1 w-10">STT</th>
                    <th className="border border-black p-1">Tên vật tư</th>
                    <th className="border border-black p-1 w-14">ĐVT</th>
                    <th className="border border-black p-1 w-24">KL yêu cầu</th>
                    <th className="border border-black p-1 w-24">
                      <span>KL giao nhận</span>
                      <button 
                        type="button" 
                        onClick={syncAcceptedQtyAndNotesFromBM02} 
                        title="Đồng bộ lại cột Giao nhận & Ghi chú theo đúng khối lượng BM02" 
                        className="block mx-auto text-[8pt] text-blue-600 hover:text-blue-800 underline font-normal print:hidden cursor-pointer"
                      >
                        (đồng bộ BM02)
                      </button>
                    </th>
                    <th className="border border-black p-1 w-32">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const items = bm04Data.items || [];
                    const h = getHierarchy(bm04Data.selectedUnits, items);
                    const isGrouped = bm04Data.isGroupedDisplay || bm04Data.displayMode === "GROUPED_EQUAL";

                    if (isGrouped) {
                      const renderedRows: React.ReactNode[] = [];
                      const totalSelectedUnits = bm04Data.selectedUnits?.length || 0;
                      
                      renderedRows.push(
                        <tr key="grouped-bm04-hd" className="bg-slate-50 border-y border-black font-black text-[10pt] leading-normal h-10 select-none">
                          <td className="p-1 border border-black font-black text-slate-950 text-center text-[10.5pt]">
                            ★
                          </td>
                          <td className="p-2 border border-black text-left font-black text-slate-900 text-[9.5pt] tracking-tight pl-3" colSpan={5}>
                            DANH SÁCH VẬT TƯ GỘP ({totalSelectedUnits} căn): {(bm04Data.selectedUnits || []).map(u => u.unitId).join(", ")}
                          </td>
                        </tr>
                      );

                      items.forEach((it, idx) => {
                        renderedRows.push(renderBBNTRow(it, idx, idx + 1, true));
                      });

                      return renderedRows;
                    }

                    if (h.list.length === 0) {
                      return items.map((it, idx) => renderBBNTRow(it, idx, idx + 1, true));
                    }

                    const renderedRows: React.ReactNode[] = [];

                    h.list.forEach((u, groupIdx) => {
                      const projId = u.projectId;
                      const unitId = u.unitId;
                      const groupItems = items.filter(
                        it => !it.isSharedCost && (it.projectId || '').toLowerCase() === projId.toLowerCase() && 
                              (it.unitId || '').toLowerCase() === unitId.toLowerCase()
                      );

                      renderedRows.push(
                        <tr key={`group-hd-${projId}-${unitId}`} className="bg-slate-50 border-y border-black font-black text-[10pt] leading-normal h-10 select-none">
                          <td className="p-1 border border-black font-black text-slate-950 text-center text-[10.5pt]">
                            {toRoman(groupIdx)}
                          </td>
                          <td className="p-2 border border-black text-left font-black text-slate-900 text-[9.5pt] tracking-tight pl-3" colSpan={5}>
                            DỰ ÁN: {projId} - CĂN: {unitId}
                          </td>
                        </tr>
                      );

                      let localStt = 0;
                      groupItems.forEach((it) => {
                        localStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBBNTRow(it, originalIdx, localStt, true));
                      });
                    });

                    const sharedItems = items.filter(it => it.isSharedCost);
                    if (sharedItems.length > 0) {
                      renderedRows.push(
                        <tr key="shared-bm04-hd" className="bg-slate-100 border-y border-black font-bold text-xs select-none">
                          <td className="border border-black p-1 text-center font-bold">★</td>
                          <td className="p-2 border border-black text-left uppercase text-slate-700 tracking-wider font-extrabold pl-4">
                            CHI PHÍ DÙNG CHUNG
                          </td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                        </tr>
                      );
                      let sharedStt = 0;
                      sharedItems.forEach((it) => {
                        sharedStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBBNTRow(it, originalIdx, sharedStt, true));
                      });
                    }

                    const orphanItems = items.filter(it => {
                      if (it.isSharedCost) return false;
                      const proj = it.projectId || '';
                      const unit = it.unitId || '';
                      return !h.list.some(u => 
                        u.projectId.toLowerCase() === proj.toLowerCase() && 
                        u.unitId.toLowerCase() === unit.toLowerCase()
                      );
                    });

                    if (orphanItems.length > 0) {
                      renderedRows.push(
                        <tr key="orphan-bm04-hd" className="bg-slate-100 border-y border-black font-bold text-xs select-none">
                          <td className="border border-black p-1 text-center font-bold">X</td>
                          <td className="p-2 border border-black text-left uppercase text-slate-700 tracking-wider font-extrabold pl-4">
                            VẬT TƯ KHÁC / CHƯA PHÂN LOẠI
                          </td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                          <td className="p-1 border border-black"></td>
                        </tr>
                      );
                      let orphanStt = 0;
                      orphanItems.forEach((it) => {
                        orphanStt++;
                        const originalIdx = items.findIndex(x => x.id === it.id);
                        renderedRows.push(renderBBNTRow(it, originalIdx, orphanStt, true));
                      });
                    }

                    return renderedRows;
                  })()}
                </tbody>
              </table>
            </section>

            <section className="space-y-0.5 pt-1">
              <h2 className="font-bold uppercase">6. Đánh giá:</h2>
              <div className="ml-4 space-y-0">
                <div>- Về tình trạng hàng hóa/vật tư: đạt yêu cầu, đúng quy cách chủng loại</div>
                <div>- Về ý kiến khác (nếu có): không có</div>
              </div>
            </section>

            <section className="space-y-0 mt-1">
              <h2 className="font-bold uppercase">7. Kết luận:</h2>
              <div className="ml-4">- Hai bên thống nhất bàn giao và tiếp nhận số lượng vật tư nêu trên.</div>
            </section>

            <div className="mt-4">
              <h2 className="font-bold uppercase text-center underline mb-4">CHỮ KÝ CÁC BÊN</h2>
              {renderChuKyBBNT(bm04Data, false)}
            </div>
          </div>
        </div>
        ) : null}
      </main>
      </div>
      )}

      {/* TOAST NOTIFICATION */}
      {showDeleteConfirm.show && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl border border-slate-700 w-full max-w-sm transform animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-white mb-2">Xác nhận xóa</h3>
            <p className="text-slate-300 text-sm mb-6">Bạn có chắc chắn muốn xóa dữ liệu này? Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3">
               <button onClick={() => setShowDeleteConfirm({show: false, id: null})} className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold transition-all text-sm uppercase tracking-wider">HỦY BỎ</button>
               <button onClick={async () => {
                console.log("Xóa button clicked. Confirm state:", showDeleteConfirm);
                const targetId = showDeleteConfirm.id;
                const customFn = showDeleteConfirm.deleteFn;
                setShowDeleteConfirm({show: false, id: null});
                if (customFn) {
                    console.log("Calling custom deleteFn");
                    await customFn();
                } else if (targetId) {
                    await deleteRecord(targetId);
                }
               }} className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all text-sm uppercase tracking-wider shadow-md">XÓA</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl animate-bounce-in ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-bold text-sm tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL FOR HISTORY */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-white p-6 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg transform animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center gap-3 mb-3 text-red-600">
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl border border-red-100">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Xác nhận xóa hàng loạt</h3>
                <p className="text-xs text-red-500 font-medium">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 text-slate-700 text-sm">
              <p className="font-semibold text-slate-800">
                Bạn đang chọn <span className="text-red-600 font-bold text-base px-1">{selectedRecordIds.length}</span> phiếu để xóa.
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Dữ liệu sau khi xóa sẽ không còn hiển thị trong Lịch sử trình phiếu.
              </p>
            </div>

            {/* Selected Items Preview */}
            <div className="flex-1 overflow-y-auto max-h-52 mb-5 border border-slate-200 rounded-xl bg-slate-50/50 divide-y divide-slate-100 custom-scrollbar">
              {(savedRecords || [])
                .filter(r => selectedRecordIds.includes(r.id))
                .map((rec, i) => (
                  <div key={rec.id || i} className="p-3 text-xs text-slate-700 flex items-start gap-2.5 hover:bg-white transition-colors">
                    <span className="font-mono text-slate-400 w-5 text-right shrink-0 font-bold">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-600">{extractMaPhieu(rec) || 'Chưa có mã'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({hienThiNgay(rec.createdAt || rec.updatedAt)})</span>
                      </div>
                      <p className="text-slate-600 text-[11px] truncate mt-0.5 font-medium">
                        {rec.mucDichSuDungNoiDung || rec.title || 'Phiếu trình vật tư'}
                      </p>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button 
                type="button"
                onClick={() => setShowBulkDeleteModal(false)} 
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
              >
                HỦY
              </button>
              <button 
                type="button"
                disabled={isProcessing}
                onClick={handleBulkDeleteConfirm} 
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all text-xs uppercase tracking-wider shadow-lg shadow-red-200 flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>ĐANG XÓA...</span>
                  </>
                ) : (
                  <span>XÓA {selectedRecordIds.length} PHIẾU</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL WITH EXCEL-LIKE FILTERABLE TABLE */}
      {showHistory && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
          <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden border border-slate-250 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-md">
                  <Database size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Lịch sử trình phiếu</h2>
                  <p className="text-xs text-slate-500 font-medium">Danh sách tổng hợp và quản lý chi tiết các phiếu đề nghị và nghiệm thu đã tạo</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={selectedRecordIds.length === 0}
                  onClick={() => {
                    if (selectedRecordIds.length > 0) {
                      if (!canDelete(currentUser)) {
                        setToast({ message: "Lỗi phân quyền: Chỉ tài khoản ADMIN mới được phép xóa dữ liệu.", type: "error" });
                        return;
                      }
                      setShowBulkDeleteModal(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all shadow-sm ${
                    selectedRecordIds.length > 0
                      ? "bg-red-600 text-white hover:bg-red-700 cursor-pointer active:scale-95 shadow-red-200"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                  }`}
                  title={selectedRecordIds.length > 0 ? `Xóa ${selectedRecordIds.length} phiếu đã chọn` : "Chọn ít nhất 1 phiếu để xóa"}
                >
                  <Trash2 size={14} />
                  <span>XÓA ({selectedRecordIds.length})</span>
                </button>
                <button 
                  onClick={() => {
                    setHistoryMaterialFilter("all");
                    setSelectedRecordIds([]);
                    loadRecords();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white text-indigo-600 border border-slate-200 rounded-xl font-bold text-xs hover:bg-slate-50 hover:border-indigo-200 transition-all shadow-sm active:scale-95"
                >
                  <RefreshCw size={12} className={isLoadingRecords ? "animate-spin" : ""} />
                  LÀM MỚI
                </button>
                <button 
                  onClick={() => {
                    setSelectedRecordIds([]);
                    setShowHistory(false);
                  }}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-4 bg-white border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
              {/* Left Search Bar */}
              <div className="relative flex-1 min-w-[260px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search size={15} />
                </div>
                <input
                  type="text"
                  placeholder="Tìm kiếm nội dung, số phiếu, vật tư..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                {historySearch && (
                  <button
                    onClick={() => setHistorySearch("")}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Right Filters (Material Type & Time/Date) */}
              <div className="flex flex-wrap gap-3 items-center">
                {/* Dropdown Loại Vật tư MultiSelect */}
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <span>Loại Vật tư:</span>
                  <MaterialMultiSelect
                    materials={danhSachVatTu || []}
                    selectedIds={historyMaterialFilter}
                    onChange={handleHistoryMaterialFilterChange}
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <span>Thời gian:</span>
                  <select
                    value={historyDateFilter}
                    onChange={(e) => setHistoryDateFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:ring-1 focus:ring-indigo-500 text-xs cursor-pointer"
                  >
                    <option value="all">Tất cả thời gian</option>
                    <option value="today">Hôm nay</option>
                    <option value="yesterday">Hôm qua</option>
                    <option value="thisWeek">Tuần này</option>
                    <option value="thisMonth">Tháng này</option>
                    <option value="custom">Tự chọn ngày...</option>
                  </select>
                </div>

                {historyDateFilter === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={(e) => setHistoryStartDate(e.target.value)}
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-400 text-xs font-bold px-0.5">đến</span>
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(e) => setHistoryEndDate(e.target.value)}
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Excel-like Table Content */}
            <div className="flex-1 overflow-auto p-4 bg-slate-50/50">
              {isLoadingRecords && savedRecords.length === 0 ? (
                <div className="h-72 flex flex-col items-center justify-center text-slate-400">
                  <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                  <p className="font-bold tracking-wider text-xs text-indigo-600">Đang đồng bộ dữ liệu...</p>
                </div>
              ) : (savedRecords || []).length === 0 ? (
                <div className="h-72 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                  <Database size={40} className="opacity-15 mb-2 text-indigo-600" />
                  <p className="font-bold text-sm text-slate-400">Chưa có phiếu nào được lưu</p>
                  <p className="text-xs text-slate-400 mt-1">Lưu dữ liệu phiếu tại màn hình chỉnh sửa để tạo lịch sử</p>
                </div>
              ) : (() => {
                // Apply Search, Filter and "sắp sếp theo ngày tạo mới nhất đến cũ"
                const sortedRecords = [...savedRecords].sort((a, b) => {
                  const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
                  const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
                  return dateB - dateA; // Newest to oldest
                });

                const filtered = sortedRecords.filter(record => {
                  const searchLower = historySearch.toLowerCase().trim();
                  
                  // Detail content search
                  const matchSearch = !searchLower || 
                    (extractMaPhieu(record)).toLowerCase().includes(searchLower) ||
                    (record.title || "").toLowerCase().includes(searchLower) ||
                    (record.mucDichSuDungNoiDung || "").toLowerCase().includes(searchLower) ||
                    (record.docNumber || "").toLowerCase().includes(searchLower) ||
                    (record.nguoiLap || "").toLowerCase().includes(searchLower) ||
                    (record.diaDiem || "").toLowerCase().includes(searchLower) ||
                    (record.items || []).some((it: any) => 
                      (it.name || "").toLowerCase().includes(searchLower) ||
                      (it.unit || "").toLowerCase().includes(searchLower)
                    );

                  const recordType = record.loaiTaiLieu || record.type || 'BM02';
                  const matchForm = historyFormFilter === 'all' || 
                    (historyFormFilter === 'BM02' && recordType === 'BM02') ||
                    (historyFormFilter === 'BBNT' && (recordType === 'BBNT' || recordType === 'BM03.2'));

                  const matchMaterial = (() => {
                    if (!historyMaterialFilter || historyMaterialFilter.length === 0 || historyMaterialFilter.includes('all')) {
                      return true;
                    }
                    if (historyMaterialFilter.includes('NONE')) {
                      return false;
                    }
                    const recMat = record.loaiVatTu;
                    if (recMat && historyMaterialFilter.includes(recMat)) {
                      return true;
                    }
                    if (record.items && Array.isArray(record.items)) {
                      const hasItemMatch = record.items.some((it: any) => {
                        const itMat = it.loaiVatTu || it.materialTypeId || recMat;
                        return itMat && historyMaterialFilter.includes(itMat);
                      });
                      if (hasItemMatch) return true;
                    }
                    return !recMat;
                  })();

                  // Time filtering logic
                  let matchDate = true;
                  if (historyDateFilter !== 'all') {
                    const recDate = new Date(record.createdAt || record.updatedAt || 0);
                    if (!isNaN(recDate.getTime())) {
                      const recTime = recDate.getTime();
                      const now = new Date();
                      
                      if (historyDateFilter === 'today') {
                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
                        matchDate = recTime >= todayStart && recTime <= todayEnd;
                      } else if (historyDateFilter === 'yesterday') {
                        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
                        const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).getTime();
                        matchDate = recTime >= yesterdayStart && recTime <= yesterdayEnd;
                      } else if (historyDateFilter === 'thisWeek') {
                        const day = now.getDay();
                        // Get Monday of current week
                        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                        const weekStart = new Date(now.setDate(diff));
                        weekStart.setHours(0, 0, 0, 0);
                        const weekStartVal = weekStart.getTime();
                        const weekEndVal = weekStartVal + 7 * 24 * 60 * 60 * 1000 - 1;
                        matchDate = recTime >= weekStartVal && recTime <= weekEndVal;
                      } else if (historyDateFilter === 'thisMonth') {
                        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
                        matchDate = recTime >= monthStart && recTime < nextMonthStart;
                      } else if (historyDateFilter === 'custom') {
                        if (historyStartDate) {
                          const start = new Date(historyStartDate);
                          start.setHours(0, 0, 0, 0);
                          matchDate = matchDate && recTime >= start.getTime();
                        }
                        if (historyEndDate) {
                          const end = new Date(historyEndDate);
                          end.setHours(23, 59, 59, 999);
                          matchDate = matchDate && recTime <= end.getTime();
                        }
                      }
                    } else {
                      matchDate = false;
                    }
                  }

                  return matchSearch && matchForm && matchMaterial && matchDate;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="h-72 flex flex-col items-center justify-center text-slate-400 bg-white border border-slate-200 rounded-xl">
                      <Search size={32} className="opacity-15 mb-2" />
                      <p className="font-bold text-sm text-slate-400">Không tìm thấy phiếu nào khớp với điều kiện lọc</p>
                    </div>
                  );
                }

                return (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse table-fixed min-w-[1020px]">
                        <thead>
                          <tr className="bg-slate-105 text-slate-700 uppercase font-black tracking-wider text-[11px] border-b border-slate-200">
                            <th className="p-3 text-center border-r border-slate-200 w-10 bg-slate-100/90 font-bold" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox"
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer align-middle"
                                checked={filtered.length > 0 && filtered.every(r => selectedRecordIds.includes(r.id))}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const allSelected = filtered.length > 0 && filtered.every(r => selectedRecordIds.includes(r.id));
                                  if (allSelected) {
                                    const currentFilteredIds = new Set(filtered.map(r => r.id));
                                    setSelectedRecordIds(prev => prev.filter(id => !currentFilteredIds.has(id)));
                                  } else {
                                    const newSet = new Set(selectedRecordIds);
                                    filtered.forEach(r => { if (r.id) newSet.add(r.id); });
                                    setSelectedRecordIds(Array.from(newSet));
                                  }
                                }}
                                title="Chọn / Bỏ chọn tất cả phiếu hiển thị"
                              />
                            </th>
                            <th className="p-3 text-center border-r border-slate-200 w-12 bg-slate-100/90 font-bold">STT</th>
                            <th className="p-3 text-center border-r border-slate-200 w-32 bg-slate-100/90 font-bold">Mã phiếu</th>
                            <th className="p-3 text-center border-r border-slate-200 w-28 bg-slate-100/90 font-bold">Ngày tạo</th>
                            <th className="p-3 text-center border-r border-slate-200 w-28 bg-slate-100/90 font-bold">Ngày đề nghị</th>
                            <th className="p-3 border-r border-slate-200 bg-slate-100/90 font-bold">Nội dung trình vật tư</th>
                            <th className="p-3 text-right border-r border-slate-200 w-36 bg-slate-100/90 font-bold">Thành tiền (VAT)</th>
                            <th className="p-3 text-center w-28 bg-slate-100/90 font-bold">Loại VT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filtered.map((record, idx) => {
                            const recordType = record.loaiTaiLieu || record.type || 'BM02';
                            const isBM02 = recordType === 'BM02';
                            const mat = danhSachVatTu.find(v => v.id === record.loaiVatTu);
                            const isChecked = selectedRecordIds.includes(record.id);
                            
                            // Direct snapshot retrieval for "TỔNG CỘNG (ĐÃ BAO GỒM THUẾ VAT)" matching BM02 form state
                            const totalWithTax = (() => {
                              const b = record.bm02 || record;
                              const showVat = Boolean(
                                b.showVat ?? b.showVAT ?? b.vatSnapshot?.showVAT ?? b.vatSnapshot?.showVat ??
                                record.showVat ?? record.showVAT ?? record.vatSnapshot?.showVAT ?? record.vatSnapshot?.showVat ?? false
                              );

                              const itemsList = record.items || record.danhSachVatTu || record.selectedItems || b.items || b.danhSachVatTu || [];
                              const calculatedSubtotal = Math.round(itemsList.reduce(
                                (acc: number, it: any) => {
                                  const q = Number(it.quantity) || Number(it.orderQty) || 0;
                                  const p = Number(it.unitPrice) || 0;
                                  const lTot = it.total !== undefined && it.total !== null && !isNaN(Number(it.total))
                                    ? Number(it.total)
                                    : Math.round(q * p * 100) / 100;
                                  return acc + lTot;
                                },
                                0
                              ));

                              if (!showVat) {
                                // If HIỂN THỊ VAT is unchecked, VAT is 0.
                                // The row "TỔNG CỘNG (ĐÃ BAO GỒM THUẾ VAT)" on BM02 is strictly subtotal (without VAT).
                                if (calculatedSubtotal > 0) return calculatedSubtotal;
                                if (b.vatSnapshot?.subTotal !== undefined && b.vatSnapshot?.subTotal !== null) return Number(b.vatSnapshot.subTotal) || 0;
                                if (b.totalAmount !== undefined && b.totalAmount !== null) return Number(b.totalAmount) || 0;
                                if (record.vatSnapshot?.subTotal !== undefined && record.vatSnapshot?.subTotal !== null) return Number(record.vatSnapshot.subTotal) || 0;
                                if (record.totalAmount !== undefined && record.totalAmount !== null) return Number(record.totalAmount) || 0;
                                return Number(b.tongTien || record.tongTien || 0);
                              }

                              // If HIỂN THỊ VAT is checked, retrieve or compute grand total with VAT:
                              if (b.vatSnapshot?.grandTotal !== undefined && b.vatSnapshot?.grandTotal !== null) return Number(b.vatSnapshot.grandTotal) || 0;
                              if (b.totalAmountWithVat !== undefined && b.totalAmountWithVat !== null) return Number(b.totalAmountWithVat) || 0;
                              if (b.totalWithTax !== undefined && b.totalWithTax !== null) return Number(b.totalWithTax) || 0;
                              if (record.vatSnapshot?.grandTotal !== undefined && record.vatSnapshot?.grandTotal !== null) return Number(record.vatSnapshot.grandTotal) || 0;
                              if (record.totalAmountWithVat !== undefined && record.totalAmountWithVat !== null) return Number(record.totalAmountWithVat) || 0;
                              if (record.totalWithTax !== undefined && record.totalWithTax !== null) return Number(record.totalWithTax) || 0;

                              const taxRate = Number(b.taxRate ?? record.taxRate ?? b.vatSnapshot?.vatPercent ?? 10);
                              if (calculatedSubtotal > 0) return Math.round(calculatedSubtotal * (1 + taxRate / 100));
                              return Number(b.tongTien || record.tongTien || 0);
                            })();

                            // Extract display text (exctract purpose detail/content or fallback to title)
                            const displayContent = record.mucDichSuDungNoiDung || record.title || "Phiếu trình vật tư";
                            
                            let displayLocation = record.mucDichSuDungDiaDiem || (record.bbntData && record.bbntData.address) || (record.bbntData && record.bbntData.location) || record.diaDiem || "";
                            if (displayLocation) {
                              const matches = Array.from(new Set((displayLocation.match(/\(([^)]+)\)/g) || []).map((s: string) => s.slice(1, -1))));
                              if (matches.length > 0) {
                                displayLocation = matches.join(" - ");
                              }
                            }

                            return (
                              <tr 
                                key={record.id ? `history-record-${record.id}-${idx}` : `history-idx-${idx}`} 
                                onClick={() => loadRecordData(record)}
                                className={`hover:bg-indigo-50/20 transition-colors cursor-pointer text-slate-705 text-xs border-b border-slate-100 group ${isChecked ? 'bg-indigo-50/40 font-medium' : ''}`}
                              >
                                {/* Checkbox Select */}
                                <td className="p-3 text-center border-r border-slate-100 bg-slate-50/20" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer align-middle"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setSelectedRecordIds(prev => 
                                        prev.includes(record.id) 
                                          ? prev.filter(id => id !== record.id) 
                                          : [...prev, record.id]
                                      );
                                    }}
                                  />
                                </td>

                                {/* STT */}
                                <td className="p-3 text-center font-mono text-slate-400 border-r border-slate-100 bg-slate-50/20">
                                  {idx + 1}
                                </td>

                                {/* Mã phiếu */}
                                <td className="p-3 text-center font-mono font-bold text-indigo-600 border-r border-slate-100 bg-indigo-50/10">
                                  {extractMaPhieu(record) || <span className="text-slate-400 font-normal italic">-</span>}
                                </td>

                                {/* Ngày tạo */}
                                <td className="p-3 text-center font-mono text-slate-500 border-r border-slate-100">
                                  {hienThiNgay(record.createdAt || record.updatedAt)}
                                </td>

                                {/* Ngày đề nghị */}
                                <td className="p-3 text-center font-mono font-semibold text-slate-900 border-r border-slate-100 bg-indigo-50/5">
                                  {getNgayDeNghi(record)}
                                </td>

                                {/* Nội dung/Tiêu đề */}
                                <td className="p-3 border-r border-slate-100 whitespace-normal max-w-md">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="font-bold text-slate-800 leading-normal group-hover:text-indigo-600 transition-colors line-clamp-2">
                                      {displayContent}
                                    </div>
                                    <div className="text-[11px] text-slate-500/80 italic font-medium leading-relaxed whitespace-normal break-words mt-0.5">
                                      {displayLocation || "Chưa xác định địa điểm"}
                                    </div>
                                  </div>
                                </td>

                                {/* Thành tiền */}
                                <td className="p-3 text-right font-black text-slate-800 border-r border-slate-100">
                                  {totalWithTax > 0 ? (
                                    <span>
                                      {totalWithTax.toLocaleString('vi-VN')} <span className="text-[9px] font-normal text-slate-400">đ</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-normal italic">N/A</span>
                                  )}
                                </td>

                                {/* Loại VT */}
                                <td className="p-3 text-center">
                                  <span 
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center justify-center gap-1 mx-auto max-w-fit border"
                                    style={{
                                      backgroundColor: mat ? `${mat.mauNen}15` : '#f1f5f9',
                                      borderColor: mat ? `${mat.mauNen}30` : '#e2e8f0',
                                      color: mat ? mat.mauNen : '#475569'
                                    }}
                                  >
                                    {mat ? (
                                      <>
                                        <span>{mat.icon || '📦'}</span>
                                        <span className="truncate max-w-[100px]">{mat.ten}</span>
                                      </>
                                    ) : (
                                      <span className="truncate max-w-[100px]">{record.loaiVatTu || 'N/A'}</span>
                                    )}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* Footer summary text */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Bảng dữ liệu theo biểu mẫu Excel • Đồng bộ tự động
            </div>
          </div>
        </div>
      )}

      {/* CONFIG MODAL */}
      {showCauHinhModal && (
        <CauHinhModal 
          onClose={() => setShowCauHinhModal(false)}
          setShowDeleteConfirm={setShowDeleteConfirm}
          onSave={async (newConfig) => {
            const activeLoai = (window as any)._loaiVatTuHienTai || 'BeTong';
            const result = await ConfigService.saveCauHinh(activeLoai, newConfig);
            if (result) {
              window._cauHinh = newConfig;

              const fixedComp = newConfig.pkg_tenBenGiao || newConfig.bbnt_benA_congTy || newConfig.bbnt_nhaCungCap || '';
              let parsedReps: any[] = [];
              if (newConfig.pkg_benGiao_ds) {
                try {
                  parsedReps = typeof newConfig.pkg_benGiao_ds === 'string' ? JSON.parse(newConfig.pkg_benGiao_ds) : newConfig.pkg_benGiao_ds;
                } catch(e) {}
              }
              if (!parsedReps.length && newConfig.pkg_benGiaoTen) {
                parsedReps = [{ name: newConfig.pkg_benGiaoTen, position: newConfig.pkg_benGiaoChucVu || '', salutation: 'Ông' }];
              }

              // Update MaterialTypeConfig as well
              const activeMatObj = danhSachVatTu.find(v => v.id === activeLoai);
              const activeMatName = activeMatObj?.ten || activeLoai;
              let currentMatConfig = (window as any)._currentMaterialConfig || GET_FALLBACK_MATERIAL_CONFIG(activeLoai, activeMatName);
              if (!currentMatConfig.bm032) currentMatConfig.bm032 = {};
              if (fixedComp) {
                currentMatConfig.bm032.senderCompany = fixedComp;
                currentMatConfig.bm032.bbnt_benA_congTy = fixedComp;
                currentMatConfig.bm032.nhaCungCap = fixedComp;
              }
              if (parsedReps.length > 0) {
                currentMatConfig.bm032.senderRepresentatives = parsedReps;
              }
              (window as any)._currentMaterialConfig = currentMatConfig;
              (window as any)._currentSenderCompany = fixedComp;
              await MaterialTypeService.saveMaterialTypeConfig(activeLoai, currentMatConfig);

              if (!currentRecordId) {
                setBbntData(prev => ({
                  ...prev,
                  senderCompany: fixedComp || prev.senderCompany,
                  bbnt_benA_congTy: fixedComp || prev.bbnt_benA_congTy,
                  bbnt_nhaCungCap: fixedComp || prev.bbnt_nhaCungCap,
                  senderList: parsedReps.length > 0 ? parsedReps : prev.senderList,
                  bbnt_benA_daiDien: parsedReps[0]?.name || prev.bbnt_benA_daiDien || ''
                }));
                setBm04Data(prev => ({
                  ...prev,
                  senderCompany: fixedComp || prev.senderCompany,
                  bbnt_benA_congTy: fixedComp || prev.bbnt_benA_congTy,
                  bbnt_nhaCungCap: fixedComp || prev.bbnt_nhaCungCap,
                  senderList: parsedReps.length > 0 ? parsedReps : prev.senderList,
                  bbnt_benA_daiDien: parsedReps[0]?.name || prev.bbnt_benA_daiDien || ''
                }));
                setBm02Data(prev => ({
                  ...prev,
                  proposingCompany: fixedComp || prev.proposingCompany
                }));
              }

              applyCauHinhToForms(newConfig);
              if (newConfig.bm02_kyTen_config) {
                try {
                  setKyTenBM02(safeParse(newConfig.bm02_kyTen_config));
                } catch (e) {}
              }
              setConfigTrigger(prev => prev + 1);
              setToast({ message: "Đã lưu cấu hình thành công!", type: 'success' });
              setShowCauHinhModal(false);

              // Cập nhật chữ ký ngay không cần reload
              const el = document.getElementById('phanChuKyBBNT')
                      || document.querySelector('[data-section="chuKyBBNT"]');
              if (el) {
                // Force re-render would be better in React, but following user request
              }
            }
          }}
          initialData={(() => {
            const matCfg = (window as any)._currentMaterialConfig;
            const fixedCompany = getFixedSenderCompany(matCfg, window._cauHinh);
            const fixedReps = getFixedSenderRepresentatives(matCfg, window._cauHinh);
            const baseCfg: any = window._cauHinh || {};
            const defCfg: CauHinh = {
              tieuDe: baseCfg.tieuDe || bm02Data.title || '',
              bm02_phongKeToan: baseCfg.bm02_phongKeToan || bm02Data.phongKeToan || '',
              bm02_nguoiLap: baseCfg.bm02_nguoiLap || bm02Data.nguoiLap || '',
              bm02_giamDoc: baseCfg.bm02_giamDoc || bm02Data.giamDoc || '',
              bm02_duyetHDTV: baseCfg.bm02_duyetHDTV || bm02Data.duyetHDTV || '',
              bbnt_kyTen_phongKeToan: baseCfg.bbnt_kyTen_phongKeToan || bbntData.bbnt_phongKeToan || '',
              bbnt_kyTen_nguoiLap: baseCfg.bbnt_kyTen_nguoiLap || bbntData.bbnt_nguoiLap || '',
              bbnt_kyTen_giamDoc: baseCfg.bbnt_kyTen_giamDoc || bbntData.bbnt_giamDoc || '',
              bbnt_kyTen_duyetHDTV: baseCfg.bbnt_kyTen_duyetHDTV || bbntData.bbnt_duyetHDTV || '',
              bbnt_benA_congTy: baseCfg.bbnt_benA_congTy || fixedCompany || bbntData.senderCompany || '',
              bbnt_benA_daiDien: baseCfg.bbnt_benA_daiDien || fixedReps[0]?.name || bbntData.senderList?.[0]?.name || '',
              bbnt_benB_congTy: baseCfg.bbnt_benB_congTy || bbntData.receiverCompany || '',
              bbnt_benB_daiDien: baseCfg.bbnt_benB_daiDien || bbntData.receiverList?.[0]?.name || '',
              pkg_tenBenGiao: baseCfg.pkg_tenBenGiao || fixedCompany || bbntData.senderCompany || '',
              pkg_tenBenNhan: baseCfg.pkg_tenBenNhan || bbntData.receiverCompany || '',
              pkg_benGiaoTen: baseCfg.pkg_benGiaoTen || fixedReps[0]?.name || bbntData.senderList?.[0]?.name || '',
              pkg_benGiaoChucVu: baseCfg.pkg_benGiaoChucVu || fixedReps[0]?.position || bbntData.senderList?.[0]?.position || '',
              pkg_benNhan1: baseCfg.pkg_benNhan1 || bbntData.receiverList?.[0]?.name || '',
              pkg_benNhan1ChucVu: baseCfg.pkg_benNhan1ChucVu || bbntData.receiverList?.[0]?.position || '',
              pkg_benNhan2: baseCfg.pkg_benNhan2 || bbntData.receiverList?.[1]?.name || '',
              pkg_benNhan2ChucVu: baseCfg.pkg_benNhan2ChucVu || bbntData.receiverList?.[1]?.position || '',
              bbnt_tenCongTrinh: baseCfg.bbnt_tenCongTrinh || bbntData.project || '',
              bbnt_nhaTauThiCong: baseCfg.bbnt_nhaTauThiCong || bbntData.receiverCompany || '',
              bbnt_nhaCungCap: baseCfg.bbnt_nhaCungCap || fixedCompany || bbntData.senderCompany || '',
              bbnt_soHDNT: baseCfg.bbnt_soHDNT || bbntData.soHDNT || '',
              bbnt_ngayKyHD: baseCfg.bbnt_ngayKyHD || bbntData.ngayKyHD || '',
              bbnt_maBM02: baseCfg.bbnt_maBM02 || bbntData.maBM02 || '',
              canCu_coDinh: baseCfg.canCu_coDinh || '',
              logo_base64: baseCfg.logo_base64 || '',
              bm02_kyTen_config: baseCfg.bm02_kyTen_config || JSON.stringify(KY_TEN_MAC_DINH),
              pkg_benGiao_ds: baseCfg.pkg_benGiao_ds || JSON.stringify(fixedReps.length > 0 ? fixedReps : bbntData.senderList || []),
              pkg_benNhan_ds: baseCfg.pkg_benNhan_ds || JSON.stringify(bbntData.receiverList || []),
              bm06_truongBoPhan: baseCfg.bm06_truongBoPhan || localStorage.getItem('bm06_dept_head') || 'Trần Thành Tài',
              bm06_thuKho: baseCfg.bm06_thuKho || localStorage.getItem('bm06_storekeeper') || 'Áp dụng đối với hoạt động thi công xây dựng',
              bm06_nguoiDeNghi: baseCfg.bm06_nguoiDeNghi || localStorage.getItem('bm06_proposer') || 'Trần Nam Anh'
            };
            return defCfg;
          })()}
        />
      )}
      {showMaterialContentConfig && (
        <MaterialContentConfigModal 
          onClose={() => setShowMaterialContentConfig(false)}
          currentUser={currentUser}
          danhSachVatTu={danhSachVatTu}
        />
      )}
      {showFirebaseModal && isAdmin(currentUser) && (
        <FirebaseModal onClose={function() { setShowFirebaseModal(false); }} currentUser={currentUser} setToast={setToast} />
      )}

      {/* Custom Save Prompt Modal (3-way choose) */}
      {savePromptModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-800">Dữ liệu chưa được lưu</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed bg-transparent border-0 p-0 text-left">
                  Hệ thống phát hiện bạn đang có dữ liệu biểu mẫu BM06 chưa lưu. Bạn có muốn lưu lại dữ liệu đang làm dở dang này không?
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={async () => {
                  setSavePromptModal(prev => ({ ...prev, isOpen: false }));
                  await savePromptModal.onConfirmSave();
                }}
                className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer text-center"
              >
                CÓ, LƯU LẠI
              </button>
              <button
                onClick={async () => {
                  setSavePromptModal(prev => ({ ...prev, isOpen: false }));
                  await savePromptModal.onConfirmDiscard();
                }}
                className="flex-1 py-2.5 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-xs font-bold rounded-lg transition-all cursor-pointer text-center"
              >
                KHÔNG LƯU
              </button>
              <button
                onClick={() => setSavePromptModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer text-center"
              >
                HỦY BỎ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BM02 Unit Price Save Confirmation Modal (DIALOG CẢNH BÁO) */}
      {showSavePriceConfirmModal && savePriceConfirmList.length > 0 && (
        <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 text-slate-800">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <header className="p-5 bg-amber-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2.5 rounded-2xl backdrop-blur-sm">
                  <AlertTriangle size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base leading-snug tracking-wide">
                    CẢNH BÁO THAY ĐỔI ĐƠN GIÁ
                  </h3>
                  <p className="text-[11px] text-amber-100 font-bold">
                    Đơn giá BM02 khác với Đơn giá trong Danh mục quản lý vật tư ({savePriceConfirmList.length} vật tư)
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleCancelPriceConfirm}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-all"
                title="Hủy bỏ và khôi phục đơn giá cũ"
              >
                <X size={20} />
              </button>
            </header>

            <div className="p-6 space-y-4">
              {/* Item changes list preview */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 max-h-52 overflow-y-auto space-y-2">
                {savePriceConfirmList.map((item, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-slate-900 truncate max-w-[220px]" title={item.itemName}>
                        {item.itemName}
                      </span>
                      {item.itemCode && (
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          Mã: {item.itemCode}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold pt-1.5 border-t border-slate-100">
                      <div className="text-slate-500 text-[11px]">
                        Đơn giá cũ: <span className="line-through text-slate-400 font-mono">{item.oldPrice.toLocaleString('vi-VN')} đ</span>
                      </div>
                      <div className="text-amber-600 text-[11px] font-black">
                        Đơn giá mới: <span className="font-mono text-red-600">{item.newPrice.toLocaleString('vi-VN')} đ</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                  Vui lòng chọn hướng xử lý:
                </label>
                <div className="space-y-2.5">
                  <label className="flex items-start gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-white transition-colors border border-transparent hover:border-slate-200">
                    <input 
                      type="radio" 
                      name="savePriceOption"
                      checked={savePriceOption === 'CURRENT_ONLY'}
                      onChange={() => setSavePriceOption('CURRENT_ONLY')}
                      className="w-4 h-4 text-amber-600 focus:ring-amber-500 cursor-pointer mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        ○ Chỉ áp dụng cho phiếu BM02 này
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Lưu đơn giá trên BM02 hiện tại, giữ nguyên Danh mục quản lý vật tư.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-2.5 rounded-xl bg-amber-50/70 hover:bg-amber-50 border border-amber-200 transition-colors">
                    <input 
                      type="radio" 
                      name="savePriceOption"
                      checked={savePriceOption === 'MASTER_CATALOG'}
                      onChange={() => setSavePriceOption('MASTER_CATALOG')}
                      className="w-4 h-4 text-amber-600 focus:ring-amber-500 cursor-pointer mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-black text-amber-950 block">
                        ○ Đồng ý cập nhật Danh mục quản lý vật tư
                      </span>
                      <span className="text-[10px] text-amber-800 block font-medium">
                        Cập nhật đơn giá gốc trong Danh mục vật tư và tự động ghi Nhật ký thay đổi (Log).
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <footer className="p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelPriceConfirm}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                HỦY BỎ
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (savePriceOption === 'MASTER_CATALOG') {
                    try {
                      await BM02PriceUpdateService.updateMaterialMaster(savePriceConfirmList);
                      await BM02PriceUpdateService.refreshMaterialCache({
                        loadMaterialPrices: async () => {
                          if (typeof loadMaterialPrices === 'function') {
                            await loadMaterialPrices();
                          }
                        }
                      });
                      await BM02PriceUpdateService.writePriceChangeLog(savePriceConfirmList, {
                        currentUser,
                        projectId: bm02Data.projectId,
                        projectName: bm02Data.project_name,
                        unitId: bm02Data.unitId,
                        docId: bm02Data.docNumber || 'BM02'
                      });
                      try {
                        await AuditLogService.log(
                          currentUser?.username || 'khách',
                          currentUser?.role || 'viewer',
                          'UPDATE',
                          'Cấu hình',
                          `Cập nhật đơn giá ${savePriceConfirmList.map(i => i.itemName).join(', ')} từ BM02 vào Danh mục quản lý vật tư`,
                          savePriceConfirmList.map(i => i.itemId).join(', '),
                          null,
                          savePriceConfirmList
                        );
                      } catch (logErr) {
                        console.warn("Lỗi ghi log activity đơn giá:", logErr);
                      }
                      setBm02Data(prev => ({
                        ...prev,
                        items: (prev.items || []).map(it => {
                          const matched = savePriceConfirmList.find(c => c.rowId === it.id || c.itemName.trim().toLowerCase() === it.name?.trim().toLowerCase());
                          if (matched) {
                            return {
                              ...it,
                              isCustomPrice: false,
                              _lastConfirmedUnitPrice: Number(it.unitPrice)
                            };
                          }
                          return it;
                        })
                      }));
                      setToast({ message: "Đã cập nhật đơn giá mới vào Danh mục quản lý vật tư và ghi Log!", type: "success" });
                    } catch (err: any) {
                      console.error("Lỗi cập nhật danh mục chính:", err);
                    }
                  } else {
                    setBm02Data(prev => ({
                      ...prev,
                      items: (prev.items || []).map(it => {
                        const matched = savePriceConfirmList.find(c => c.rowId === it.id || c.itemName.trim().toLowerCase() === it.name?.trim().toLowerCase());
                        if (matched) {
                          return {
                            ...it,
                            isCustomPrice: true,
                            _lastConfirmedUnitPrice: Number(it.unitPrice)
                          };
                        }
                        return it;
                      })
                    }));
                    setToast({ message: "Đã áp dụng đơn giá cho phiếu BM02 hiện tại", type: "info" });
                  }

                  setShowSavePriceConfirmModal(false);
                  if (pendingSaveAction) {
                    const action = pendingSaveAction;
                    setPendingSaveAction(null);
                    await action();
                  }
                }}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-amber-200 cursor-pointer active:scale-95"
              >
                ĐỒNG Ý
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* CẢNH BÁO TRÙNG MÃ PHIẾU MODAL */}
      {showDuplicateCodeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600 shrink-0 border border-amber-200">
                <AlertCircle size={24} />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-extrabold text-slate-800">Cảnh báo trùng Mã phiếu</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Mã phiếu <strong className="text-slate-900 font-mono bg-slate-100 px-1.5 py-0.5 rounded border">{bm02Data.maPhieu}</strong> này đã tồn tại ở một Snapshot khác trong hệ thống.
                </p>
                <p className="text-xs text-slate-500 italic mt-1">
                  Vui lòng kiểm tra lại để tránh ghi đè dữ liệu hoặc xác nhận nếu thực sự cần sử dụng lại mã này.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowDuplicateCodeModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all uppercase tracking-wider cursor-pointer"
              >
                Quay lại sửa mã
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowDuplicateCodeModal(false);
                  await saveUnifiedSnapshot(false, true); // force save
                }}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-rose-200 cursor-pointer active:scale-95"
              >
                Vẫn lưu dữ liệu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CauHinhModal({ onClose, onSave, initialData, setShowDeleteConfirm }: { onClose: () => void, onSave: (data: CauHinh) => Promise<void>, initialData: CauHinh, setShowDeleteConfirm: any }) {
  const [config, setConfig] = useState<CauHinh>(initialData);

  const [kyTenList, setKyTenList] = useState<any[]>(() => {
    if (initialData.bm02_kyTen_config) {
      try {
        return safeParse(initialData.bm02_kyTen_config).sort((a: any, b: any) => a.viTri - b.viTri);
      } catch (e) {
        return KY_TEN_MAC_DINH;
      }
    }
    return KY_TEN_MAC_DINH;
  });

  const [benGiaoList, setBenGiaoList] = useState<any[]>(() => {
    let ds = [];
    if (initialData.pkg_benGiao_ds) {
      try { ds = safeParse(initialData.pkg_benGiao_ds); } catch(e) {}
    }
    if (!ds.length && initialData.pkg_benGiaoTen) {
      ds = [{ id: 'bg_legacy', name: initialData.pkg_benGiaoTen, position: initialData.pkg_benGiaoChucVu || '', salutation: 'Ông' }];
    }
    return ds.length ? ds : [{ id: `bg_${Date.now()}`, name: '', position: '', salutation: 'Ông' }];
  });

  const [benNhanList, setBenNhanList] = useState<any[]>(() => {
    let ds = [];
    if (initialData.pkg_benNhan_ds) {
      try { ds = safeParse(initialData.pkg_benNhan_ds); } catch(e) {}
    }
    if (!ds.length) {
      if (initialData.pkg_benNhan1) ds.push({ id: 'bn_1', name: initialData.pkg_benNhan1, position: initialData.pkg_benNhan1ChucVu || '', salutation: 'Ông' });
      if (initialData.pkg_benNhan2) ds.push({ id: 'bn_2', name: initialData.pkg_benNhan2, position: initialData.pkg_benNhan2ChucVu || '', salutation: 'Ông' });
    }
    return ds.length ? ds : [{ id: `bn_${Date.now()}`, name: '', position: '', salutation: 'Ông' }];
  });

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleAddKyTen = () => {
    const newId = `kt_${Date.now()}`;
    const newItem = { id: newId, chucDanh: "", hoTen: "", viTri: kyTenList.length };
    setKyTenList([...kyTenList, newItem]);
  };

  const handleRemoveKyTen = (id: string) => {
    if (kyTenList.length <= 1) {
        window.alert('Phải giữ ít nhất 1 ô ký tên');
        return;
    }
    console.log("handleRemoveKyTen triggered for id:", id);
    setShowDeleteConfirm({
        show: true,
        id: null,
        deleteFn: () => {
            console.log("Executing deleteFn for KyTen id:", id);
            const newList = kyTenList.filter(it => it.id !== id).map((it, idx) => ({ ...it, viTri: idx }));
            setKyTenList(newList);
        }
    });
  };

  const handleUpdateKyTen = (id: string, field: string, value: string) => {
    const newList = kyTenList.map(it => {
      if (it.id === id) {
        return { ...it, [field]: field === 'hoTen' ? value.toUpperCase() : value };
      }
      return it;
    });
    setKyTenList(newList);
  };

  const handleAddBenGiao = () => {
    setBenGiaoList([...benGiaoList, { id: `bg_${Date.now()}`, name: '', position: '', salutation: 'Ông' }]);
  };
  const handleRemoveBenGiao = (id: string) => {
    console.log("handleRemoveBenGiao triggered for id:", id);
    setShowDeleteConfirm({
        show: true,
        id: null,
        deleteFn: () => {
            console.log("Executing deleteFn for BenGiao id:", id);
            setBenGiaoList(prev => prev.filter(it => it.id !== id));
        }
    });
  };
  const handleUpdateBenGiao = (id: string, field: string, value: string) => {
    setBenGiaoList(benGiaoList.map(it => it.id === id ? { ...it, [field]: value } : it));
  };

  const handleAddBenNhan = () => {
    setBenNhanList([...benNhanList, { id: `bn_${Date.now()}`, name: '', position: '', salutation: 'Ông' }]);
  };
  const handleRemoveBenNhan = (id: string) => {
    console.log("handleRemoveBenNhan triggered for id:", id);
    setShowDeleteConfirm({
        show: true,
        id: null,
        deleteFn: () => {
            console.log("Executing deleteFn for BenNhan id:", id);
            setBenNhanList(prev => prev.filter(it => it.id !== id));
        }
    });
  };
  const handleUpdateBenNhan = (id: string, field: string, value: string) => {
    setBenNhanList(benNhanList.map(it => it.id === id ? { ...it, [field]: value } : it));
  };

  const onDragStart = (idx: number) => setDraggedIdx(idx);
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const onDrop = (idx: number) => {
    if (draggedIdx === null) return;
    const newList = [...kyTenList];
    const item = newList.splice(draggedIdx, 1)[0];
    newList.splice(idx, 0, item);
    const updated = newList.map((it, i) => ({ ...it, viTri: i }));
    setKyTenList(updated);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleChange = (key: keyof CauHinh, value: string) => {
    let finalValue = value;
    const keyStr = String(key);
    if (keyStr.includes('phongKeToan') || keyStr.includes('nguoiLap') || keyStr.includes('giamDoc') || keyStr.includes('duyetHDTV') || keyStr.includes('tenBenGiao') || keyStr.includes('tenBenNhan') || keyStr.includes('benA') || keyStr.includes('benB')) {
      finalValue = value.toUpperCase();
    }
    setConfig(prev => ({ ...prev, [key]: finalValue }));
  };

  const handleLogoUploadInModal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('❌ Chỉ hỗ trợ file PNG, JPG, SVG, WEBP');
      return;
    }
    if (file.size > 500 * 1024) {
      alert('❌ File quá lớn. Vui lòng chọn file dưới 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setConfig(prev => ({ ...prev, logo_base64: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogoInModal = () => {
    if (window.confirm('Xóa logo hiện tại?')) {
      setConfig(prev => ({ ...prev, logo_base64: '' }));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Cấu hình nội dung cố định</h2>
              <p className="text-xs text-slate-500 font-medium">Lưu trữ các thông tin dùng chung cho biểu mẫu</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2 uppercase text-xs tracking-wider">LOGO CÔNG TY</h3>
            <div className="flex flex-col items-center gap-4 p-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                {config.logo_base64 ? (
                  <img src={config.logo_base64} alt="Logo preview" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-4xl text-slate-300">🖼️</div>
                )}
              </div>
              <div className="flex gap-3">
                <label className="cursor-pointer px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all text-xs font-bold flex items-center gap-2 border border-blue-200">
                  <Upload size={14} />
                  Chọn file logo
                  <input type="file" className="hidden" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUploadInModal} />
                </label>
                {config.logo_base64 && (
                  <button onClick={handleRemoveLogoInModal} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-xs font-bold flex items-center gap-2 border border-red-200">
                    <Trash2 size={14} />
                    Xóa logo
                  </button>
                )}
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500">💡 Hỗ trợ: PNG, JPG, SVG — khuyến nghị nền trắng/trong suốt</p>
                <p className="text-[10px] text-slate-500">Kích thước tối đa: 500KB</p>
              </div>

              <div className="w-full text-left space-y-1 mt-2 border-t pt-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Vị trí Logo trên biểu mẫu</label>
                <select 
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  value={config.logo_position || 'left'}
                  onChange={(e) => handleChange('logo_position', e.target.value)}
                >
                  <option value="left">Căn lề Trái (Mặc định)</option>
                  <option value="center">Căn lề Giữa</option>
                  <option value="right">Căn lề Phải</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2 uppercase text-xs tracking-wider">CĂN CỨ (NỘI DUNG CỐ ĐỊNH)</h3>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Mỗi dòng căn cứ cố định — nhấn Enter để xuống dòng mới</label>
              <textarea 
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]" 
                value={config.canCu_coDinh || ''} 
                onChange={(e) => handleChange('canCu_coDinh', e.target.value)}
                placeholder="- Căn cứ Báo giá của Công ty CP KD và PT Bình Dương - Xí Nghiệp Bê Tông Trộn Sẵn Mỹ Phước"
              />
              <p className="text-[10px] text-slate-400 italic">"Dòng '- Căn cứ Phiếu đề nghị...' sẽ tự động lấy từ nội dung file upload, không cần nhập ở đây."</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2 uppercase text-xs tracking-wider">THÔNG TIN KÝ TÊN — ĐN CCVT (BM02)</h3>
            <div className="grid grid-cols-3 gap-4">
              {[...kyTenList].sort(function(a, b) { return (a.viTri || 0) - (b.viTri || 0); }).map(function(item, idx) {
                return (
                  <div 
                    key={item.id || idx}
                    draggable="true"
                    onDragStart={function(e) {
                      setDraggedIdx(idx);
                      e.currentTarget.style.opacity = '0.5';
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={function(e) {
                      e.currentTarget.style.opacity = '1';
                      setDraggedIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragOver={function(e) {
                      e.preventDefault();
                      if (draggedIdx !== null && draggedIdx !== idx) {
                        setDragOverIdx(idx);
                      }
                    }}
                    onDrop={function(e) {
                      e.preventDefault();
                      if (draggedIdx === null || draggedIdx === idx) return;
                      
                      var ds = [...kyTenList];
                      var temp = ds[draggedIdx];
                      ds[draggedIdx] = ds[idx];
                      ds[idx] = temp;
                      
                      var updated = ds.map(function(it, i) {
                        return { ...it, viTri: i };
                      });
                      setKyTenList(updated);
                    }}
                    className={"relative p-4 border-2 rounded-xl transition-all group " + (
                      draggedIdx === idx ? 'opacity-50 border-blue-400 bg-blue-50' : 
                      dragOverIdx === idx ? 'border-dashed border-blue-500 bg-blue-50' : 
                      'border-slate-100 bg-white hover:border-blue-200'
                    )}
                    style={dragOverIdx === idx ? { border: '2px dashed #1e88e5', boxShadow: '0 0 8px rgba(30,136,229,0.3)' } : {}}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div 
                        className="cursor-grab text-slate-400 hover:text-blue-500 transition-colors"
                        title="Kéo để đổi vị trí"
                        style={{ userSelect: 'none' }}
                      >
                        ⠿
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleRemoveKyTen(item.id)}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                        style={{
                          width: '28px', height: '28px', borderRadius: '6px',
                          background: '#ffebee', border: '1px solid #ef9a9a', color: '#c62828',
                          fontSize: '14px'
                        }}
                        title="Xóa ô ký tên này"
                      >
                        🗑
                      </button>
                    </div>
                    <div className="space-y-3">
                      <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] focus:ring-2 focus:ring-blue-500 outline-none font-medium" value={item.chucDanh} onChange={function(e) { handleUpdateKyTen(item.id, 'chucDanh', e.target.value); }} placeholder="Nhập chức danh..." />
                      <div className="h-12 border-y border-dashed border-slate-100 flex items-center justify-center"><span className="text-[10px] text-slate-300 italic">Khoảng trống ký tên</span></div>
                      <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-700" value={item.hoTen} onChange={function(e) { handleUpdateKyTen(item.id, 'hoTen', e.target.value); }} placeholder="Nhập họ tên..." />
                    </div>
                  </div>
                );
              })}
              <button onClick={handleAddKyTen} className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-slate-400 hover:text-blue-600 min-h-[160px]">
                <Plus size={24} /><span className="text-xs font-bold uppercase tracking-wider">Thêm chữ ký</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2 uppercase text-xs tracking-wider">THÔNG TIN KÝ TÊN — BBNT (BM03.2)</h3>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                <h4 className="font-bold text-center text-slate-700">BÊN A</h4>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Công ty:</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_benA_congTy || ''} onChange={(e) => handleChange('bbnt_benA_congTy', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Đại diện:</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_benA_daiDien || ''} onChange={(e) => handleChange('bbnt_benA_daiDien', e.target.value)} />
                </div>
              </div>
              <div className="space-y-3">
                <h4 className="font-bold text-center text-slate-700">BÊN B</h4>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Công ty:</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_benB_congTy || ''} onChange={(e) => handleChange('bbnt_benB_congTy', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Đại diện:</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_benB_daiDien || ''} onChange={(e) => handleChange('bbnt_benB_daiDien', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2 uppercase text-xs tracking-wider">Bên giao (Cung cấp)</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tên công ty bên giao (nội dung cố định)</label>
                <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.pkg_tenBenGiao || ''} onChange={(e) => handleChange('pkg_tenBenGiao', e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Danh sách đại diện bên giao</label>
                {benGiaoList.map((item, idx) => (
                  <div key={item.id || idx} className="flex gap-2 items-start bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" value={item.name} onChange={(e) => handleUpdateBenGiao(item.id, 'name', e.target.value)} placeholder="Họ tên..." />
                      <input className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" value={item.position} onChange={(e) => handleUpdateBenGiao(item.id, 'position', e.target.value)} placeholder="Chức vụ..." />
                    </div>
                    <button onClick={() => {
                        console.log("Removing Item ID:", item.id);
                        handleRemoveBenGiao(item.id);
                    }} className="p-2 text-slate-300 hover:text-red-500 transition-colors pointer-events-auto"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={handleAddBenGiao} className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-1">
                  <Plus size={14} /> THÊM NGƯỜI BÊN GIAO
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2 uppercase text-xs tracking-wider">Bên nhận (Nghiệm thu)</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tên công ty bên nhận (nội dung cố định)</label>
                <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.pkg_tenBenNhan || ''} onChange={(e) => handleChange('pkg_tenBenNhan', e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Danh sách đại diện bên nhận</label>
                {benNhanList.map((item, idx) => (
                  <div key={item.id || idx} className="flex gap-2 items-start bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" value={item.name} onChange={(e) => handleUpdateBenNhan(item.id, 'name', e.target.value)} placeholder="Họ tên..." />
                      <input className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" value={item.position} onChange={(e) => handleUpdateBenNhan(item.id, 'position', e.target.value)} placeholder="Chức vụ..." />
                    </div>
                    <button onClick={() => {
                        console.log("Removing BenNhan ID:", item.id);
                        handleRemoveBenNhan(item.id);
                    }} className="p-2 text-slate-300 hover:text-red-500 transition-colors pointer-events-auto"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={handleAddBenNhan} className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-1">
                  <Plus size={14} /> THÊM NGƯỜI BÊN NHẬN
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2 uppercase text-xs tracking-wider">Thông tin BBNT (BM03.2)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tên công trình</label>
                <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_tenCongTrinh || ''} onChange={(e) => handleChange('bbnt_tenCongTrinh', e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Nhà thầu thi công</label>
                <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_nhaTauThiCong || ''} onChange={(e) => handleChange('bbnt_nhaTauThiCong', e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Nhà cung cấp</label>
                <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_nhaCungCap || ''} onChange={(e) => handleChange('bbnt_nhaCungCap', e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Số HĐNT</label>
                <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_soHDNT || ''} onChange={(e) => handleChange('bbnt_soHDNT', e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày ký HĐ</label>
                <div className="relative">
                  <input 
                    type="date" 
                    id="cfg_ngayKyHD_raw"
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                    onChange={(e) => {
                      if (e.target.value) {
                        var p = e.target.value.split('-');
                        handleChange('bbnt_ngayKyHD', p[2] + '/' + p[1] + '/' + p[0]);
                      }
                    }}
                  />
                  <input 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                    value={chuanHoaNgay(config.bbnt_ngayKyHD || '')} 
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    autoComplete="off"
                    onChange={(e) => {
                      var v = e.target.value.replace(/[^\d\/]/g, '');
                      if (v.length === 2 && e.target.value.slice(-1) !== '/') v += '/';
                      if (v.length === 5 && e.target.value.slice(-1) !== '/') v += '/';
                      handleChange('bbnt_ngayKyHD', v);
                    }}
                    onBlur={(e) => {
                      handleChange('bbnt_ngayKyHD', chuanHoaNgay(e.target.value));
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => document.getElementById('cfg_ngayKyHD_raw')?.click()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500"
                  >
                    📅
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Mã BM02</label>
                <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={config.bbnt_maBM02 || ''} onChange={(e) => handleChange('bbnt_maBM02', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2 uppercase text-xs tracking-wider">Ký Tên BM06</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Trưởng bộ phận</label>
                <input 
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nhập tên Trưởng bộ phận..."
                  value={config.bm06_truongBoPhan || ''}
                  onChange={(e) => handleChange('bm06_truongBoPhan', e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Xác nhận của Thủ kho</label>
                <input 
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nhập tên Thủ kho..."
                  value={config.bm06_thuKho || ''}
                  onChange={(e) => handleChange('bm06_thuKho', e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Người đề nghị</label>
                <input 
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nhập tên Người đề nghị..."
                  value={config.bm06_nguoiDeNghi || ''}
                  onChange={(e) => handleChange('bm06_nguoiDeNghi', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-all text-sm font-bold">Hủy</button>
          <button onClick={() => onSave({ 
            ...config, 
            bm02_kyTen_config: JSON.stringify(kyTenList),
            pkg_benGiao_ds: JSON.stringify(benGiaoList),
            pkg_benNhan_ds: JSON.stringify(benNhanList),
            pkg_benGiaoTen: benGiaoList[0]?.name || '',
            pkg_benGiaoChucVu: benGiaoList[0]?.position || '',
            pkg_benNhan1: benNhanList[0]?.name || '',
            pkg_benNhan1ChucVu: benNhanList[0]?.position || '',
            pkg_benNhan2: benNhanList[1]?.name || '',
            pkg_benNhan2ChucVu: benNhanList[1]?.position || ''
          })} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-bold shadow-md">Lưu cấu hình</button>
        </div>
      </div>
    </div>
  );
}

// ================================================
// COMPONENT FIREBASE MODAL (6 BƯỚC + QUẢN TRỊ DỮ LIỆU)
// ================================================
function FirebaseModal({ onClose, currentUser, setToast }: { onClose: () => void, currentUser: any, setToast: any }) {
  var [modalMode, setModalMode] = useState<'setup' | 'admin'>('setup');
  var [adminStatus, setAdminStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  var [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  var [confirmText, setConfirmText] = useState('');
  
  var [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void | Promise<void>;
    confirmText?: string;
    cancelText?: string;
    confirmBtnClass?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  var [cloudBackups, setCloudBackups] = useState<any[]>([]);
  var [selectedBackupIds, setSelectedBackupIds] = useState<string[]>([]);
  var [loadingBackups, setLoadingBackups] = useState(false);
  var [backupNote, setBackupNote] = useState('Sao lưu hệ thống');
  
  var [schedEnabled, setSchedEnabled] = useState(true);
  var [schedType, setSchedType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  var [schedTime, setSchedTime] = useState('12:00');
  var [schedKeepLast, setSchedKeepLast] = useState(10);
  var [schedLastRun, setSchedLastRun] = useState<number | null>(null);
  var [schedNextRun, setSchedNextRun] = useState<number | null>(null);
  var [schedStatus, setSchedStatus] = useState<'active' | 'inactive' | 'waiting_connection'>('active');
  var [savingSchedule, setSavingSchedule] = useState(false);

  var [buoc, setBuoc] = useState(1);
  var [testResult, setTestResult] = useState<any>(null);
  var [rawConfig, setRawConfig] = useState('');
  var [errorMsg, setErrorMsg] = useState('');
  
  var [config, setConfig] = useState({
    apiKey: '',
    databaseURL: '',
    projectId: '',
    appId: '',
    authDomain: '',
    messagingSenderId: '',
    storageBucket: '',
    databaseId: '(default)'
  });

  useEffect(() => {
    // Load local config on open
    try {
      const saved = localStorage.getItem('firebase_config');
      if (saved) {
        setConfig(JSON.parse(saved));
      }
    } catch (e) {}

    // Load last backup time from local registry
    const localBackup = localStorage.getItem('latest_firebase_backup');
    if (localBackup) {
      try {
        const parsed = JSON.parse(localBackup);
        if (parsed && parsed.timestamp) {
          setLastBackupTime(new Date(parsed.timestamp).toLocaleString('vi-VN'));
        }
      } catch (e) {}
    }
  }, []);

  var [restoreProgress, setRestoreProgress] = useState<number | null>(null);
  var [completedPayload, setCompletedPayload] = useState<any | null>(null);
  var [showRestoreSuccess, setShowRestoreSuccess] = useState(false);

  const runRestoreWithProgress = async (restoreFn: () => Promise<any>, description: string) => {
    setRestoreProgress(1);
    setCompletedPayload(null);
    setShowRestoreSuccess(false);
    setAdminStatus({ type: 'loading', message: `Đang chuẩn bị khôi phục dữ liệu: ${description}...` });

    var progressInterval = setInterval(() => {
      setRestoreProgress((prev) => {
        if (prev === null) return null;
        if (prev < 35) {
          return prev + Math.floor(Math.random() * 6) + 4;
        } else if (prev < 85) {
          return prev + Math.floor(Math.random() * 3) + 1;
        } else if (prev < 97) {
          return prev + 1;
        }
        return prev;
      });
    }, 120);

    try {
      var payload = await restoreFn();
      clearInterval(progressInterval);
      
      setRestoreProgress(98);
      await new Promise(resolve => setTimeout(resolve, 150));
      setRestoreProgress(99);
      await new Promise(resolve => setTimeout(resolve, 150));
      setRestoreProgress(100);
      await new Promise(resolve => setTimeout(resolve, 250));

      setCompletedPayload(payload);
      setShowRestoreSuccess(true);
      setRestoreProgress(null);
      setAdminStatus({ type: 'success', message: 'Hệ thống đã khôi phục dữ liệu thành công!' });
    } catch (err: any) {
      clearInterval(progressInterval);
      setRestoreProgress(null);
      setAdminStatus({ type: 'error', message: `Khôi phục thất bại: ${err.message || String(err)}` });
    }
  };

  const taiScheduleConfig = async () => {
    try {
      const cfg = await fetchBackupScheduleConfig();
      if (cfg) {
        setSchedEnabled(cfg.enabled);
        setSchedType(cfg.scheduleType as any);
        setSchedTime(cfg.backupTime);
        setSchedKeepLast(cfg.keepLast);
        setSchedLastRun(cfg.lastRunAt);
        setSchedNextRun(cfg.nextRunAt);
        setSchedStatus(cfg.status as any);
      }
    } catch (e) {
      console.error("Lỗi khi tải cấu hình lịch sao lưu:", e);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const nextRun = calculateNextRunAt(schedType, schedTime);
      const configObj = {
        enabled: schedEnabled,
        scheduleType: schedType,
        backupTime: schedTime,
        keepLast: Number(schedKeepLast) || 10,
        lastRunAt: schedLastRun,
        nextRunAt: nextRun,
        status: schedEnabled ? (navigator.onLine ? 'active' : 'waiting_connection') : 'inactive'
      };

      const success = await saveBackupScheduleConfig(configObj);
      if (success) {
        await enforceCloudBackupRetention(configObj.keepLast);
        await taiDanhSachSaoLuu();
        setSchedNextRun(nextRun);
        setSchedStatus(configObj.status as any);
        setToast({ message: 'Cập nhật lịch sao lưu và giới hạn lưu trữ thành công!', type: 'success' });
      } else {
        setToast({ message: 'Cập nhật lịch sao lưu thất bại.', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: `Lỗi: ${err.message || String(err)}`, type: 'error' });
    } finally {
      setSavingSchedule(false);
    }
  };

  const taiDanhSachSaoLuu = async () => {
    if (!BackupService.isDBAvailable()) {
      setCloudBackups([]);
      setSelectedBackupIds([]);
      return;
    }
    setLoadingBackups(true);
    try {
      let list = await listBackups();

      // Kiểm tra và tự động dọn dẹp xoay vòng nếu số lượng trên Cloud đang vượt quá cấu hình
      try {
        const cfg = await fetchBackupScheduleConfig();
        const limit = Number(cfg?.keepLast) || Number(schedKeepLast) || 10;
        if (list.length > limit) {
          console.log(`[Backup Check] Số lượng bản sao lưu (${list.length}) vượt quá giới hạn (${limit}). Đang tự động dọn dẹp...`);
          await enforceCloudBackupRetention(limit);
          list = await listBackups();
        }
      } catch (cleanErr) {
        console.warn("Lỗi tự động dọn dẹp bản backup cũ:", cleanErr);
      }

      setCloudBackups(list);
      setSelectedBackupIds(prev => prev.filter(id => list.some((b: any) => b.backupId === id)));
      if (list && list.length > 0) {
        const firstTime = (list[0] as any).createdAt || (list[0] as any).timestamp;
        setLastBackupTime(new Date(firstTime).toLocaleString('vi-VN'));
      }
      await taiScheduleConfig();
    } catch (e) {
      console.error('Lỗi khi tải danh sách sao lưu từ Cloud:', e);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (modalMode === 'admin') {
      taiDanhSachSaoLuu();
    }
  }, [modalMode]);

  function parseFirebaseConfig(rawText) {
    if (!rawText || rawText.trim() === '') return null;
    var text = rawText.trim();
    var start = text.indexOf('{');
    var end   = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    var jsonStr = text.substring(start, end + 1);
    jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    jsonStr = jsonStr.replace(/,\s*}/g, '}');
    jsonStr = jsonStr.replace(/,\s*]/g, ']');
    try {
      var parsed = JSON.parse(jsonStr);
      if (!parsed.apiKey || !parsed.projectId) return null;
      return parsed;
    } catch(e) {
      return null;
    }
  }

  function handleAutoParse() {
    var parsed = parseFirebaseConfig(rawConfig);
    if (parsed) {
      setConfig({
        apiKey: parsed.apiKey || '',
        databaseURL: parsed.databaseURL || '',
        projectId: parsed.projectId || '',
        appId: parsed.appId || '',
        authDomain: parsed.authDomain || '',
        messagingSenderId: parsed.messagingSenderId || '',
        storageBucket: parsed.storageBucket || '',
        databaseId: parsed.databaseId || parsed.firestoreDatabaseId || '(default)'
      });
      setErrorMsg('');
      setBuoc(5);
    } else {
      setErrorMsg('Không nhận dạng được firebaseConfig. Kiểm tra lại nội dung dán vào.');
    }
  }

  function kiemTraKetNoi() {
    var btnKiem   = document.getElementById('btnKiemTraKetNoi');
    var btnLuu    = document.getElementById('btnLuuHoanTat');
    var divKetQua = document.getElementById('divKetQuaKetNoi');

    if (btnKiem) {
      (btnKiem as HTMLButtonElement).disabled    = true;
      (btnKiem as HTMLButtonElement).textContent = '⏳ Đang kiểm tra...';
    }
    if (divKetQua) divKetQua.innerHTML = '';
    if (window.capNhatBadgeFirebase) window.capNhatBadgeFirebase('connecting');

    var apiKey            = config.apiKey            || '';
    var databaseURL       = config.databaseURL       || '';
    var projectId         = config.projectId         || '';
    var appId             = config.appId             || '';
    var authDomain        = config.authDomain        || '';
    var messagingSenderId = config.messagingSenderId || '';
    var storageBucket     = config.storageBucket     || '';

    if (!apiKey || !projectId) {
      hienLoi('Thiếu API KEY hoặc PROJECT ID.', [
        'Kiểm tra lại các trường bắt buộc (có dấu *)',
        'Đảm bảo bạn đã copy đúng firebaseConfig từ Firebase Console'
      ], btnKiem, btnLuu);
      return;
    }

    var urlSach = databaseURL.trim();
    if (!urlSach) {
      hienLoi('Thiếu DATABASE URL.', [
        'Vào Firebase Console → Realtime Database → copy URL từ trang chủ',
        'URL có dạng: https://[project-id]-default-rtdb.firebaseio.com'
      ], btnKiem, btnLuu);
      return;
    }
    if (urlSach.slice(-1) === '/') urlSach = urlSach.slice(0, -1);

    if (urlSach.indexOf('https://') !== 0) {
      hienLoi('DATABASE URL phải bắt đầu bằng https://.', [
        'Ví dụ đúng: https://my-project-default-rtdb.firebaseio.com'
      ], btnKiem, btnLuu);
      return;
    }

    if (apiKey.indexOf('AIza') !== 0 || apiKey.length < 35) {
      hienLoi('API KEY không đúng định dạng.', [
        'API Key phải bắt đầu bằng "AIza" và có ít nhất 35 ký tự'
      ], btnKiem, btnLuu);
      return;
    }

    var configObj = {
      apiKey: apiKey, databaseURL: urlSach,
      projectId: projectId, appId: appId,
      authDomain: authDomain,
      messagingSenderId: messagingSenderId,
      storageBucket: storageBucket,
      databaseId: config.databaseId || '(default)',
      firestoreDatabaseId: config.databaseId || '(default)'
    };

    var tBatDau = Date.now();
    var pingURL = urlSach + '/.json?timeout=5s&shallow=true';

    var fetchNoHeader = fetch(pingURL, { method: 'GET' })
      .then(function(res) {
        return { ok: true, status: res.status, doTre: Date.now() - tBatDau };
      })
      .catch(function(err) {
        return { ok: false, err: err.message };
      });

    var fetchNoCors = fetch(pingURL, { method: 'GET', mode: 'no-cors' })
      .then(function() {
        return { ok: true, status: 0, noCors: true, doTre: Date.now() - tBatDau };
      })
      .catch(function(err) {
        return { ok: false, noCors: true, err: err.message };
      });

    var imagePing = new Promise(function(resolve) {
      var img = new Image();
      var t = Date.now();
      var done = false;
      function finish(ok: boolean) {
        if (done) return;
        done = true;
        resolve({ ok: ok, image: true, doTre: Date.now() - t });
      }
      img.onload  = function() { finish(true); };
      img.onerror = function() { finish(true); };
      setTimeout(function() { finish(false); }, 6000);
      img.src = urlSach + '/.json?timeout=5s&_=' + Date.now();
    });

    var timeout = new Promise(function(resolve) {
      setTimeout(function() {
        resolve({ ok: false, timeout: true });
      }, 9000);
    });

    Promise.race([fetchNoHeader, fetchNoCors, imagePing, timeout])
      .then(function(ketQua: any) {
        var doTre = ketQua.doTre || (Date.now() - tBatDau);

        if (ketQua.timeout) {
          hienCanhBaoNhungChoPhepLuu(configObj, doTre, btnKiem, btnLuu, 
            'Không thể kiểm tra kết nối (Timeout), nhưng định dạng đúng. Bạn có thể lưu.', 'timeout');
          return;
        }

        if (!ketQua.ok && ketQua.err && 
           (ketQua.err.toLowerCase().indexOf('failed to fetch') !== -1 || 
            ketQua.err.toLowerCase().indexOf('cors') !== -1)) {
          hienCanhBaoNhungChoPhepLuu(configObj, doTre, btnKiem, btnLuu,
            'Kết nối bị CORS (bình thường trong sandbox). Định dạng đúng — có thể lưu.', 'cors');
          return;
        }

        if (ketQua.ok) {
          var status = ketQua.status || 0;
          if (ketQua.noCors || ketQua.image || status === 200) {
            setConfig(configObj);
            window._firebaseConfigHopLe = configObj;
            if (window.capNhatBadgeFirebase) window.capNhatBadgeFirebase('online');
            var note = (ketQua.noCors || ketQua.image) ? '⚠️ Sandbox limits visibility, but Firebase responded.' : '';
            hienThanhCong(projectId, urlSach, doTre, btnKiem, btnLuu, note);
            setTestResult({ success: true });
          } else if (status === 401 || status === 403) {
            setConfig(configObj);
            window._firebaseConfigHopLe = configObj;
            if (window.capNhatBadgeFirebase) window.capNhatBadgeFirebase('online');
            hienThanhCong(projectId, urlSach, doTre, btnKiem, btnLuu, '⚠️ Vui lòng kiểm tra Firebase Rules (.read: true, .write: true)');
            setTestResult({ success: true });
          } else if (status === 404) {
            if (window.capNhatBadgeFirebase) window.capNhatBadgeFirebase('error');
            hienLoi('Không tìm thấy Database (404).', ['Đảm bảo bạn đã tạo Realtime Database'], btnKiem, btnLuu);
          } else {
            hienCanhBaoNhungChoPhepLuu(configObj, doTre, btnKiem, btnLuu, 'Firebase phản hồi status ' + status, 'other');
          }
        } else {
          hienCanhBaoNhungChoPhepLuu(configObj, doTre, btnKiem, btnLuu, 'Không xác minh được kết nối. Có thể lưu nếu config đúng.', 'unknown');
        }
      });
  }

  function hienThanhCong(projectId, databaseURL, doTre, btnKiem, btnLuu, note) {
    var div = document.getElementById('divKetQuaKetNoi');
    if (!div) return;
    var noteHtml = note ? '<div style="margin-top:10px;padding:8px;background:#fff9c4;border:1px solid #f9a825;border-radius:6px;font-size:11px;color:#5d4037;">' + note + '</div>' : '';
    div.innerHTML = '<div style="background:#e6f4ea;border:1px solid #34a853;border-radius:8px;padding:16px;">' +
      '<div style="font-size:15px;font-weight:700;color:#137333;margin-bottom:10px;">✅ Kết nối thành công!</div>' +
      '<div style="font-size:13px;color:#3c4043;line-height:2;">' +
      '📦 Project: <b>' + projectId + '</b><br>🗄️ Database: <b>' + databaseURL + '</b><br>⚡ Độ trễ: <b>~' + doTre + 'ms</b></div>' + noteHtml + '</div>';
    if (btnLuu) (btnLuu as HTMLButtonElement).disabled = false;
    if (btnKiem) {
      (btnKiem as HTMLButtonElement).disabled = false;
      (btnKiem as HTMLButtonElement).textContent = '🔍 Thử lại';
    }
  }

  function hienCanhBaoNhungChoPhepLuu(configObj, doTre, btnKiem, btnLuu, lyDo, loai) {
    var div = document.getElementById('divKetQuaKetNoi');
    if (!div) return;
    div.innerHTML = '<div style="background:#fff8e1;border:1px solid #ffca28;border-radius:8px;padding:16px;">' +
      '<div style="font-size:15px;font-weight:700;color:#e65100;margin-bottom:8px;">⚠️ Không xác minh được hoàn toàn</div>' +
      '<div style="font-size:13px;color:#3c4043;line-height:1.7;">' + lyDo + '</div>' +
      '<div style="margin-top:12px;padding:10px;background:#e8f5e9;border:1px solid #4caf50;border-radius:6px;font-size:12px;color:#2e7d32;">' +
      '<b>✅ Thông tin đúng định dạng:</b><br>• API Key (AIza...)<br>• Database URL (.firebaseio.com)<br>• Bạn có thể LƯU ngay</div></div>';
    if (btnLuu) (btnLuu as HTMLButtonElement).disabled = false;
    if (btnKiem) {
      (btnKiem as HTMLButtonElement).disabled = false;
      (btnKiem as HTMLButtonElement).textContent = '🔍 Thử lại';
    }
    setConfig(configObj);
    window._firebaseConfigHopLe = configObj;
    setTestResult({ success: true });
    if (window.capNhatBadgeFirebase) window.capNhatBadgeFirebase('online');
  }

  function hienLoi(loiMsg, goiY, btnKiem, btnLuu) {
    var div = document.getElementById('divKetQuaKetNoi');
    if (!div) return;
    var goiYHtml = '<ul style="margin:6px 0 0 16px;padding:0;line-height:1.8;">';
    for (var i = 0; i < goiY.length; i++) { goiYHtml += '<li style="font-size:12px;">' + goiY[i] + '</li>'; }
    goiYHtml += '</ul>';
    div.innerHTML = '<div style="background:#fce8e6;border:1px solid #ea4335;border-radius:8px;padding:16px;">' +
      '<div style="font-size:15px;font-weight:700;color:#c5221f;margin-bottom:8px;">❌ Cấu hình không hợp lệ</div>' +
      '<div style="font-size:13px;color:#3c4043;">⚠️ <b>' + loiMsg + '</b><div style="margin-top:8px;"><b>💡 Gợi ý:</b>' + goiYHtml + '</div></div></div>';
    if (btnLuu) (btnLuu as HTMLButtonElement).disabled = true;
    if (btnKiem) {
      (btnKiem as HTMLButtonElement).disabled = false;
      (btnKiem as HTMLButtonElement).textContent = '🔍 Thử lại';
    }
    if (window.capNhatBadgeFirebase) window.capNhatBadgeFirebase('error');
  }

  async function handleSave() {
    try {
      localStorage.setItem('firebase_config', JSON.stringify(config));
      localStorage.setItem('firebase_status', 'connected');
      window._firebaseConfigDaLuu = config;
      
      // Save as system default
      saveSystemFirebaseConfig(config, true).then((success) => {
        if(success) console.log("Lưu cấu hình mặc định lên hệ thống thành công");
      });

      if (window.capNhatBadgeFirebase) window.capNhatBadgeFirebase('online');
      onClose();
    } catch(e) {}
  }

  // Admin DB functions
  const handleBackup = async () => {
    setAdminStatus({ type: 'loading', message: 'Đang tiến hành sao lưu toàn bộ cấu trúc dữ liệu...' });
    try {
      const payload = await backupDatabase(backupNote);
      const timeStr = new Date(payload.timestamp).toLocaleString('vi-VN');
      setLastBackupTime(timeStr);
      setBackupNote('Sao lưu hệ thống');
      await taiDanhSachSaoLuu();
      setAdminStatus({ 
        type: 'success', 
        message: `Sao lưu thành công lúc ${timeStr}! Bản backup được lưu an toàn tại máy chủ Cloud và bộ nhớ local.` 
      });
    } catch (e: any) {
      setAdminStatus({ type: 'error', message: `Sao lưu thất bại: ${e.message || String(e)}` });
    }
  };

  const handleDownloadBackup = () => {
    try {
      const localBackup = localStorage.getItem('latest_firebase_backup');
      if (!localBackup) {
        alert('⚠️ Chưa có bản sao lưu nào để tải. Vui lòng bấm nút "Sao lưu hệ thống" trước.');
        return;
      }
      const blob = new Blob([localBackup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oko_database_backup_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`❌ Lỗi khi export file JSON: ${e.message}`);
    }
  };

  const downloadSpecificBackup = async (backupId: string, noteName: string) => {
    try {
      setAdminStatus({ type: 'loading', message: `Đang tải tệp chi tiết của bản ghi [${noteName}] từ Cloud...` });
      const payload = await BackupService.getBackupDetails(backupId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oko_backup_${backupId}_${new Date(payload.timestamp).toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setAdminStatus({ type: 'success', message: `Tải thành công bản sao lưu [${noteName}] dạng .JSON!` });
    } catch (err: any) {
      setAdminStatus({ type: 'error', message: `Lỗi khi tải bản sao lưu JSON: ${err.message}` });
    }
  };

  const handleUploadBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        let parsed = JSON.parse(text);
        if (!parsed) {
          setAdminStatus({ type: 'error', message: 'File JSON tải lên rỗng hoặc lỗi cú pháp.' });
          return;
        }

        // Robust format auto-wrapping
        if (!parsed.rtdb && !parsed.firestore) {
          if (parsed.estimateItems || parsed.bm06Orders || parsed.materialPrices || parsed.cauHinh) {
            parsed = {
              rtdb: parsed,
              firestore: {}
            };
          } else {
            setAdminStatus({ type: 'error', message: 'Định dạng file JSON không trùng khớp với cấu trúc sao lưu của ứng dụng OKO.' });
            return;
          }
        }

        setConfirmModal({
          isOpen: true,
          title: 'Xác nhận khôi phục từ file',
          message: `CẢNH BÁO: Bạn chuẩn bị khôi phục và ghi đè toàn bộ dữ liệu hiện tại bằng file offline [${file.name}]. Hành động này KHÔNG THỂ HOÀN TÁC. Bạn có đồng ý khôi phục không?`,
          onConfirm: async () => {
            await runRestoreWithProgress(() => restoreDatabase(parsed), `Đọc file offline [${file.name}]`);
          }
        });
      } catch (err: any) {
        setAdminStatus({ type: 'error', message: `Đọc hoặc Parse file thất bại: ${err.message}` });
      }
      if (inputEl) {
        inputEl.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleCloudRestore = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận khôi phục Cloud',
      message: 'CẢNH BÁO: Khôi phục database từ Bản Sao Lưu Gần Nhất trên Firebase Cloud. Toàn bộ thông số hiện tại sẽ bị hoàn tác. Bạn có chắc chắn muốn tiếp tục?',
      onConfirm: async () => {
        await runRestoreWithProgress(() => restoreDatabase(), 'Bản sao lưu gần nhất từ Cloud');
      }
    });
  };

  const handleCloudRestoreSpec = async (backupId: string, noteName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận khôi phục bản sao lưu',
      message: `CẢNH BÁO: Khôi phục database về Bản Sao Lưu [${noteName}] trên Firebase Cloud. Toàn bộ thông số hiện tại trên trang sẽ bị hoàn tác và thay thế hoàn toàn bằng tệp này. Bạn có chắc chắn muốn tiếp tục?`,
      onConfirm: async () => {
        await runRestoreWithProgress(() => restoreDatabase(backupId), `Bản sao lưu [${noteName}]`);
      }
    });
  };

  const handleBatchDeleteCloudBackups = async () => {
    if (!canDelete(currentUser)) {
      setToast({ message: "Lỗi phân quyền: Chỉ tài khoản ADMIN mới có quyền xóa bản sao lưu!", type: "error" });
      return;
    }

    const count = selectedBackupIds.length;
    if (count === 0) return;

    const selectedBackupsList = cloudBackups.filter(b => selectedBackupIds.includes(b.backupId));

    const confirmMessage = (
      <div className="space-y-3 mt-1 text-slate-700 text-xs">
        <p className="font-semibold text-slate-800 text-sm">
          Bạn đang chọn <span className="font-extrabold text-red-600">{count}</span> bản sao lưu để xóa.
        </p>
        <p className="font-medium text-slate-600">
          Bạn có chắc chắn muốn xóa các bản sao lưu đã chọn?
        </p>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5">
          <p className="text-slate-800 font-bold">
            Đã chọn: <span className="text-red-600 font-extrabold">{count}</span> bản sao lưu
          </p>
          <div className="max-h-32 overflow-y-auto space-y-1 pt-1.5 border-t border-slate-200/60">
            {selectedBackupsList.map(b => (
              <div key={b.backupId} className="flex justify-between items-center text-[11px] text-slate-600 font-medium">
                <span className="font-bold text-slate-800 truncate max-w-[220px]" title={b.backupName}>{b.backupName}</span>
                <span className="text-slate-400 font-mono text-[10px]">{new Date(b.createdAt || b.timestamp).toLocaleDateString('vi-VN')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa bản sao lưu',
      message: confirmMessage,
      cancelText: 'HỦY',
      confirmText: `XÓA ${count} BẢN SAO LƯU`,
      confirmBtnClass: "px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer",
      onConfirm: async () => {
        setAdminStatus({ type: 'loading', message: `Đang thực hiện xóa ${count} bản sao lưu đã chọn...` });
        setLoadingBackups(true);
        try {
          let deletedCount = 0;
          for (const backup of selectedBackupsList) {
            await deleteBackup(backup.backupId, backup);
            deletedCount++;
          }
          await taiDanhSachSaoLuu();
          setSelectedBackupIds([]);
          setToast({ message: `Đã xóa ${deletedCount} bản sao lưu thành công.`, type: "success" });
          setAdminStatus({ type: 'success', message: `Đã xóa ${deletedCount} bản sao lưu thành công.` });
        } catch (err: any) {
          setToast({ message: `Lỗi khi xóa bản sao lưu: ${err.message || String(err)}`, type: "error" });
          setAdminStatus({ type: 'error', message: `Xóa thất bại: ${err.message || String(err)}` });
        } finally {
          setLoadingBackups(false);
        }
      }
    });
  };

  const handleDeleteCloudBackup = async (backup: any) => {
    if (!canDelete(currentUser)) {
      setToast({ message: "Lỗi phân quyền: Chỉ tài khoản ADMIN mới có quyền xóa bản sao lưu!", type: "error" });
      return;
    }

    const { backupId, backupName, backupType, createdAt, timestamp, dataSize } = backup;
    const dateStr = new Date(createdAt || timestamp).toLocaleString('vi-VN');
    const sizeKB = ((dataSize || 0) / 1024).toFixed(2);
    
    const typeLabel = backupType === 'pre_restore_safety' 
      ? '⚠️ Phục hồi an toàn (AUTO_PRE_RESTORE_SAFETY_BACKUP)' 
      : backupType === 'auto' 
        ? '☁️ Tự động' 
        : '💾 Thủ công';

    const confirmMessage = (
      <div className="space-y-3 mt-2 text-slate-600">
        <p className="font-semibold text-slate-700">Bạn có chắc chắn muốn XÓA VĨNH VIỄN bản sao lưu này khỏi Cloud? Hành động này không thể hoàn tác.</p>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2 text-xs">
          <div>
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tên bản sao lưu:</span>
            <p className="text-slate-850 font-extrabold break-all mt-0.5">{backupName}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
            <div>
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Loại backup:</span>
              <p className="text-slate-800 font-black mt-0.5">{typeLabel}</p>
            </div>
            <div>
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Dung lượng:</span>
              <p className="text-slate-800 font-black mt-0.5">{sizeKB} KB</p>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-2">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Thời gian tạo:</span>
            <p className="text-slate-800 font-black mt-0.5">{dateStr}</p>
          </div>
        </div>
      </div>
    );

    const performDelete = async () => {
      setAdminStatus({ type: 'loading', message: `Đang thực hiện xóa bản sao lưu [${backupName}]...` });
      try {
        await deleteBackup(backupId, backup);
        await taiDanhSachSaoLuu();
        setToast({ message: "Đã xóa bản sao lưu thành công!", type: "success" });
        setAdminStatus({ type: 'success', message: `Đã xóa thành công bản sao lưu [${backupName}] khỏi Cloud!` });
      } catch (err: any) {
        setToast({ message: `Lỗi: ${err.message || String(err)}`, type: "error" });
        setAdminStatus({ type: 'error', message: `Xóa thất bại: ${err.message || String(err)}` });
      }
    };

    if (backupType === 'pre_restore_safety') {
      setConfirmModal({
        isOpen: true,
        title: 'Xác nhận xóa bản sao lưu hệ thống',
        message: confirmMessage,
        onConfirm: async () => {
          setTimeout(() => {
            setConfirmModal({
              isOpen: true,
              title: '🔴 CẢNH BÁO NGUY HIỂM!',
              message: (
                <div className="space-y-3 mt-2 text-slate-600">
                  <p className="text-red-600 font-black uppercase tracking-wider text-xs animate-pulse">Cảnh báo bảo mật quan trọng</p>
                  <p className="text-slate-800 font-black">Đây là bản backup an toàn trước khi khôi phục. Bạn có chắc muốn xóa không?</p>
                  <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                    Bản sao lưu này bảo vệ hệ thống của bạn trước khi thực hiện thao tác khôi phục nguy hiểm. Việc xóa nó có thể dẫn đến việc mất dữ liệu vĩnh viễn nếu hệ thống phát sinh lỗi sau này.
                  </p>
                </div>
              ),
              onConfirm: async () => {
                await performDelete();
              }
            });
          }, 300);
        }
      });
    } else {
      setConfirmModal({
        isOpen: true,
        title: 'Xác nhận xóa bản sao lưu',
        message: confirmMessage,
        onConfirm: async () => {
          await performDelete();
        }
      });
    }
  };

  const handleResetDB = async () => {
    if (confirmText !== 'RESET') {
      alert('⚠️ Vui lòng nhập đúng chữ "RESET" để xác nhận xóa sạch.');
      return;
    }

    setAdminStatus({ type: 'loading', message: 'Đang thực hiện reset toàn bộ dữ liệu...' });
    try {
      await resetDatabase();
      setAdminStatus({ type: 'success', message: 'Reset dữ liệu thành công! Toàn bộ bảng & thông số đã trở về 0. Đang tải lại app...' });
      setTimeout(() => {
        window.location.reload();
      }, 2500);
    } catch (err: any) {
      setAdminStatus({ type: 'error', message: `Lỗi reset database: ${err.message || String(err)}` });
    }
  };

  const getPayloadSummary = (payload: any) => {
    if (!payload) return null;
    var rtdb = payload.rtdb || {};
    var fs = payload.firestore || {};

    var getLen = (obj: any) => obj ? Object.keys(obj).length : 0;

    return {
      estimateItems: getLen(rtdb.estimateItems),
      bm06Orders: getLen(rtdb.bm06Orders),
      bm06OrderHistory: getLen(rtdb.bm06OrderHistory),
      materialPrices: getLen(rtdb.materialPrices),
      lichSu: getLen(rtdb.lichSu),
      bm02Orders: getLen(fs.bm02Orders),
      bbntOrders: getLen(fs.bbntOrders),
      bm032Orders: getLen(fs.bm032Orders),
      fsBm06Orders: getLen(fs.bm06Orders),
      fsEstimateItems: getLen(fs.estimateItems),
      materialTypeConfigs: getLen(fs.materialTypeConfigs)
    };
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 text-slate-900 font-sans">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden border border-slate-200 animate-bounce-in">
        
        {/* Header bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔥</span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Thiết lập Firebase</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {modalMode === 'setup' ? `Cấu hình kết nối (Bước ${buoc} / 6)` : 'Phân hệ quản trị cơ sở dữ liệu'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><X size={20} /></button>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-slate-100 p-1 mx-6 mt-4 rounded-xl border border-slate-200/60 shrink-0">
          <button 
            type="button"
            onClick={() => setModalMode('setup')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${modalMode === 'setup' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50 font-black' : 'text-slate-500 hover:text-slate-800'}`}
          >
            🔌 Cấu hình kết nối
          </button>
          <button 
            type="button"
            onClick={() => setModalMode('admin')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${modalMode === 'admin' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50 font-black' : 'text-slate-500 hover:text-slate-800'}`}
          >
            🗄️ Quản lý dữ liệu (Reset & Backup)
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[420px] max-h-[70vh]">
          {modalMode === 'setup' ? (
            <div>
              {/* Progress Bar */}
              <div className="flex gap-1 mb-6">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className={"h-1.5 flex-1 rounded-full " + (buoc >= i ? 'bg-blue-600' : 'bg-slate-100')}></div>
                ))}
              </div>

              {buoc === 1 && (
                <div className="flex flex-col items-center text-center space-y-6 py-4">
                  <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center text-4xl mb-2">🔥</div>
                  <h3 className="text-2xl font-black text-slate-800">Kết nối Firebase</h3>
                  <p className="text-slate-600 max-w-md mx-auto">Firebase giúp đồng bộ dữ liệu thời gian thực giữa nhiều thiết bị, không cần thông qua Google Sheets.</p>
                  <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                    {['Đồng bộ real-time', 'Hoạt động offline', 'Bảo mật cao', 'Miễn phí'].map(txt => (
                      <div key={txt} className="flex items-center gap-2 text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-green-500">✅</span> {txt}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {buoc === 2 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-slate-800">1. Tạo Firebase Project</h3>
                  <div className="space-y-3">
                    {[
                      'Truy cập firebase.google.com → Get Started',
                      'Nhấn "Add project" → đặt tên project của bạn',
                      'Tắt Google Analytics (không cần thiết) → Create project',
                      'Vào Realtime Database → Create database (Chọn "Start in test mode" để đồng bộ vật tư & giá vật liệu)',
                      'QUAN TRỌNG: Vào Firestore Database → Click "Create database" (Chọn "Start in test mode", chọn region/location phù hợp rồi click "Enable") để lưu trữ dữ liệu Dự toán (BM01) & Đơn đề nghị cấp bê tông (BM06)'
                    ].map((txt, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</span>
                        <p className="text-sm text-slate-700 font-medium">{txt}</p>
                      </div>
                    ))}
                  </div>
                  <div className="pt-4">
                    <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:translate-y-[-2px] transition-all shadow-lg shadow-blue-100">
                      Mở Firebase Console <Upload size={16} />
                    </a>
                  </div>
                </div>
              )}

              {buoc === 3 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-slate-800">2. Lấy Firebase Config</h3>
                  <div className="space-y-3">
                    {[
                      'Trong Firebase Console → Project Settings (⚙️)',
                      'Kéo xuống "Your apps" → Nhấn icon </> (Web)',
                      'Đặt tên app (ví dụ: OKO App) → Register app',
                      'Copy đoạn code firebaseConfig hiển thị'
                    ].map((txt, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</span>
                        <p className="text-sm text-slate-700 font-medium">{txt}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-900 rounded-xl p-4 text-[11px] font-mono text-blue-300 leading-relaxed overflow-hidden relative">
                    <div className="absolute top-2 right-2 text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded">VÍ DỤ</div>
                    <pre>{`const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "project.firebaseapp.com",
  databaseURL: "https://project-id.firebaseio.com",
  projectId: "project-id",
  ...
};`}</pre>
                  </div>
                </div>
              )}

              {buoc === 4 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-slate-800">3. Dán firebaseConfig vào đây</h3>
                  <p className="text-xs text-slate-500 font-medium">Bạn có thể dán nguyên đoạn code vừa copy được, hệ thống sẽ tự động phân tích.</p>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none h-40 text-slate-800"
                    placeholder="const firebaseConfig = { ... };"
                    value={rawConfig}
                    onChange={function(e) { setRawConfig(e.target.value); setErrorMsg(''); }}
                  ></textarea>
                  {errorMsg && <p className="text-red-500 text-xs font-bold">⚠️ {errorMsg}</p>}
                  <button 
                    onClick={handleAutoParse}
                    className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    🔍 Tự động phân tích
                  </button>
                </div>
              )}

              {buoc === 5 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-slate-800">4. Kiểm tra thông tin cấu hình</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">API KEY *</label>
                      <input id="fb_apiKey" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium" value={config.apiKey} onChange={function(e) { setConfig({...config, apiKey: e.target.value}); }} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">DATABASE URL *</label>
                      <input id="fb_databaseURL" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium" value={config.databaseURL} onChange={function(e) { setConfig({...config, databaseURL: e.target.value}); }} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">PROJECT ID *</label>
                      <input id="fb_projectId" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium" value={config.projectId} onChange={function(e) { setConfig({...config, projectId: e.target.value}); }} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">APP ID *</label>
                      <input id="fb_appId" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium" value={config.appId} onChange={function(e) { setConfig({...config, appId: e.target.value}); }} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">AUTH DOMAIN</label>
                      <input id="fb_authDomain" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium" value={config.authDomain} onChange={function(e) { setConfig({...config, authDomain: e.target.value}); }} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">MESSAGING SENDER ID</label>
                      <input id="fb_messagingSenderId" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium" value={config.messagingSenderId} onChange={function(e) { setConfig({...config, messagingSenderId: e.target.value}); }} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">STORAGE BUCKET</label>
                      <input id="fb_storageBucket" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium" value={config.storageBucket} onChange={function(e) { setConfig({...config, storageBucket: e.target.value}); }} />
                    </div>
                    <div className="space-y-1 font-bold text-blue-600">
                      <label className="text-[10px] font-bold text-blue-500 uppercase">FIRESTORE DATABASE ID</label>
                      <input id="fb_databaseId" className="w-full bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono" placeholder="(default)" value={config.databaseId} onChange={function(e) { setConfig({...config, databaseId: e.target.value}); }} />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 italic font-medium">* Các trường bắt buộc phải có để kết nối database. Hãy điền Firestore Database ID nếu bạn không dùng database mặc định.</p>
                  <button 
                    onClick={function() { setBuoc(4); }}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    ← Quay lại dán config khác
                  </button>
                </div>
              )}

              {buoc === 6 && (
                <div className="space-y-6 flex flex-col items-center justify-center py-4">
                  <h3 className="text-xl font-bold text-slate-800">5. Kiểm tra kết nối</h3>
                  <p className="text-sm text-slate-600 text-center">Nhấn nút bên dưới để thử kết nối thật đến Firebase của bạn.</p>
                  
                  <button 
                    id="btnKiemTraKetNoi"
                    onClick={kiemTraKetNoi}
                    className="px-10 py-4 bg-slate-800 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
                  >
                    🔍 KIỂM TRA KẾT NỐI
                  </button>

                  <div id="divKetQuaKetNoi" className="w-full"></div>
                </div>
              )}
            </div>
          ) : (
            /* Database Administration Phân hệ */
            <div className="space-y-6">
              
              {/* Alert Status Banner */}
              {adminStatus.type !== 'idle' && (
                <div className={`p-4 rounded-xl border flex gap-3 items-start animate-in fade-in slide-in-from-top-2 duration-300 ${
                  adminStatus.type === 'loading' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                  adminStatus.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {adminStatus.type === 'loading' ? (
                    <Loader2 size={18} className="animate-spin text-blue-500 mt-0.5 shrink-0" />
                  ) : adminStatus.type === 'success' ? (
                    <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={18} className="text-rose-500 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="text-xs font-bold">{adminStatus.message}</p>
                  </div>
                </div>
              )}

              {/* SECTION 1: BACKUP & RESTORE SYSTEMS */}
              <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-xl space-y-5">
                <div className="flex items-center gap-2 text-slate-800 border-b border-slate-200 pb-2.5">
                  <span className="text-lg">📦</span>
                  <h4 className="font-bold text-sm tracking-tight uppercase">Trạng thái lưu trữ của Cloud & Local</h4>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">THÔNG TIN SAO LƯU GẦN NHẤT</p>
                    <p className="text-xs font-black text-slate-800 mt-0.5">
                      Bản sao lưu gần nhất: {' '}
                      <span className={lastBackupTime ? 'text-blue-600 font-extrabold' : 'text-slate-400 italic'}>
                        {lastBackupTime || 'Chưa thực hiện sao lưu'}
                      </span>
                    </p>
                    <div className="flex gap-4 mt-1.5 text-[10px] text-slate-500 font-semibold">
                      <span>☁️ Cloud Backup: <b className="text-slate-800">{cloudBackups.length} bản</b></span>
                      <span>💾 Dung lượng: <b className="text-slate-800">{(cloudBackups.reduce((acc, curr) => acc + (curr.dataSize || 0), 0) / 1024).toFixed(2)} KB</b></span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={handleBackup}
                      disabled={adminStatus.type === 'loading'}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-100 flex items-center gap-1.5 active:scale-95"
                    >
                      <Save size={13} /> Sao lưu hệ thống
                    </button>
                    
                    {lastBackupTime && (
                      <button 
                        onClick={handleCloudRestore}
                        disabled={adminStatus.type === 'loading'}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                      >
                        <History size={13} /> Khôi phục Cloud (Gần nhất)
                      </button>
                    )}
                  </div>
                </div>

                {/* Import / Export JSON Buttons row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Download Backup Box */}
                  <div className="p-3 bg-white rounded-lg border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10.5px] font-bold text-slate-800">Tải về offline (.JSON)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Lưu trữ bản sao lưu an toàn tại máy tính</p>
                    </div>
                    <button 
                      onClick={handleDownloadBackup}
                      title="Tải backup file json"
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center justify-center border border-slate-200"
                    >
                      <Download size={14} />
                    </button>
                  </div>

                  {/* Upload File Restore Box */}
                  <label 
                    htmlFor="oko-backup-file-upload-input"
                    className="p-3 bg-white rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50/80 flex items-center justify-between cursor-pointer transition-all duration-200 group"
                  >
                    <div>
                      <p className="text-[10.5px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Khôi phục từ file</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Đọc dữ liệu lưu trữ từ tệp JSON của bạn</p>
                    </div>
                    <div 
                      className="p-2 bg-slate-100 group-hover:bg-blue-50 text-slate-700 group-hover:text-blue-600 rounded-lg transition-colors flex items-center justify-center border border-slate-200 group-hover:border-blue-200 font-bold shadow-sm"
                    >
                      <Upload size={14} />
                    </div>
                  </label>
                  <input 
                    id="oko-backup-file-upload-input"
                    type="file" 
                    accept=".json"
                    onChange={handleUploadBackup}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              {/* SECTION 2: AUTOMATIC CLOUD BACKUP SCHEDULE */}
              <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between gap-2 text-slate-800 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📅</span>
                    <h4 className="font-bold text-sm tracking-tight uppercase">Lịch sao lưu tự động lên Cloud</h4>
                  </div>
                  <div>
                    {!navigator.onLine ? (
                      <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold">⚠️ Chờ kết nối (Offline)</span>
                    ) : schedEnabled ? (
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold">● Đang hoạt động</span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-full text-[10px] font-bold">○ Đang tắt</span>
                    )}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-50">
                    <div className="space-y-0.5">
                      <span className="text-xs font-black text-slate-800">Kích hoạt Tự động sao lưu lên Cloud</span>
                      <p className="text-[10px] text-slate-400 font-medium">Hệ thống tự động backup ngầm mà không làm ngắt quãng công việc</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={schedEnabled}
                        onChange={(e) => setSchedEnabled(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {schedEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-bold pt-1">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase">Tần suất sao lưu</label>
                        <select 
                          value={schedType}
                          onChange={(e) => setSchedType(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="daily">Hằng ngày</option>
                          <option value="weekly">Hằng tuần</option>
                          <option value="monthly">Hằng tháng</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase">Giờ sao lưu</label>
                        <input 
                          type="time"
                          value={schedTime}
                          onChange={(e) => setSchedTime(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase">Số lượng bản lưu giữ</label>
                        <input 
                          type="number"
                          min="1"
                          max="50"
                          value={schedKeepLast}
                          onChange={(e) => setSchedKeepLast(Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 text-[10.5px] text-slate-600 font-semibold space-y-1">
                    <div className="flex justify-between">
                      <span>Lần tự động gần nhất:</span>
                      <span className="text-slate-800 font-bold">{schedLastRun ? new Date(schedLastRun).toLocaleString('vi-VN') : 'Chưa chạy lần nào'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lần tự động tiếp theo:</span>
                      <span className="text-blue-600 font-bold">{schedNextRun ? new Date(schedNextRun).toLocaleString('vi-VN') : 'Chưa thiết lập'}</span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveSchedule}
                      disabled={savingSchedule}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                    >
                      {savingSchedule ? <Loader2 size={12} className="animate-spin" /> : 'Cập nhật lịch sao lưu'}
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 3: CLOUD BACKUPS LIST */}
              <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-800 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">☁️</span>
                    <h4 className="font-bold text-sm tracking-tight uppercase">Danh sách các bản sao lưu trên Cloud</h4>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    {cloudBackups.length > 0 && (
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                          checked={cloudBackups.length > 0 && cloudBackups.every(b => selectedBackupIds.includes(b.backupId))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBackupIds(cloudBackups.map(b => b.backupId));
                            } else {
                              setSelectedBackupIds([]);
                            }
                          }}
                        />
                        <span>Chọn tất cả</span>
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={handleBatchDeleteCloudBackups}
                      disabled={selectedBackupIds.length === 0 || loadingBackups}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                        selectedBackupIds.length === 0 || loadingBackups
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                          : 'bg-red-600 hover:bg-red-700 text-white border-red-700 cursor-pointer active:scale-95'
                      }`}
                      title={selectedBackupIds.length === 0 ? "Vui lòng chọn bản sao lưu để xóa" : `Xóa ${selectedBackupIds.length} bản sao lưu đã chọn`}
                    >
                      <Trash2 size={13} />
                      <span>XÓA {selectedBackupIds.length > 0 ? `(${selectedBackupIds.length})` : ''}</span>
                    </button>

                    {cloudBackups.length > 0 && (() => {
                      const { duplicateIds } = identifyBackupDuplicates(cloudBackups);
                      if (duplicateIds.size > 0) {
                        return (
                          <button
                            onClick={async () => {
                              if (window.confirm(`Bạn có chắc chắn muốn xóa tất cả ${duplicateIds.size} bản sao lưu trùng lặp này khỏi Cloud để dọn dẹp bộ nhớ không?`)) {
                                setLoadingBackups(true);
                                try {
                                  const dupList = cloudBackups.filter(b => duplicateIds.has(b.backupId));
                                  for (const dup of dupList) {
                                    await deleteBackup(dup.backupId, dup);
                                  }
                                  alert('Đã dọn dẹp thành công tất cả các bản sao lưu trùng lặp!');
                                  setSelectedBackupIds([]);
                                  await taiDanhSachSaoLuu();
                                } catch (err: any) {
                                  alert(`Lỗi khi dọn dẹp bản trùng lặp: ${err.message}`);
                                } finally {
                                  setLoadingBackups(false);
                                }
                              }
                            }}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <Trash2 size={12} /> Xóa {duplicateIds.size} bản trùng lặp
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-2.5 pr-1">
                  {loadingBackups ? (
                    <div className="text-center py-8 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin text-blue-500" /> Đang lấy danh sách từ Cloud...
                    </div>
                  ) : cloudBackups.length === 0 ? (
                    <p className="text-center py-8 text-xs font-bold text-slate-400 italic">Không tìm thấy bản sao lưu nào lưu trữ trên Cloud.</p>
                  ) : (() => {
                    const { duplicateIds } = identifyBackupDuplicates(cloudBackups);
                    return cloudBackups.map((b) => {
                      const dateStr = new Date(b.createdAt || b.timestamp).toLocaleString('vi-VN');
                      const sizeKB = ((b.dataSize || 0) / 1024).toFixed(2);
                      const isPreSafety = b.backupType === 'pre_restore_safety';
                      const isAuto = b.backupType === 'auto';
                      const isDuplicate = duplicateIds.has(b.backupId);
                      const isSelected = selectedBackupIds.includes(b.backupId);
                      
                      return (
                        <div 
                          key={b.backupId} 
                          className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                            isSelected
                              ? 'bg-blue-50/60 border-blue-300 shadow-sm'
                              : isDuplicate 
                                ? 'bg-amber-50/25 border-amber-200 hover:border-amber-300' 
                                : 'bg-white border-slate-100 shadow-sm hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input 
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedBackupIds(prev => 
                                  prev.includes(b.backupId)
                                    ? prev.filter(id => id !== b.backupId)
                                    : [...prev, b.backupId]
                                );
                              }}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer shrink-0"
                            />
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-black text-slate-800 truncate block max-w-[220px]" title={b.backupName}>{b.backupName}</span>
                                {isPreSafety && (
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-black uppercase tracking-wider">⚠️ Khôi phục an toàn</span>
                                )}
                                {isAuto && (
                                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[9px] font-black uppercase tracking-wider">Tự động</span>
                                )}
                                {!isPreSafety && !isAuto && (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-black uppercase tracking-wider">Thủ công</span>
                                )}
                                {isDuplicate && (
                                  <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-black uppercase tracking-wider">⚠️ Bản trùng</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold">
                                <span>🕒 {dateStr}</span>
                                <span>💾 {sizeKB} KB</span>
                                <span>👤 {b.createdBy || 'System'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 pl-7 sm:pl-0">
                            <button
                              onClick={() => handleCloudRestoreSpec(b.backupId, b.backupName)}
                              title="Khôi phục database về bản sao lưu này"
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-[11px] font-extrabold transition-colors flex items-center gap-1 border border-blue-100 cursor-pointer"
                            >
                              Khôi phục
                            </button>
                            <button
                              onClick={() => {
                                try {
                                  const blob = new Blob([JSON.stringify(b.data || b, null, 2)], { type: 'application/json' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = b.backupName || `bk_${b.backupId || Date.now()}.json`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                } catch (err: any) {
                                  alert(`Lỗi khi xuất file JSON: ${err.message}`);
                                }
                              }}
                              title="Tải tệp JSON của bản sao lưu này về máy"
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                            >
                              <Download size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* SECTION 2: RESET DATABASE TO 0 */}
              <div className="bg-red-50/50 border border-red-200 p-5 rounded-xl space-y-4">
                <div className="flex items-center gap-2 text-red-900">
                  <span className="text-lg">⚠️</span>
                  <h4 className="font-extrabold text-sm tracking-tight text-red-800">PHÂN KHU NGUY HIỂM: RESET TOÀN BỘ CƠ SỞ DỮ LIỆU</h4>
                </div>

                <div className="bg-red-50 border border-red-200/60 rounded-xl p-4 text-xs leading-relaxed text-red-700 space-y-1.5 font-medium">
                  <p>• Nhấn nút Reset Database sẽ dọn dẹp sạch các bảng dữ liệu hoạt động trong database Firebase.</p>
                  <p>• Toàn bộ <b>Dự toán (estimateItems)</b>, <b>Danh sách đơn đề nghị cấp bê tông (bm06Orders)</b>, <b>Báo giá (materialPrices)</b>, <b>Biên bản nghiệm thu (bbntOrders)</b>, <b>BM02</b> và các lịch sử hoạt động sẽ về <b>0</b> hoặc rỗng hoàn toàn để khởi tạo từ đầu.</p>
                  <p className="text-emerald-800 font-extrabold">• 🔒 Tuyệt đối KHÔNG xóa danh mục <b>Quản lý Vật tư</b> (bao gồm danh sách và cấu hình chi tiết) và <b>Quản lý Tài khoản & Quyền hạn</b>. Các phần này được lưu giữ xuyên suốt và an toàn.</p>
                  <p className="font-black text-rose-800">⚠️ VUI LÒNG SAO LƯU DỰ LIỆU TRƯỚC VÌ HÀNH ĐỘNG NÀY SẼ XÓA SẠCH VĨNH VIỄN CÁC DỮ LIỆU HOẠT ĐỘNG ĐANG CHẠY!</p>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-extrabold text-slate-500 uppercase">Để xác nhận, vui lòng nhập chữ <b className="text-red-600 bg-red-100 px-1 py-0.5 rounded font-black font-mono">RESET</b> vào ô bên dưới:</label>
                    <input 
                      type="text"
                      className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 text-xs font-mono font-bold tracking-widest uppercase outline-none focus:ring-2 focus:ring-red-500 text-slate-800"
                      placeholder="RESET"
                      value={confirmText}
                      onChange={(e) => {
                        setConfirmText(e.target.value);
                        setAdminStatus({ type: 'idle', message: '' });
                      }}
                    />
                  </div>

                  <button
                    onClick={handleResetDB}
                    disabled={confirmText !== 'RESET' || adminStatus.type === 'loading'}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:hover:bg-red-600 disabled:scale-100 text-white rounded-xl font-black text-xs transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-red-100"
                  >
                    <RefreshCw size={14} className={adminStatus.type === 'loading' ? 'animate-spin' : ''} /> Reset Database về 0
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Modal Footer actions */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          {modalMode === 'setup' ? (
            <>
              <button 
                disabled={buoc === 1}
                onClick={function() { if(buoc > 1) setBuoc(buoc - 1); }}
                className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all text-sm disabled:opacity-20"
              >
                Quay lại
              </button>
              
              {buoc < 6 ? (
                <button 
                  onClick={function() { setBuoc(buoc + 1); }}
                  className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-md active:scale-95"
                >
                  Tiếp theo →
                </button>
              ) : (
                <button 
                  id="btnLuuHoanTat"
                  disabled={!testResult || !testResult.success}
                  onClick={handleSave}
                  className="px-10 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all text-sm shadow-lg disabled:opacity-30 disabled:scale-100 active:scale-95"
                >
                  Lưu & Hoàn tất
                </button>
              )}
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button 
                onClick={onClose}
                className="px-8 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all text-sm"
              >
                Đóng quản trị
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Progress Overlay Screen (From 1% to 100%) */}
      {restoreProgress !== null && (
        <div className="absolute inset-0 bg-slate-950/95 z-[210] flex flex-col items-center justify-center p-6 text-white text-center rounded-2xl animate-fade-in">
          <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mb-5 relative border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <span className="absolute text-xl">⚡</span>
          </div>
          <h3 className="text-lg font-black tracking-tight mb-2 uppercase text-blue-400">Đang thực hiện khôi phục dữ liệu...</h3>
          <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
            Hệ thống đang thực hiện xóa dữ liệu cũ và cập nhật gói sao lưu mới. Vui lòng giữ mạng internet ổn định.
          </p>

          <div className="w-full max-w-sm bg-slate-800 rounded-full h-3.5 mb-2 overflow-hidden border border-slate-700/50 p-0.5">
            <div 
              className="bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-500 h-full rounded-full transition-all duration-150 ease-out"
              style={{ width: `${restoreProgress}%` }}
            ></div>
          </div>
          
          <div className="flex justify-between w-full max-w-sm text-[11px] font-mono text-slate-400 mb-2 px-1">
            <span className="font-bold text-sky-400">
              {restoreProgress < 25 ? '📦 Phân tích tệp tin...' :
               restoreProgress < 55 ? '🧹 Dọn dẹp cơ sở dữ liệu...' :
               restoreProgress < 85 ? '💾 Đồng bộ Realtime & Firestore...' :
               restoreProgress < 100 ? '⚙️ Kiểm tra cấu trúc bản ghi...' :
               '✅ Hoàn tất nạp dữ liệu!'}
            </span>
            <span className="text-sm font-black text-white">{restoreProgress}%</span>
          </div>
        </div>
      )}

      {/* Success Dialog Popup Overlay */}
      {showRestoreSuccess && completedPayload && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md z-[220] flex items-center justify-center p-4 rounded-2xl animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-100 flex flex-col items-center text-slate-800 text-center space-y-4 max-h-[90%] overflow-y-auto">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-4xl text-emerald-500 animate-bounce-in border border-emerald-100 shadow-sm shadow-emerald-50">
              🎉
            </div>
            <div>
              <h3 className="text-xl font-black text-emerald-600 uppercase tracking-tight">KHÔI PHỤC THÀNH CÔNG!</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Hệ thống đã nhận diện và nạp các thực thể bảng thành công.</p>
            </div>

            {/* Statistics info */}
            <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-100 text-left space-y-2.5 text-xs">
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-1.5 flex justify-between">
                <span>Dữ liệu khôi phục thực tế</span>
                <span className="text-blue-600 font-mono">
                  {completedPayload.timestamp ? new Date(completedPayload.timestamp).toLocaleDateString('vi-VN') : 'Mới nhất'}
                </span>
              </div>
              
              <div className="space-y-1.5 text-slate-700">
                {(() => {
                  var summary = getPayloadSummary(completedPayload);
                  if (!summary) return <p className="text-center italic text-slate-400">Không có dữ liệu chi tiết thống kê.</p>;
                  return (
                    <>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                        <span className="font-medium text-slate-600">📐 Dự toán & Bản vẽ (BM01)</span>
                        <span className="font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                          {summary.estimateItems || summary.fsEstimateItems || 0} bản ghi
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                        <span className="font-medium text-slate-600">📋 Đơn đặt hàng (BM02)</span>
                        <span className="font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-[11px]">
                          {summary.bm02Orders || 0} hồ sơ
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                        <span className="font-medium text-slate-600">✍️ Đơn đề nghị cấp bê tông (BM06)</span>
                        <span className="font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                          {summary.bm06Orders || summary.fsBm06Orders || 0} đơn
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                        <span className="font-medium text-slate-600">🔨 Biên bản nghiệm thu (BBNT)</span>
                        <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                          {summary.bm032Orders || summary.bbntOrders || 0} biên bản
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                        <span className="font-medium text-slate-600">💰 Báo giá & Nhóm vật liệu</span>
                        <span className="font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[11px]">
                          {summary.materialPrices || 0} mục
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                        <span className="font-medium text-slate-600">⚙️ Cấu hình biểu mẫu vật tư</span>
                        <span className="font-extrabold text-teal-600 bg-teal-50 px-2 py-0.5 rounded text-[11px]">
                          {summary.materialTypeConfigs || 0} cấu hình
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="text-[10px] text-slate-400 italic font-medium leading-relaxed bg-slate-100/40 p-1.5 rounded text-center">
                * Toàn bộ cơ sở dữ liệu đã đồng bộ sẵn sàng
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11.5px] p-3 rounded-lg leading-relaxed font-semibold text-left">
              ⚠️ Vui lòng nhấn nút dưới đây để tải lại trang chủ nhằm áp dụng chính xác cấu trúc & chỉ mục mới.
            </div>

            <button
              onClick={() => {
                window.location.reload();
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl tracking-wider uppercase shadow-md shadow-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              🔄 ĐỒNG Ý & TẢI LẠI TRANG
            </button>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-800">{confirmModal.title}</h4>
                <div className="text-xs text-slate-500 font-medium leading-relaxed">{confirmModal.message}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                {confirmModal.cancelText || 'HỦY BỎ'}
              </button>
              <button
                onClick={async () => {
                  setConfirmModal({ ...confirmModal, isOpen: false });
                  await confirmModal.onConfirm();
                }}
                className={confirmModal.confirmBtnClass || "px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer"}
              >
                {confirmModal.confirmText || 'ĐỒNG Ý'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

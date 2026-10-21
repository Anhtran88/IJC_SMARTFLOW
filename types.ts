
export interface LineItem {
  isProjectShared?: boolean;
  totalProjectUnits?: number;

  id: string;
  stt: number;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  note: string;
  priceFound?: boolean;
  priceDate?: string;
  selectedPriceDate?: string;
  duToanQty?: number;
  luyKeQty?: number;
  projectId?: string;
  unitId?: string;
  appliedUnits?: string[];
  _lastConfirmedUnitPrice?: number;
  isCustomPrice?: boolean;
  isMatchedWithCatalog?: boolean;
  matchedCatalogName?: string;
  matchedCatalogId?: string;
  originalCatalogData?: any;
  isUserEditedPostFill?: boolean;
  userEditWarning?: string;
}

export interface VATSnapshot {
  showVAT: boolean;
  showVat?: boolean;
  vatPercent: number;
  priceMode: 'beforeTax' | 'afterTax';
  subTotal: number;
  vatAmount: number;
  grandTotal: number;
}

export interface FormData {
  docNumber: string;
  title: string;
  date: string;
  location: string;
  bm02RequestContent?: string;
  bbntSenderCo?: string;
  bbntRepSender?: string;
  bbntStartTime?: string;
  bbntEndTime?: string;
  recipients: string[];
  grounds: string[];
  items: LineItem[];
  totalAmount: number;
  taxRate?: number;
  taxAmount?: number;
  totalWithTax?: number;
  totalAmountWithVat?: number;
  showVat?: boolean;
  showVAT?: boolean;
  isPostTax?: boolean;
  vatSnapshot?: VATSnapshot;
  originalFileName?: string;
  proposingCompany?: string;
  images?: string[];
  sourceType?: 'BM06' | 'PDF';
  selectedUnits?: { projectId: string; unitId: string; }[];
  unitPrice?: number;
  total?: number;
  // New fields from CauHinh
  phongKeToan?: string;
  nguoiLap?: string;
  giamDoc?: string;
  duyetHDTV?: string;
  benGiaoTen?: string;
  benGiaoChucVu?: string;
  benNhan1?: string;
  benNhan1ChucVu?: string;
  benNhan2?: string;
  benNhan2ChucVu?: string;
  mucDichSuDungNoiDung?: string;
  mucDichSuDungDiaDiem?: string;
  soTienBangChu?: string;
  isCustomSoTienBangChu?: boolean;
  requestContent?: string;
  thoiHanThanhToan?: string;
  projectId?: string;
  project_name?: string;
  unitId?: string;
  isGroupedDisplay?: boolean;
  displayMode?: string;
  maPhieu?: string;
  maPhieuNguon?: string;
  nguoiDeNghi?: string;
  pBanDeNghi?: string;
  chiHuyTruong?: string;
}

export interface BBNTItem {
  isProjectShared?: boolean;
  totalProjectUnits?: number;
  name?: string;
  quantity?: number;

  id: string;
  stt: number;
  description: string;
  unit: string;
  requestedQty: number;
  acceptedQty: number;
  unitPrice?: number;
  total?: number;
  note: string;
  projectId?: string;
  unitId?: string;
  isCustomAcceptedQty?: boolean;
}

export interface BBNTData {
  title?: string;
  formType?: 'BM03.2' | 'BM04' | string;
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  docNumber: string;
  location: string;
  bm02RequestContent?: string;
  bbntSenderCo?: string;
  bbntRepSender?: string;
  bbntStartTime?: string;
  bbntEndTime?: string;
  date: string;
  project: string;
  category: string;
  address: string;
  senderCompany: string;
  senderList: { name: string; position: string; salutation: string }[];
  receiverCompany: string;
  receiverList: BM032Representative[];
  startTime: string;
  startDate: string;
  endTime: string;
  endDate: string;
  locationDetail: string;
  grounds: string[];
  items: BBNTItem[];
  originalFileName?: string;
  images?: string[];
  sourceType?: 'BM06' | 'PDF';
  selectedUnits?: { projectId: string; unitId: string; }[];
  unitPrice?: number;
  total?: number;
  // New fields from CauHinh
  bbnt_phongKeToan?: string;
  bbnt_nguoiLap?: string;
  bbnt_giamDoc?: string;
  bbnt_duyetHDTV?: string;
  bbnt_benA_congTy?: string;
  bbnt_benA_daiDien?: string;
  bbnt_benB_congTy?: string;
  bbnt_benB_daiDien?: string;
  tenBenGiao?: string;
  tenBenNhan?: string;
  senderRepresentative?: string;
  senderPosition?: string;
  soHDNT?: string;
  ngayKyHD?: string;
  maBM02?: string;
  projectId?: string;
  project_name?: string;
  unitId?: string;
  isGroupedDisplay?: boolean;
  displayMode?: string;
  maPhieu?: string;
  maPhieuNguon?: string;
  nguoiDeNghi?: string;
  chiHuyTruong?: string;
}

export interface CauHinh {
  tieuDe: string;
  // BM02 Signing
  bm02_phongKeToan: string;
  bm02_nguoiLap: string;
  bm02_giamDoc: string;
  bm02_duyetHDTV: string;
  
  // BBNT Signing
  bbnt_kyTen_phongKeToan: string;
  bbnt_kyTen_nguoiLap: string;
  bbnt_kyTen_giamDoc: string;
  bbnt_kyTen_duyetHDTV: string;
  bbnt_benA_congTy: string;
  bbnt_benA_daiDien: string;
  bbnt_benB_congTy: string;
  bbnt_benB_daiDien: string;

  // Bên Giao/Nhận
  pkg_tenBenGiao: string;
  pkg_tenBenNhan: string;
  pkg_benGiaoTen: string;
  pkg_benGiaoChucVu: string;
  pkg_benNhan1: string;
  pkg_benNhan1ChucVu: string;
  pkg_benNhan2: string;
  pkg_benNhan2ChucVu: string;

  // BBNT Info
  bbnt_tenCongTrinh: string;
  bbnt_nhaTauThiCong: string;
  bbnt_nhaCungCap: string;
  bbnt_soHDNT: string;
  bbnt_ngayKyHD: string;
  bbnt_maBM02: string;
  canCu_coDinh: string;
  logo_base64?: string;
  logo_position?: string;
  bm02_kyTen_config?: string;
  pkg_benGiao_ds?: string;
  pkg_benNhan_ds?: string;
  bm06_truongBoPhan?: string;
  bm06_thuKho?: string;
  bm06_nguoiDeNghi?: string;

  // Legacy (keeping for compatibility if needed)
  pkg_phongKeToan?: string;
  pkg_nguoiLap?: string;
  pkg_giamDoc?: string;
  pkg_duyetHDTV?: string;

  [key: string]: string | undefined;
}

export interface MaterialPrice {
  id: string;
  tenVatTu: string;
  donVi: string;
  gia: { [key: string]: number };
}

export interface MaterialUnitTransaction {
  id: string;
  transactionId?: string;
  bm06Id: string;
  docNumber?: string;
  orderDate: string;
  projectId: string;
  unitId: string;
  estimateItemId?: string;
  masterEstimateItemId?: string;
  projectSharedId?: string;
  code?: string;
  materialName: string;
  name?: string;
  unit: string;
  specification?: string;
  
  // Snapshots
  estimatedQty: number;
  cumulativeQtyOld: number;
  cumulativeQtyBefore?: number;
  remainingQtyOld: number;
  remainingQtyBefore?: number;
  orderQty: number;
  lastOrderQty?: number;
  cumulativeQtyNew: number;
  cumulativeQty?: number;
  remainingQtyNew: number;
  remainingQty?: number;
  
  unitPrice: number;
  basePrice?: number;
  totalPrice: number;
  
  purpose?: string;
  proposer?: string;
  isProjectShared?: boolean;
  isGroupedDisplay?: boolean;
  sourceType?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface PriceUpdateLog {
  id: string;
  ngayCapNhat: string;
  tenFile: string;
  soLuongVatTu: number;
  ghiChu: string;
}

export interface MaterialPriceData {
  vatTu: MaterialPrice[];
  cotNgay: string[];
  headers: string[];
}

export const UNIT_OPTIONS = ['m3', 'ca', 'chuyến', 'cái', 'bộ', 'kg', 'lít', 'tấn', 'mét', 'm2', 'M3', 'bao', 'viên', 'thanh', 'cuộn', 'tấm', 'm2', 'm', 'kg', 'tấn', 'lít', 'm3'];

export interface MaterialType {
  id: string;
  ten: string;
  tenVietTat: string;
  icon: string;
  mauNen: string;
  tieuDeBM02: string;
  tieuDeBM032?: string;
  tieuDeBM04?: string;
  ngayTao?: string;
  trangThai?: string;
  bm06_truongBoPhan?: string;
  bm06_thuKho?: string;
  bm06_nguoiDeNghi?: string;
  sortOrder?: number;
}

export interface EstimateItem {
  id?: string;  // Will be UUID on first save
  projectId: string;
  unitPrice?: number;
  total?: number;
  unitId: string;
  code: string;  // Mã số
  name: string;  // Tên vật tư
  unit: string;  // ĐVT
  estimatedQty: number;  // Khối lượng dự toán
  basePrice: number;  // Giá gốc (optional)
  cumulativeQty: number;  // Lũy kế các kỳ
  remainingQty: number;  // Tồn = estimatedQty - cumulativeQty
  initialCumulativeQty?: number; // Lũy kế cũ ban đầu được nhập khi tạo lần đầu
  lastOrderDate?: string;
  lastOrderQty?: number;
  warningStatus: 'NORMAL' | 'NEARLY_EMPTY' | 'EXCEEDED';
  category?: string;
  notes?: string;
  specs?: string;
  isArchived?: boolean;
  createdAt: any;
  updatedAt: any;
  // Group-based Norms Architecture fields
  groupId?: string | null;
  isGroupedEstimate?: boolean;
  itemCumulativeQty?: number;
  itemLastOrderQty?: number;
  itemNote?: string;
  groupEstimatedQty?: number;
  groupRemainingQty?: number;
  groupName?: string;
  materialId?: string;
  // Project Shared Costs fields
  isProjectShared?: boolean;
  sourceType?: string;
  createdFrom?: string;
  projectSharedId?: string;
  totalProjectUnits?: number;
  appliedUnits?: string[];
  appliedUnitsDetails?: Array<{
    unitId: string;
    estimatedQty: number;
    cumulativeQty: number;
    remainingQty: number;
    lastOrderQty?: number;
    warningStatus?: string;
  }>;
  // Cumulative Adjustment fields
  adjustmentQty?: number;
  adjustmentReason?: string;
  adjustedBy?: string;
  adjustedAt?: string;
}

export interface EstimateGroup {
  groupId: string;
  projectId: string;
  unitPrice?: number;
  total?: number;
  unitId: string;
  materialTypeId: string;
  groupName: string;
  unit: string;
  estimatedQty: number;
  cumulativeQty: number;
  remainingQty: number;
  materialIds: string[];
  status: 'NORMAL' | 'NEARLY_EMPTY' | 'EXCEEDED';
  notes?: string;
  initialCumulativeQty?: number | null;
  initialCumulativeConfirmed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BM06FormData {
  id?: string;
  projectId: string; // Dynamic comma separated/joined units
  unitPrice?: number;
  total?: number;
  unitId: string;
  orderDate: string;
  purpose: string;
  location: string;
  bm02RequestContent?: string;
  bbntSenderCo?: string;
  bbntRepSender?: string;
  bbntStartTime?: string;
  bbntEndTime?: string;
  company: string;
  receiver: string;
  proposer: string;
  storekeeper: string;
  departmentHead: string;
  selectedItems: {
    estimateItemId: string;
    code: string;
    name: string;
    unit: string;
    specification: string;
    estimatedQty: number;
    cumulativeQtyOld: number;
    remainingQtyOld: number;
    orderQty: number;
    notes: string;
    unitPrice?: number;
  }[];
  sourceType?: 'BM06' | 'PDF';
}

export interface BM02Data extends FormData {
  sourceType: 'BM06' | 'PDF';
}

export interface BM032Data extends BBNTData {
  sourceType: 'BM06' | 'PDF';
}

declare global {
  interface Window {
    _cauHinh?: CauHinh;
    _danhSachVatTu?: MaterialType[];
    _loaiVatTuHienTai?: string;
    _cheDoQuanLy?: boolean;
    _refreshGrid?: () => void;
    _firebaseStatus?: string;
    _firebaseConfigDaLuu?: any;
    _firebaseConfigHopLe?: any;
    capNhatBadgeFirebase?: (status: string, msg?: string) => void;
    batCheDoQuanLy: () => void;
    tatCheDoQuanLy: () => void;
    thucHienAnVatTu: (id: string, ten: string, btnEl: HTMLButtonElement) => Promise<void>;
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface UserAccount {
  username: string;
  password?: string;
  role: UserRole;
  fullName?: string;
  hoTen?: string;
  createdAt?: number;
}

export interface ActivityLog {
  logId: string;
  username: string;
  role: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'IMPORT' | 'EXPORT' | 'DELETE_USER';
  module: 'Dự toán' | 'BM06' | 'BM02' | 'BM03.2' | 'Báo cáo' | 'Cấu hình' | 'Quản lý tài khoản & Quyền hạn';
  description: string;
  targetId?: string;
  targetUser?: string;
  beforeData?: any;
  afterData?: any;
  createdAt: number;
}

export interface BM06MaterialConfig {
  receiver: string;
  grounds: string[];
  defaultPurpose: string;
  defaultLocation: string;
  defaultUseDate: string;
  departmentHead: string;
  storekeeper: string;
  proposer: string;
  defaultNote: string;
}

export interface BM02MaterialConfig {
  title: string;
  recipients: string[];
  grounds: string[];
  requestContent: string;
  paymentTerm: string;
  accountant: string;
  preparer: string;
  director: string;
  approver: string;
  defaultNote: string;
  kyTenList?: any[];
}

export interface Personnel {
  id: string;
  gender: 'Ông' | 'Bà';
  fullName: string;
  defaultTitle: string;
  company: string;
  active: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface BM032Representative {
  id?: string;
  personnelId?: string;
  salutation: 'Ông' | 'Bà' | string;
  name: string;
  position: string;
  role?: string;
  company?: string;
  isExternal?: boolean;
}

export interface BM032MaterialConfig {
  title: string;
  titleBM04?: string;
  senderCompany: string;
  receiverCompany: string;
  senderRepresentatives: BM032Representative[];
  receiverRepresentatives: BM032Representative[];
  grounds: string[];
  defaultLocation: string;
  startTime: string;
  endTime: string;
  signers: string;
  defaultNote: string;
  tenCongTrinh?: string;
  nhaThauThiCong?: string;
  nhaCungCap?: string;
  soHDNT?: string;
  ngayKyHD?: string;
  maBM02?: string;
  bbnt_benA_congTy?: string;
  bbnt_benA_daiDien?: string;
  bbnt_benB_congTy?: string;
  bbnt_benB_daiDien?: string;
}

export interface MaterialTypeConfig {
  materialTypeId: string;
  name: string;
  bm06: BM06MaterialConfig;
  bm02: BM02MaterialConfig;
  bm032: BM032MaterialConfig;
  updatedAt?: number;
  updatedBy?: string;
}

export const LOAI_VAT_TU_MAC_DINH: MaterialType[] = [
  {
    id: "BeTong",
    ten: "Bê tông & Vữa",
    tenVietTat: "BTI",
    icon: "🏗️",
    mauNen: "#455a64",
    tieuDeBM02: "V/v: Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ"
  }
];


import React, { useState, useEffect } from 'react';
import { X, Save, RotateCcw, Copy, FileText, Check, AlertCircle, Eye, Upload, Trash2, Plus, ArrowUp, ArrowDown, Image, Layers, Settings, LayoutGrid } from 'lucide-react';
import { PersonnelDirectoryManager } from './PersonnelDirectoryManager';
import { subscribePersonnelDirectory, getLocalPersonnelList } from '../lib/personnelService';
import { getMaterialTypeConfig, saveMaterialTypeConfig, logActivity, firebaseAPI, logCopyMaterialConfigActivity } from '../lib/firebaseService';
import { MaterialType, UserAccount, MaterialTypeConfig } from '../../types';

// Default static signatures list for BM02 fallback
const KY_TEN_MAC_DINH = [
  { id: "kt_1", chucDanh: "PHÒNG KẾ TOÁN", hoTen: "Nguyễn Thị Minh Thư", viTri: 10 },
  { id: "kt_2", chucDanh: "NGƯỜI LẬP TỜ TRÌNH", hoTen: "Trần Nam Anh", viTri: 20 },
  { id: "kt_3", chucDanh: "GIÁM ĐỐC DUYỆT", hoTen: "Lê Hoàng Minh", viTri: 30 },
  { id: "kt_4", chucDanh: "DUYỆT HĐTV", hoTen: "Phạm Văn Nam", viTri: 40 }
];

// System fallback configurations for each material if no record exists in database
export const GET_FALLBACK_MATERIAL_CONFIG = (materialId: string, materialName: string): MaterialTypeConfig => {
  return {
    materialTypeId: materialId,
    name: materialName,
    bm06: {
      receiver: 'Ban Giám đốc Công ty TNHH MTV Xây Dựng IJC',
      grounds: [
        'Căn cứ Bản vẽ thiết kế kỹ thuật thi công và biện pháp thi công được duyệt;',
        'Căn cứ tiến độ thi công thực tế tại công trường;'
      ],
      defaultPurpose: `Cung cấp ${materialName.toLowerCase()} phục vụ công tác bê tông cốt thép hạng mục công trình.`,
      defaultLocation: 'Khu vực hạng mục đang thi công thuộc dự án.',
      defaultUseDate: 'Nhận vật tư luân phiên trong ngày hoặc theo tiến độ đổ.',
      departmentHead: 'Trần Thành Tài',
      storekeeper: 'Áp dụng đối với hoạt động thi công xây dựng',
      proposer: 'Trần Nam Anh',
      defaultNote: 'Bảo quản khô ráo, sử dụng đúng mục đích khảo sát.'
    },
    bm02: {
      title: 'Tờ trình về việc phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ',
      recipients: ['Ban Giám đốc Công ty TNHH MTV Xây Dựng IJC'],
      grounds: [
        `Căn cứ Phiếu đề nghị mua ${materialName.toLowerCase()} số QTMH-BM06 được duyệt;`,
        'Căn cứ vào bảng tính nhu cầu vật tư thiết kế kỹ thuật;',
        'Căn cứ đơn giá tối ưu từ nhà cung cấp liên kết;'
      ],
      requestContent: `Kính trình duyệt kinh phí cung ứng ${materialName.toLowerCase()} phục vụ công tác xây tô, kết cấu công trình đúng tiến độ cam kết.`,
      paymentTerm: 'Thanh toán đợt 1 ngay sau khi ký biên bản thanh toán nghiệm thu bàn giao.',
      accountant: 'Nguyễn Thị Minh Thư',
      preparer: 'Trần Nam Anh',
      director: 'Lê Hoàng Minh',
      approver: 'Phạm Văn Nam',
      defaultNote: 'Kính trình Ban Giám đốc xem xét phê duyệt.',
      kyTenList: JSON.parse(JSON.stringify(KY_TEN_MAC_DINH))
    },
    bm032: {
      title: 'BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO VẬT TƯ',
      titleBM04: 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
      senderCompany: 'ĐƠN VỊ CUNG CẤP',
      receiverCompany: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
      senderRepresentatives: [
        { name: 'Trần Nam Anh', position: 'Kỹ sư giám sát', salutation: 'Ông' }
      ],
      receiverRepresentatives: [
        { name: 'Nguyễn Xuân Nam', position: 'Giám đốc', salutation: 'Ông' },
        { name: 'Nguyễn Thị Thêm', position: 'Kế toán trưởng', salutation: 'Bà' },
        { name: 'Trần Kim Nguyện', position: 'Chỉ huy trưởng', salutation: 'Ông' },
        { name: 'Đỗ Huỳnh Linh Khoa', position: 'Thủ kho', salutation: 'Ông' },
        { name: 'Trần Nam Anh', position: 'NV Thu mua', salutation: 'Ông' }
      ],
      grounds: [
        'Căn cứ cam kết hợp đồng mua bán kinh tế ký kết giữa đại diện hai bên;',
        `Căn cứ kết quả kiểm tra thí nghiệm chất lượng ${materialName.toLowerCase()} bàn giao nhận tại công trình;`
      ],
      defaultLocation: 'Tại bãi tập kết vật tư hoặc vị trí lắp đặt chỉ định của Ban chỉ huy.',
      startTime: '08h30',
      endTime: '11h30',
      signers: 'Đại diện bên giao & Đại diện bên nhận',
      defaultNote: 'Vật tư đạt tiêu chuẩn bàn giao nghiệm thu đưa vào lắp đặt thi công.',
      tenCongTrinh: '',
      nhaThauThiCong: '',
      nhaCungCap: '',
      soHDNT: '',
      ngayKyHD: '',
      maBM02: '',
      bbnt_benA_congTy: 'ĐƠN VỊ CUNG CẤP',
      bbnt_benA_daiDien: '',
      bbnt_benB_congTy: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
      bbnt_benB_daiDien: ''
    }
  };
};

// Helper function to safely enrich any loaded config with fallback fields to prevent crashes
export const enrichMaterialConfig = (fetched: any, materialId: string, materialName: string): MaterialTypeConfig => {
  const fallback = GET_FALLBACK_MATERIAL_CONFIG(materialId, materialName);
  if (!fetched) return fallback;

  return {
    ...fallback,
    ...fetched,
    materialTypeId: materialId,
    name: materialName,
    bm06: {
      ...fallback.bm06,
      ...fetched.bm06,
      grounds: Array.isArray(fetched.bm06?.grounds) ? fetched.bm06.grounds : (fetched.bm06?.grounds ? [fetched.bm06.grounds] : [...fallback.bm06.grounds]),
      departmentHead: fetched.bm06?.departmentHead !== undefined ? fetched.bm06.departmentHead : fallback.bm06.departmentHead,
      storekeeper: fetched.bm06?.storekeeper !== undefined ? fetched.bm06.storekeeper : fallback.bm06.storekeeper,
      proposer: fetched.bm06?.proposer !== undefined ? fetched.bm06.proposer : fallback.bm06.proposer
    },
    bm02: {
      ...fallback.bm02,
      ...fetched.bm02,
      recipients: Array.isArray(fetched.bm02?.recipients) ? fetched.bm02.recipients : (fetched.bm02?.recipients ? [fetched.bm02.recipients] : [...fallback.bm02.recipients]),
      grounds: Array.isArray(fetched.bm02?.grounds) ? fetched.bm02.grounds : (fetched.bm02?.grounds ? [fetched.bm02.grounds] : [...fallback.bm02.grounds]),
      kyTenList: Array.isArray(fetched.bm02?.kyTenList) ? fetched.bm02.kyTenList : (fallback.bm02.kyTenList ? JSON.parse(JSON.stringify(fallback.bm02.kyTenList)) : JSON.parse(JSON.stringify(KY_TEN_MAC_DINH)))
    },
    bm032: {
      ...fallback.bm032,
      ...fetched.bm032,
      title: (fetched.bm032?.title && fetched.bm032.title.trim() !== '')
        ? fetched.bm032.title
        : (fallback.bm032?.title || 'BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO'),
      titleBM04: (fetched.bm032?.titleBM04 && fetched.bm032.titleBM04.trim() !== '')
        ? fetched.bm032.titleBM04
        : (fallback.bm032?.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ'),
      senderCompany: (() => {
        const candidates = [
          fetched.bm032?.senderCompany,
          fetched.pkg_tenBenGiao,
          fetched.bbnt_benA_congTy,
          fetched.bm032?.bbnt_benA_congTy,
          fetched.bm032?.nhaCungCap,
          fetched.bbnt_nhaCungCap,
          fetched.senderCompany,
          fetched.nhaCungCap
        ];
        for (const c of candidates) {
          if (c && typeof c === 'string') {
            const s = c.trim();
            if (s !== '' && !s.toUpperCase().includes('XÂY DỰNG IJC') && !s.toUpperCase().includes('XAY DUNG IJC') && s !== 'ĐƠN VỊ CUNG CẤP') {
              return s;
            }
          }
        }
        for (const c of candidates) {
          if (c && typeof c === 'string' && c.trim() !== '' && !c.toUpperCase().includes('IJC')) {
            return c.trim();
          }
        }
        return fallback.bm032.senderCompany;
      })(),
      senderRepresentatives: (() => {
        const candidates = [
          fetched.bm032?.senderRepresentatives,
          fetched.pkg_benGiao_ds,
          fetched.senderList
        ];
        for (const val of candidates) {
          if (Array.isArray(val) && val.length > 0) {
            const valid = val.filter((r: any) => r && typeof r.name === 'string' && r.name.trim() !== '');
            if (valid.length > 0) {
              return valid.map((r: any) => ({
                salutation: r.salutation || 'Ông',
                name: r.name.trim(),
                position: (r.position || '').trim()
              }));
            }
          }
          if (typeof val === 'string' && val.trim() !== '') {
            try {
              const parsed = JSON.parse(val);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const valid = parsed.filter((r: any) => r && typeof r.name === 'string' && r.name.trim() !== '');
                if (valid.length > 0) {
                  return valid.map((r: any) => ({
                    salutation: r.salutation || 'Ông',
                    name: r.name.trim(),
                    position: (r.position || '').trim()
                  }));
                }
              }
            } catch (e) {}
            const lines = val.split('\n').filter(l => l.trim()).map(line => {
              const parts = line.split('|').map(x => x.trim());
              return { salutation: parts[0] || 'Ông', name: parts[1] || '', position: parts[2] || '' };
            }).filter(r => r.name.trim() !== '');
            if (lines.length > 0) return lines;
          }
        }
        if (fetched.pkg_benGiaoTen && typeof fetched.pkg_benGiaoTen === 'string' && fetched.pkg_benGiaoTen.trim() !== '') {
          return [{ salutation: 'Ông', name: fetched.pkg_benGiaoTen.trim(), position: (fetched.pkg_benGiaoChucVu || '').trim() }];
        }
        if (fetched.bm032?.bbnt_benA_daiDien && typeof fetched.bm032.bbnt_benA_daiDien === 'string' && fetched.bm032.bbnt_benA_daiDien.trim() !== '') {
          return [{ salutation: 'Ông', name: fetched.bm032.bbnt_benA_daiDien.trim(), position: 'Đại diện bên giao' }];
        }
        if (fetched.bbnt_benA_daiDien && typeof fetched.bbnt_benA_daiDien === 'string' && fetched.bbnt_benA_daiDien.trim() !== '') {
          return [{ salutation: 'Ông', name: fetched.bbnt_benA_daiDien.trim(), position: 'Đại diện bên giao' }];
        }
        return [...(fallback.bm032.senderRepresentatives || [])];
      })(),
      receiverCompany: (fetched.bm032?.receiverCompany && fetched.bm032.receiverCompany.trim() !== '')
        ? fetched.bm032.receiverCompany
        : (fetched.bm032?.bbnt_benB_congTy || fetched.bbnt_benB_congTy || fetched.receiverCompany || fallback.bm032.receiverCompany),
      receiverRepresentatives: (() => {
        const val = fetched.bm032?.receiverRepresentatives || fetched.pkg_benNhan_ds || fetched.receiverList;
        if (Array.isArray(val) && val.length > 0 && val.length <= 5) return val;
        if (typeof val === 'string' && val.trim() !== '') {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          } catch (e) {}
          return val.split('\n').filter(l => l.trim()).map(line => {
            const parts = line.split('|').map(x => x.trim());
            return { salutation: parts[0] || 'Ông', name: parts[1] || '', position: parts[2] || '' };
          });
        }
        return [...(fallback.bm032.receiverRepresentatives || [])];
      })(),
      grounds: Array.isArray(fetched.bm032?.grounds) ? fetched.bm032.grounds : (fetched.bm032?.grounds ? [fetched.bm032.grounds] : [...fallback.bm032.grounds]),
      tenCongTrinh: fetched.bm032?.tenCongTrinh !== undefined ? fetched.bm032.tenCongTrinh : fallback.bm032.tenCongTrinh,
      nhaThauThiCong: fetched.bm032?.nhaThauThiCong !== undefined ? fetched.bm032.nhaThauThiCong : fallback.bm032.nhaThauThiCong,
      nhaCungCap: fetched.bm032?.nhaCungCap !== undefined ? fetched.bm032.nhaCungCap : fallback.bm032.nhaCungCap,
      soHDNT: fetched.bm032?.soHDNT !== undefined ? fetched.bm032.soHDNT : fallback.bm032.soHDNT,
      ngayKyHD: fetched.bm032?.ngayKyHD !== undefined ? fetched.bm032.ngayKyHD : fallback.bm032.ngayKyHD,
      maBM02: fetched.bm032?.maBM02 !== undefined ? fetched.bm032.maBM02 : fallback.bm032.maBM02,
      bbnt_benA_congTy: fetched.bm032?.bbnt_benA_congTy !== undefined ? fetched.bm032.bbnt_benA_congTy : fallback.bm032.bbnt_benA_congTy,
      bbnt_benA_daiDien: fetched.bm032?.bbnt_benA_daiDien !== undefined ? fetched.bm032.bbnt_benA_daiDien : fallback.bm032.bbnt_benA_daiDien,
      bbnt_benB_congTy: fetched.bm032?.bbnt_benB_congTy !== undefined ? fetched.bm032.bbnt_benB_congTy : fallback.bm032.bbnt_benB_congTy,
      bbnt_benB_daiDien: fetched.bm032?.bbnt_benB_daiDien !== undefined ? fetched.bm032.bbnt_benB_daiDien : fallback.bm032.bbnt_benB_daiDien
    }
  };
};

// Helper to perform a selective merge of two configurations based on chosen options
export const performSelectiveMerge = (
  source: MaterialTypeConfig,
  target: MaterialTypeConfig,
  sourceName: string,
  targetName: string,
  options: {
    bm02General: boolean;
    bm02Signatures: boolean;
    bm06General: boolean;
    bm032General: boolean;
    bm032Representatives: boolean;
    bm032Grounds: boolean;
  }
): MaterialTypeConfig => {
  const merged = JSON.parse(JSON.stringify(target)) as MaterialTypeConfig;

  // Contextually adapt terms: replace mentions of sourceName with targetName
  const adaptText = (val: any): any => {
    if (typeof val === 'string') {
      let res = val;
      if (sourceName && targetName) {
        // 1. First replace exact full source name with full target name
        const escSource = sourceName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        res = res.replace(new RegExp(escSource, 'gi'), targetName);

        // 2. Extract generic names
        const srcGeneric = sourceName.split('-')[0].trim().toLowerCase(); // e.g. "bê tông"
        const tgtGeneric = targetName.split('-')[0].trim().toLowerCase(); // e.g. "gạch", "xi măng"

        if (srcGeneric && tgtGeneric && srcGeneric !== tgtGeneric) {
          // Case a: Uppercase "BÊ TÔNG" -> "GẠCH"
          const srcUpper = srcGeneric.toUpperCase();
          const tgtUpper = tgtGeneric.toUpperCase();
          const escUpper = srcUpper.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          res = res.replace(new RegExp(escUpper, 'g'), tgtUpper);

          // Case b: Capitalized "Bê tông" -> "Gạch"
          const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          const srcCap = capitalize(srcGeneric);
          const tgtCap = capitalize(tgtGeneric);
          const escCap = srcCap.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          res = res.replace(new RegExp(escCap, 'g'), tgtCap);

          // Case c: Lowercase "bê tông" -> "gạch"
          const escLower = srcGeneric.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          res = res.replace(new RegExp(escLower, 'g'), tgtGeneric);
        }
      }
      return res;
    } else if (Array.isArray(val)) {
      return val.map(item => adaptText(item));
    } else if (val !== null && typeof val === 'object') {
      const copy: any = {};
      for (const k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) {
          if (k === 'materialTypeId' || k === 'name' || k === 'id') {
            copy[k] = val[k];
          } else {
            copy[k] = adaptText(val[k]);
          }
        }
      }
      return copy;
    }
    return val;
  };

  // BM02 General
  if (options.bm02General && source.bm02) {
    merged.bm02 = {
      ...merged.bm02,
      title: adaptText(source.bm02.title || ''),
      recipients: adaptText(source.bm02.recipients || []),
      requestContent: adaptText(source.bm02.requestContent || ''),
      paymentTerm: adaptText(source.bm02.paymentTerm || ''),
      defaultNote: adaptText(source.bm02.defaultNote || ''),
      grounds: adaptText(source.bm02.grounds || []),
      accountant: adaptText(source.bm02.accountant || ''),
      preparer: adaptText(source.bm02.preparer || ''),
      director: adaptText(source.bm02.director || ''),
      approver: adaptText(source.bm02.approver || '')
    };
  }

  // BM02 Signatures
  if (options.bm02Signatures && source.bm02) {
    merged.bm02 = {
      ...merged.bm02,
      kyTenList: adaptText(source.bm02.kyTenList || [])
    };
  }

  // BM06 General
  if (options.bm06General && source.bm06) {
    merged.bm06 = {
      ...merged.bm06,
      receiver: adaptText(source.bm06.receiver || ''),
      grounds: adaptText(source.bm06.grounds || []),
      defaultPurpose: adaptText(source.bm06.defaultPurpose || ''),
      defaultLocation: adaptText(source.bm06.defaultLocation || ''),
      defaultUseDate: adaptText(source.bm06.defaultUseDate || ''),
      proposer: adaptText(source.bm06.proposer || ''),
      storekeeper: adaptText(source.bm06.storekeeper || ''),
      departmentHead: adaptText(source.bm06.departmentHead || ''),
      defaultNote: adaptText(source.bm06.defaultNote || '')
    };
  }

  // BM03.2 General
  if (options.bm032General && source.bm032) {
    merged.bm032 = {
      ...merged.bm032,
      title: adaptText(source.bm032.title || ''),
      titleBM04: adaptText(source.bm032.titleBM04 || ''),
      senderCompany: adaptText(source.bm032.senderCompany || ''),
      receiverCompany: adaptText(source.bm032.receiverCompany || ''),
      defaultLocation: adaptText(source.bm032.defaultLocation || ''),
      startTime: adaptText(source.bm032.startTime || ''),
      endTime: adaptText(source.bm032.endTime || ''),
      signers: adaptText(source.bm032.signers || ''),
      defaultNote: adaptText(source.bm032.defaultNote || ''),
      tenCongTrinh: adaptText(source.bm032.tenCongTrinh || ''),
      nhaThauThiCong: adaptText(source.bm032.nhaThauThiCong || ''),
      nhaCungCap: adaptText(source.bm032.nhaCungCap || ''),
      soHDNT: adaptText(source.bm032.soHDNT || ''),
      ngayKyHD: adaptText(source.bm032.ngayKyHD || ''),
      maBM02: adaptText(source.bm032.maBM02 || ''),
      bbnt_benA_congTy: adaptText(source.bm032.bbnt_benA_congTy || ''),
      bbnt_benA_daiDien: adaptText(source.bm032.bbnt_benA_daiDien || ''),
      bbnt_benB_congTy: adaptText(source.bm032.bbnt_benB_congTy || ''),
      bbnt_benB_daiDien: adaptText(source.bm032.bbnt_benB_daiDien || '')
    };
  }

  // BM03.2 Representatives
  if (options.bm032Representatives && source.bm032) {
    merged.bm032 = {
      ...merged.bm032,
      senderRepresentatives: adaptText(source.bm032.senderRepresentatives || []),
      receiverRepresentatives: adaptText(source.bm032.receiverRepresentatives || [])
    };
  }

  // BM03.2 Grounds
  if (options.bm032Grounds && source.bm032) {
    merged.bm032 = {
      ...merged.bm032,
      grounds: adaptText(source.bm032.grounds || [])
    };
  }

  return merged;
};

interface MaterialContentConfigModalProps {
  onClose: () => void;
  currentUser: UserAccount | null;
  danhSachVatTu: MaterialType[];
}

export default function MaterialContentConfigModal({ 
  onClose, 
  currentUser, 
  danhSachVatTu 
}: MaterialContentConfigModalProps) {
  // Top-level tabs: 'general' (Chữ ký / chung) & 'material' (Nội dung cố định)
  const [configTab, setConfigTab] = useState<'general' | 'material'>('general');

  const [activeMaterial, setActiveMaterial] = useState<MaterialType>(
    danhSachVatTu.filter(item => item.trangThai !== 'hidden')[0] || danhSachVatTu[0]
  );
  
  const [activeTab, setActiveTab] = useState<'BM02' | 'BM03.2'>('BM02');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  
  // Tab 1 state: General configurations / signatures
  const [generalLogo, setGeneralLogo] = useState('');
  const [generalLogoPos, setGeneralLogoPos] = useState('left');
  const [generalDeptHead, setGeneralDeptHead] = useState('Trần Thành Tài');
  const [generalStorekeeper, setGeneralStorekeeper] = useState('Áp dụng đối với hoạt động thi công xây dựng');
  const [generalProposer, setGeneralProposer] = useState('Trần Nam Anh');

  // Tab 2 state: Material specific configurations
  const [config, setConfig] = useState<MaterialTypeConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<MaterialTypeConfig | null>(null);
  
  const [errorMess, setErrorMess] = useState<string | null>(null);
  const [successMess, setSuccessMess] = useState<string | null>(null);

  // Brand configurations (BTI Smart)
  const [brandWhiteText, setBrandWhiteText] = useState('BTI');
  const [brandColorText, setBrandColorText] = useState('Smart');
  const [brandLogo, setBrandLogo] = useState('');

  // Batch copy configurations
  const [showBatchCopyModal, setShowBatchCopyModal] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [copyOptions, setCopyOptions] = useState({
    bm02General: true,
    bm02Signatures: true,
    bm06General: true,
    bm032General: true,
    bm032Representatives: true,
    bm032Grounds: true,
  });

  const canUserWrite = currentUser?.role === 'admin' || currentUser?.role === 'editor';
  const isUserAdmin = currentUser?.role === 'admin';

  // Load General Configuration for Tab 1
  useEffect(() => {
    const ch = (window as any)._cauHinh || {};
    setGeneralLogo(ch.logo_base64 || '');
    setGeneralLogoPos(ch.logo_position || 'left');
    setGeneralDeptHead(ch.bm06_truongBoPhan || 'Trần Thành Tài');
    setGeneralStorekeeper(ch.bm06_thuKho || 'Áp dụng đối với hoạt động thi công xây dựng');
    setGeneralProposer(ch.bm06_nguoiDeNghi || 'Trần Nam Anh');

    // Load brand configurations from RTDB
    const loadBrandConfig = async () => {
      try {
        const data = await firebaseAPI.getCauHinh('brandConfig');
        if (data) {
          setBrandWhiteText(data.whiteText || 'BTI');
          setBrandColorText(data.colorText || 'Smart');
          setBrandLogo(data.logoBase64 || '');
        }
      } catch (err) {
        console.error("Lỗi khi tải cấu hình thương hiệu:", err);
      }
    };
    loadBrandConfig();
  }, []);

  // Load material specific configuration whenever active Material type changes
  useEffect(() => {
    const loadConfig = async () => {
      if (!activeMaterial) return;
      setLoading(true);
      setErrorMess(null);
      try {
        const fetched = await getMaterialTypeConfig(activeMaterial.id);
        const enriched = enrichMaterialConfig(fetched, activeMaterial.id, activeMaterial.ten);

        setConfig(enriched);
        setOriginalConfig(JSON.parse(JSON.stringify(enriched)));
      } catch (err: any) {
        console.error("Lỗi khi tải cấu hình nội dung cố định:", err);
        setErrorMess("Không thể tải cấu hình từ Firestore.");
      } finally {
        setLoading(false);
      }
    };
    if (configTab === 'material') {
      loadConfig();
    }
  }, [activeMaterial, configTab]);

  // Handle Logo Upload base64 conversion
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) {
        alert("Kích thước tệp logo quá lớn! Vui lòng chọn tệp dưới 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setGeneralLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // State Save handlers
  const handleSaveGeneral = async () => {
    if (!canUserWrite) {
      setErrorMess("Bạn không có quyền chỉnh sửa cấu hình này (Editor/Admin).");
      return;
    }
    setSaving(true);
    setErrorMess(null);
    setSuccessMess(null);

    try {
      // 1. Save brand configuration to RTDB
      const brandData = {
        whiteText: brandWhiteText,
        colorText: brandColorText,
        logoBase64: brandLogo
      };
      await firebaseAPI.saveCauHinh('brandConfig', brandData);
      (window as any)._brandConfig = brandData;
      window.dispatchEvent(new CustomEvent('brandConfigUpdated', { detail: brandData }));

      const updatedGeneral = {
        logo_base64: generalLogo,
        logo_position: generalLogoPos,
        bm06_truongBoPhan: generalDeptHead,
        bm06_thuKho: generalStorekeeper,
        bm06_nguoiDeNghi: generalProposer
      };

      // Propagation: Save to RTDB and Firestore for ALL material types
      for (const vt of danhSachVatTu) {
        // Update RTDB config
        const existing = await firebaseAPI.getCauHinh(vt.id) || {};
        const merged = {
          ...existing,
          ...updatedGeneral
        };
        await firebaseAPI.saveCauHinh(vt.id, merged);

        // Update Firestore config so each material type's fixed content inherits these signatures immediately
        const existingFirestore = await getMaterialTypeConfig(vt.id);
        const mergedFirestore = existingFirestore ? { ...existingFirestore } : GET_FALLBACK_MATERIAL_CONFIG(vt.id, vt.ten);
        
        if (!mergedFirestore.bm06) {
          mergedFirestore.bm06 = {};
        }
        mergedFirestore.bm06.departmentHead = generalDeptHead;
        mergedFirestore.bm06.storekeeper = generalStorekeeper;
        mergedFirestore.bm06.proposer = generalProposer;

        await saveMaterialTypeConfig(vt.id, mergedFirestore);
      }

      // Sync the parent context configurations
      (window as any)._cauHinh = {
        ...((window as any)._cauHinh || {}),
        ...updatedGeneral
      };

      // Also sync the current in-memory material configuration
      const currentId = (window as any)._loaiVatTuHienTai || 'BeTong';
      const updatedActiveConfig = await getMaterialTypeConfig(currentId);
      if (updatedActiveConfig) {
        (window as any)._currentMaterialConfig = updatedActiveConfig;
      }

      // Also sync to local storage to prevent obsolete overrides
      localStorage.setItem('bm06_dept_head', generalDeptHead);
      localStorage.setItem('bm06_storekeeper', generalStorekeeper);
      localStorage.setItem('bm06_proposer', generalProposer);

      // Trigger immediate form config propagation for active docs
      if (typeof (window as any).applyCauHinhToForms === 'function') {
        (window as any).applyCauHinhToForms((window as any)._cauHinh);
      }

      // Dispatch global event for instant reactivity across forms (e.g., BM06 page)
      window.dispatchEvent(new CustomEvent('globalConfigUpdated'));

      setSuccessMess("Đã lưu cấu hình chữ ký/chung và cấu hình thương hiệu thành công cho tất cả các loại vật tư!");
      
      await logActivity(
        currentUser?.username || 'System',
        currentUser?.role || 'viewer',
        'UPDATE',
        'Cấu hình',
        `Cập nhật cấu hình chữ ký/chung (LOGO & Chữ ký BM06) cho toàn bộ danh sách vật tư`,
        'general_config',
        null,
        updatedGeneral
      );

      setTimeout(() => setSuccessMess(null), 4000);
    } catch (err: any) {
      setErrorMess(`Lưu cấu hình chung thất bại: ${err.message || String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMaterial = async () => {
    if (!config || !activeMaterial) return;
    if (!canUserWrite) {
      setErrorMess("Bạn không có quyền chỉnh sửa cấu hình này (Editor/Admin).");
      return;
    }

    setSaving(true);
    setErrorMess(null);
    setSuccessMess(null);

    try {
      const finalConfigToSave: MaterialTypeConfig = {
        ...config
      };

      const isSuccess = await saveMaterialTypeConfig(activeMaterial.id, finalConfigToSave);
      if (isSuccess) {
        setConfig(finalConfigToSave);
        // Automatically sync to _currentMaterialConfig in memory if this is the active material
        const activeLoai = (window as any)._loaiVatTuHienTai;
        if (!activeLoai || activeLoai === activeMaterial.id) {
          (window as any)._currentMaterialConfig = finalConfigToSave;
          if (typeof (window as any).applyMaterialConfigToForms === 'function') {
            (window as any).applyMaterialConfigToForms(finalConfigToSave);
          }
          // Dispatch event so that current active form reacts instantly
          window.dispatchEvent(new CustomEvent('globalConfigUpdated'));
        }

        setSuccessMess(`Đã lưu cấu hình nội dung cố định cho ${activeMaterial.ten} thành công!`);
        
        await logActivity(
          currentUser?.username || 'System',
          currentUser?.role || 'viewer',
          'UPDATE',
          'Cấu hình',
          `Cập nhật cấu hình nội dung cố định cho: ${activeMaterial.ten}`,
          activeMaterial.id,
          originalConfig,
          finalConfigToSave
        );
        
        setOriginalConfig(JSON.parse(JSON.stringify(finalConfigToSave)));
        setTimeout(() => setSuccessMess(null), 4000);
      } else {
        setErrorMess("Có lỗi xảy ra khi ghi đè dữ liệu lên Firestore.");
      }
    } catch (err: any) {
      setErrorMess(`Lưu cấu hình thất bại: ${err.message || String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    if (!isUserAdmin) {
      setErrorMess("Chỉ Quản trị viên mới có quyền khôi phục mặc định hệ thống.");
      return;
    }
    if (!activeMaterial || !config) return;

    if (window.confirm(`Bạn có chắc muốn khôi phục cấu hình nội dung mặc định ban đầu cho vật tư ${activeMaterial.ten}? Mọi thay đổi tùy chỉnh sẽ bị xóa bỏ.`)) {
      const fallback = GET_FALLBACK_MATERIAL_CONFIG(activeMaterial.id, activeMaterial.ten);
      setConfig(fallback);
      setSuccessMess("Đã hoàn tất tải nội dung mặc định. Vui lòng bấm 'Lưu cấu hình' để lưu thay đổi.");
      setTimeout(() => setSuccessMess(null), 3500);
    }
  };

  const handleApplyConfigToSelectedMaterials = async () => {
    setErrorMess(null);
    setSuccessMess(null);

    // 1. Check if source material is available
    const sourceMaterial = activeMaterial || 
                           danhSachVatTu.find(v => v.ten === "Bê Tông-TDC") || 
                           danhSachVatTu.find(v => v.id === "BeTong") ||
                           danhSachVatTu.find(v => v.ten.includes("Bê Tông"));

    if (!sourceMaterial) {
      setErrorMess("Không tìm thấy cấu hình nguồn Bê Tông-TDC.");
      return;
    }

    // 2. Check if at least 1 destination material is selected
    if (batchSelectedIds.length === 0) {
      setErrorMess("Chưa chọn vật tư đích.");
      return;
    }

    // 3. Check if at least 1 config section/option is selected
    const isAnyOptionSelected = Object.values(copyOptions).some(v => v);
    if (!isAnyOptionSelected) {
      setErrorMess("Chưa chọn nhóm cấu hình cần sao chép.");
      return;
    }

    if (!canUserWrite) {
      setErrorMess("Bạn không có quyền chỉnh sửa cấu hình này (Editor/Admin).");
      return;
    }

    setSaving(true);

    try {
      // 4. Fetch source config directly from Firebase (no temporary/intermediate state)
      const sourceFetched = await getMaterialTypeConfig(sourceMaterial.id);
      if (!sourceFetched) {
        setErrorMess("Không tìm thấy cấu hình nguồn Bê Tông-TDC.");
        setSaving(false);
        return;
      }
      
      const sourceConfig = enrichMaterialConfig(sourceFetched, sourceMaterial.id, sourceMaterial.ten);

      let successCount = 0;
      const targetMaterialNames: string[] = [];

      // 5. Copy configuration to selected destination materials
      for (const targetId of batchSelectedIds) {
        const targetVatTu = danhSachVatTu.find(v => v.id === targetId);
        if (!targetVatTu) continue;
        targetMaterialNames.push(targetVatTu.ten);

        // Fetch current target config to merge selectively
        const targetFetched = await getMaterialTypeConfig(targetId);
        const targetConfig = enrichMaterialConfig(targetFetched, targetId, targetVatTu.ten);

        // Merge and translate terms automatically
        const mergedData = performSelectiveMerge(
          sourceConfig,
          targetConfig,
          sourceMaterial.ten,
          targetVatTu.ten,
          copyOptions
        );

        // Save back to Firebase
        const isSuccess = await saveMaterialTypeConfig(targetId, mergedData);
        if (isSuccess) {
          successCount++;
        } else {
          throw new Error(`Ghi Firebase thất bại cho vật tư ${targetVatTu.ten}`);
        }
      }

      // 6. Reload active configuration in the UI immediately
      if (activeMaterial && activeMaterial.id === sourceMaterial.id) {
        const refreshedFetched = await getMaterialTypeConfig(sourceMaterial.id);
        const refreshedConfig = enrichMaterialConfig(refreshedFetched, sourceMaterial.id, sourceMaterial.ten);
        setConfig(refreshedConfig);
        setOriginalConfig(JSON.parse(JSON.stringify(refreshedConfig)));
      }

      // Sync window configuration cache for the main application
      const currentId = (window as any)._loaiVatTuHienTai || 'BeTong';
      const activeFetchedForMain = await getMaterialTypeConfig(currentId);
      if (activeFetchedForMain) {
        const activeEnriched = enrichMaterialConfig(activeFetchedForMain, currentId, 
          danhSachVatTu.find(v => v.id === currentId)?.ten || currentId
        );
        (window as any)._currentMaterialConfig = activeEnriched;
      }

      // Refresh any target configurations in memory if they were currently selected in main app
      if (batchSelectedIds.includes(currentId)) {
        const refreshedTarget = await getMaterialTypeConfig(currentId);
        if (refreshedTarget) {
          (window as any)._currentMaterialConfig = enrichMaterialConfig(refreshedTarget, currentId,
            danhSachVatTu.find(v => v.id === currentId)?.ten || currentId
          );
        }
      }

      // Dispatch event to update UI immediately
      window.dispatchEvent(new CustomEvent('globalConfigUpdated'));

      // 7. Show success message
      setSuccessMess(`Đã áp dụng cấu hình từ '${sourceMaterial.ten}' sang ${successCount} vật tư.`);
      setBatchSelectedIds([]);

      // 8. Log activity logs
      const selectedSectionsList = Object.keys(copyOptions).filter(
        k => copyOptions[k as keyof typeof copyOptions]
      );

      // Create detailed activity log description
      const description = `Áp dụng cấu hình từ ${sourceMaterial.ten} sang ${successCount} vật tư: ${targetMaterialNames.join(', ')}. Các mục đã chọn: ${selectedSectionsList.join(', ')}`;
      
      await logCopyMaterialConfigActivity(
        currentUser?.username || 'System',
        currentUser?.role || 'viewer',
        sourceMaterial.id,
        sourceMaterial.ten,
        batchSelectedIds,
        targetMaterialNames,
        selectedSectionsList,
        description
      );

      setTimeout(() => {
        setSuccessMess(null);
      }, 5000);

    } catch (err: any) {
      console.error("Lỗi khi áp dụng cấu hình vật tư hàng loạt:", err);
      setErrorMess("Không thể áp dụng cấu hình. Vui lòng kiểm tra Firebase.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFromOther = () => {
    if (!copySourceId || !config) return;
    const sourceVatTu = danhSachVatTu.find(v => v.id === copySourceId);
    if (!sourceVatTu) return;

    const isAnyOptionSelected = Object.values(copyOptions).some(v => v);
    if (!isAnyOptionSelected) {
      alert("Vui lòng chọn ít nhất một đầu mục nội dung cần sao chép.");
      return;
    }

    if (window.confirm(`Bạn có đồng ý sao chép các đầu mục cấu hình đã chọn từ loại vật tư '${sourceVatTu.ten}' đè vào '${activeMaterial.ten}' đang thiết lập?`)) {
      setLoading(true);
      setErrorMess(null);
      setSuccessMess(null);
      
      getMaterialTypeConfig(copySourceId).then((fetched) => {
        const sourceConfig = enrichMaterialConfig(fetched, copySourceId, sourceVatTu.ten);
        
        const mergedData = performSelectiveMerge(
          sourceConfig,
          config,
          sourceVatTu.ten,
          activeMaterial.ten,
          copyOptions
        );
        
        setConfig(mergedData);
        setCopySourceId('');
        setSuccessMess(`Đã sao chép và tự động tối ưu hóa các nội dung được chọn từ '${sourceVatTu.ten}' sang '${activeMaterial.ten}'. Vui lòng kiểm tra và bấm 'Lưu cấu hình' để lưu thay đổi.`);
      }).catch(err => {
        console.error("Lỗi khi sao chép cấu hình vật tư:", err);
        setErrorMess("Không thể tải cấu hình nguồn để sao chép.");
      }).finally(() => {
        setLoading(false);
      });
    }
  };

  // Field update helpers
  const updateBM06Field = (key: keyof typeof config.bm06, value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      bm06: {
        ...config.bm06,
        [key]: value
      }
    });
  };

  const updateBM02Field = (key: keyof typeof config.bm02, value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      bm02: {
        ...config.bm02,
        [key]: value
      }
    });
  };

  const updateBM032Field = (key: keyof typeof config.bm032, value: any) => {
    if (!config) return;
    const nextBM032 = {
      ...config.bm032,
      [key]: value
    };
    if (key === 'senderCompany') {
      nextBM032.bbnt_benA_congTy = value;
      nextBM032.nhaCungCap = value;
    }
    if (key === 'nhaCungCap') {
      nextBM032.bbnt_benA_congTy = value;
      nextBM032.senderCompany = value;
    }
    if (key === 'receiverCompany') {
      nextBM032.bbnt_benB_congTy = value;
    }
    if (key === 'nhaThauThiCong') {
      nextBM032.bbnt_benB_congTy = value;
    }
    setConfig({
      ...config,
      bm032: nextBM032
    });
  };

  // Dynamic signature list helpers for BM02
  const addBM02Signature = () => {
    if (!config) return;
    const currentList = config.bm02.kyTenList || [];
    const newSig = {
      id: "kt_" + Date.now(),
      chucDanh: "CHỨC DANH MỚI",
      hoTen: "Họ và Tên",
      viTri: (currentList.length + 1) * 10
    };
    updateBM02Field('kyTenList', [...currentList, newSig]);
  };

  const deleteBM02Signature = (id: string) => {
    if (!config) return;
    const currentList = config.bm02.kyTenList || [];
    if (currentList.length <= 1) {
      alert("Phải giữ lại ít nhất 1 chữ ký hiển thị trên Tờ trình.");
      return;
    }
    updateBM02Field('kyTenList', currentList.filter(s => s.id !== id));
  };

  const updateBM02SigField = (id: string, field: 'chucDanh' | 'hoTen', val: string) => {
    if (!config) return;
    const currentList = config.bm02.kyTenList || [];
    const updated = currentList.map(s => {
      if (s.id === id) {
        return { ...s, [field]: val };
      }
      return s;
    });
    updateBM02Field('kyTenList', updated);
  };

  const moveBM02Signature = (index: number, dir: 'up' | 'down') => {
    if (!config) return;
    const currentList = [...(config.bm02.kyTenList || [])];
    const targetIdx = dir === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;

    const temp = currentList[index];
    currentList[index] = currentList[targetIdx];
    currentList[targetIdx] = temp;

    // Recalculate position indexes
    const updated = currentList.map((s, idx) => ({ ...s, viTri: (idx + 1) * 10 }));
    updateBM02Field('kyTenList', updated);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex flex-col justify-center items-center p-4 overflow-hidden animate-fade-in text-slate-100 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col w-full max-w-6xl h-full max-h-[90vh] overflow-hidden">
        
        {/* HEADER BAR */}
        <header className="p-4 md:p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600/20 p-2 rounded-xl text-indigo-400">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-white text-md md:text-lg uppercase tracking-tight">CẤU HÌNH NỘI DUNG VT</h2>
              <p className="text-slate-400 text-xs font-medium">Hệ thống quản lý logo công ty, các chữ ký đại diện phê duyệt và các biểu mẫu cố định</p>
            </div>
          </div>

          {/* TWO MAIN NAVIGATION CONFIGURATION TABS */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 self-start">
            <button
              onClick={() => { setConfigTab('general'); setShowPreview(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                configTab === 'general' 
                  ? 'bg-indigo-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers size={14} /> Chữ ký / chung
            </button>
            <button
              onClick={() => { setConfigTab('material'); setShowPreview(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                configTab === 'material' 
                  ? 'bg-indigo-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText size={14} /> Nội dung cố định
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg hover:text-white transition-all border border-slate-700 flex items-center gap-1.5 uppercase tracking-wide cursor-pointer ml-auto md:ml-0"
          >
            <X size={15} /> Đóng lại
          </button>
        </header>

        {/* NOTIFICATIONS BAR */}
        {errorMess && (
          <div className="bg-red-500/10 border-b border-red-500/20 p-3 px-6 flex items-center gap-3 text-red-400 text-xs font-semibold">
            <AlertCircle size={16} /> {errorMess}
          </div>
        )}
        {successMess && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 p-3 px-6 flex items-center gap-3 text-emerald-400 text-xs font-semibold">
            <Check size={16} /> {successMess}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          
          {/* TAB 1: GENERAL CONFIGURATION (LOGO & BM06 MAC DINH) */}
          {configTab === 'general' ? (
            <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900/40">
              <div className="max-w-3xl mx-auto space-y-6">
                
                {/* LOGO PANEL */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 md:p-6 space-y-4">
                  <h3 className="text-sm font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                    <Image size={16} /> 1. Logo công ty làm tiêu đề biểu mẫu
                  </h3>
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                    {/* Logo Display Image */}
                    <div className="w-32 h-32 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 relative group">
                      {generalLogo ? (
                        <>
                          <img src={generalLogo} alt="Company Logo" className="max-w-full max-h-full object-contain p-2" />
                          <button 
                            onClick={() => setGeneralLogo('')}
                            title="Xóa bỏ logo đang chọn"
                            className="absolute inset-0 bg-red-950/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold text-xs cursor-pointer"
                          >
                            <Trash2 size={16} /> Xóa logo
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-600 text-xs font-medium text-center px-4 italic leading-snug">Chưa tải lên Logo</span>
                      )}
                    </div>

                    <div className="flex-1 space-y-3 w-full">
                      <p className="text-slate-400 text-xs">
                        Logo tải lên sẽ xuất hiện tại phần tiêu đề trên cùng của mọi biểu mẫu xuất Word/Excel (Đề nghị BM06, Tờ trình BM02, Bàn giao BM03.2).
                        Hỗ trợ PNG, JPG, SVG, WEBP dung lượng tối đa 500KB.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-500/10">
                          <Upload size={14} /> Tải logo từ thiết bị
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {generalLogo && (
                          <button 
                            onClick={() => setGeneralLogo('')}
                            className="px-3.5 py-2 hover:bg-slate-800 border border-red-900/50 text-red-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Xóa logo
                          </button>
                        )}
                      </div>

                      {/* Logo position selection */}
                      <div className="pt-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vị trí căn lề Logo trên biểu mẫu</label>
                        <select 
                          value={generalLogoPos} 
                          onChange={(e) => setGeneralLogoPos(e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-semibold focus:outline-none focus:border-indigo-500"
                        >
                          <option value="left">Căn Lề Trái</option>
                          <option value="center">Căn Giữa</option>
                          <option value="right">Căn Lề Phải</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BRAND CONFIGURATION PANEL */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 md:p-6 space-y-4">
                  <h3 className="text-sm font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                    <Settings size={16} /> 2. Cấu hình thương hiệu (BTI SMART)
                  </h3>
                  <p className="text-slate-400 text-xs">
                    Thay đổi logo thương hiệu hiển thị trên thanh bên (sidebar) và tên hiển thị (chia làm phần tên chữ trắng và phần tên chữ màu xanh).
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* Left side: text configurations */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="block text-slate-500 font-extrabold tracking-wider text-[10px] uppercase">
                          Tên màu trắng (Ví dụ: BTI)
                        </label>
                        <input 
                          type="text" 
                          value={brandWhiteText} 
                          onChange={(e) => setBrandWhiteText(e.target.value)}
                          placeholder="BTI"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-medium text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-slate-500 font-extrabold tracking-wider text-[10px] uppercase">
                          Tên màu xanh (Ví dụ: Smart)
                        </label>
                        <input 
                          type="text" 
                          value={brandColorText} 
                          onChange={(e) => setBrandColorText(e.target.value)}
                          placeholder="Smart"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-medium text-xs"
                        />
                      </div>
                    </div>

                    {/* Right side: Sidebar logo upload and preview */}
                    <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 flex flex-col items-center justify-center space-y-3">
                      <label className="block text-slate-400 font-extrabold tracking-wider text-[10px] uppercase text-center">
                        Logo thương hiệu Sidebar
                      </label>
                      
                      <div className="w-20 h-20 bg-[#1e293b] rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 relative group">
                        {brandLogo ? (
                          <>
                            <img src={brandLogo} alt="Sidebar Logo" className="max-w-full max-h-full object-contain p-2" />
                            <button 
                              onClick={() => setBrandLogo('')}
                              title="Xóa logo"
                              className="absolute inset-0 bg-red-955/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold text-xs cursor-pointer"
                            >
                              <Trash2 size={14} /> Xóa
                            </button>
                          </>
                        ) : (
                          <div className="text-blue-500">
                            <LayoutGrid size={24} />
                          </div>
                        )}
                      </div>

                      <label className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer select-none">
                        <Upload size={12} /> Tải logo
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 500 * 1024) {
                                alert("Kích thước tệp logo quá lớn! Vui lòng chọn tệp dưới 500KB.");
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                setBrandLogo(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* GENERAL SIGNATURE BM06 PANEL */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 md:p-6 space-y-4">
                  <h3 className="text-sm font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                    <Check size={16} /> 3. Chữ ký BM06 mặc định (Áp dụng nhanh cho các loại vật tư)
                  </h3>
                  <p className="text-slate-400 text-xs">
                    Cấu hình họ và tên đại diện ký duyệt phiếu đề nghị BM06 mặc định. Sau khi người dùng thiết lập tại đây, hệ thống sẽ tự động đồng bộ gán nhanh để phục vụ hoạt động in ấn.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="block text-slate-500 font-extrabold tracking-wider text-[10px] uppercase">Trưởng bộ phận / BGĐ duyệt</label>
                      <input 
                        type="text" 
                        value={generalDeptHead} 
                        onChange={(e) => setGeneralDeptHead(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-medium text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-slate-500 font-extrabold tracking-wider text-[10px] uppercase">Xác nhận của Thủ kho</label>
                      <input 
                        type="text" 
                        value={generalStorekeeper} 
                        onChange={(e) => setGeneralStorekeeper(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-805 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-medium text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-slate-500 font-extrabold tracking-wider text-[10px] uppercase">Họ tên Người đề nghị mặc định</label>
                      <input 
                        type="text" 
                        value={generalProposer} 
                        onChange={(e) => setGeneralProposer(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-medium text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* SAVE BUTTON FOR GENERAL TAB */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveGeneral}
                    disabled={saving || !canUserWrite}
                    className={`px-5 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all select-none shadow-lg ${
                      canUserWrite 
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/15 cursor-pointer' 
                        : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    <Save size={15} /> {saving ? "Đang đồng bộ..." : "Lưu tất cả cấu hình chung (Tab 1)"}
                  </button>
                </div>
              </div>
            </main>
          ) : (
            
            // TAB 2: DETAILED MATERIAL CONFIGURATION (SIDE-BY-SIDE SIDEBAR)
            <>
              {/* LEFT MATERIAL SIDEBAR */}
              <aside className="w-56 md:w-64 border-r border-slate-800 bg-slate-950/20 py-4 flex flex-col overflow-y-auto shrink-0">
                <div className="px-3 mb-2">
                  <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest pl-1 mb-2">Danh sách loại vật tư</p>
                </div>
                <div className="flex-1 px-2 space-y-1">
                  {danhSachVatTu.map((vatTu) => {
                    const isSelected = activeMaterial.id === vatTu.id;
                    const isHidden = vatTu.trangThai === 'hidden';
                    return (
                      <button
                        key={vatTu.id}
                        onClick={() => {
                          if (!loading && !saving) {
                            setActiveMaterial(vatTu);
                          }
                        }}
                        disabled={loading || saving}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
                          isSelected 
                            ? 'bg-indigo-600/15 border border-indigo-500/30 text-white shadow-inner' 
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                        } ${isHidden ? 'opacity-55 italic' : ''}`}
                      >
                        <span className="text-base select-none">{vatTu.icon || '📦'}</span>
                        <span className="flex-1 truncate">{vatTu.ten}</span>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>}
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* RIGHT CONFIGURATION FORM AREA */}
              <main className="flex-1 flex flex-col bg-slate-900 overflow-hidden relative">
                {loading ? (
                  <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3 animate-fade-in">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                    <span className="text-xs text-slate-400 font-medium tracking-wide">Đang tải cấu hình vật tư...</span>
                  </div>
                ) : null}

                {/* MATERIAL HEADER & TAB SELECTORS */}
                <div className="p-4 border-b border-slate-800 bg-slate-950/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{activeMaterial.icon || '📦'}</span>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase">{activeMaterial.ten}</h3>
                      <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 mt-0.5">
                        <span>Mã loại: <span className="font-mono text-slate-400">{activeMaterial.id}</span></span>
                        {config?.updatedAt && (
                          <span className="text-slate-500">• Đã lưu trên Firestore</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SUB-TABS CONTROLS (BM02 / BM03.2) */}
                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
                    {(['BM02', 'BM03.2'] as const).map((tab) => {
                      const isActive = activeTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all select-none cursor-pointer ${
                            isActive 
                              ? 'bg-indigo-600 text-white shadow' 
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                          }`}
                        >
                          {tab === 'BM03.2' ? 'BM03.2 & BM04' : tab}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* MAIN FORMS FIELDS WRAPPER */}
                <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
                  {config && (
                    <>
                      {/* BM06 MATERIAL CONFIG */}
                      {activeTab === 'BM06' && (
                        <div className="space-y-4 animate-fade-in text-xs">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Kính gửi (Receiver)</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white font-medium"
                                value={config.bm06.receiver || ''}
                                onChange={(e) => updateBM06Field('receiver', e.target.value)}
                                placeholder="Ban Giám đốc..."
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Mục đích sử dụng mặc định</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-805 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white font-medium"
                                value={config.bm06.defaultPurpose || ''}
                                onChange={(e) => updateBM06Field('defaultPurpose', e.target.value)}
                                placeholder="Mục đích sử dụng..."
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Địa danh/Địa điểm đổ hàng mặc định</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white font-medium"
                                value={config.bm06.defaultLocation || ''}
                                onChange={(e) => updateBM06Field('defaultLocation', e.target.value)}
                                placeholder="Địa điểm giao..."
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Thời gian cung cấp/sử dụng</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-808 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white font-medium"
                                value={config.bm06.defaultUseDate || ''}
                                onChange={(e) => updateBM06Field('defaultUseDate', e.target.value)}
                                placeholder="Khoảng ngày hoặc thời gian..."
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Các căn cứ cơ bản ( Grounds )</label>
                            <textarea 
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-mono h-24 leading-relaxed"
                              value={(config.bm06.grounds || []).join('\n')}
                              onChange={(e) => updateBM06Field('grounds', e.target.value.split('\n'))}
                              placeholder="Mỗi dòng là một căn cứ..."
                            />
                          </div>

                          {/* INHERITED SIGNATURES SECTION WITH OVERRIDES */}
                          <div className="border-t border-slate-800 pt-4 mt-6 space-y-3">
                            <h4 className="text-white font-bold uppercase text-[10px] tracking-widest text-indigo-400 flex items-center gap-1.5">
                              Người ký BM06 riêng (Nếu để trống sẽ kế thừa Cấu hình chung)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="block text-slate-500 font-bold tracking-wider text-[10px] uppercase">Trưởng bộ phận</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white text-xs font-semibold"
                                  value={config.bm06.departmentHead || ''}
                                  onChange={(e) => updateBM06Field('departmentHead', e.target.value)}
                                  placeholder={`Kế thừa từ tab 1: ${generalDeptHead}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-500 font-bold tracking-wider text-[10px] uppercase">Xác nhận Thủ kho</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white text-xs font-semibold"
                                  value={config.bm06.storekeeper || ''}
                                  onChange={(e) => updateBM06Field('storekeeper', e.target.value)}
                                  placeholder={`Kế thừa từ tab 1: ${generalStorekeeper}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-500 font-bold tracking-wider text-[10px] uppercase">Người đề nghị</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white text-xs font-semibold"
                                  value={config.bm06.proposer || ''}
                                  onChange={(e) => updateBM06Field('proposer', e.target.value)}
                                  placeholder={`Kế thừa từ tab 1: ${generalProposer}`}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Ghi chú mặc định</label>
                            <input 
                              type="text" 
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white font-medium"
                              value={config.bm06.defaultNote || ''}
                              onChange={(e) => updateBM06Field('defaultNote', e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      {/* BM02 MATERIAL CONFIG */}
                      {activeTab === 'BM02' && (
                        <div className="space-y-4 animate-fade-in text-xs">
                          <div className="space-y-1">
                            <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tiêu đề tờ trình kinh phí ( Title )</label>
                            <input 
                              type="text" 
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white font-bold text-red-400"
                              value={config.bm02.title || ''}
                              onChange={(e) => updateBM02Field('title', e.target.value)}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Đơn vị kính gửi (Recipients)</label>
                              <textarea 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-mono h-16"
                                value={(config.bm02.recipients || []).join('\n')}
                                onChange={(e) => updateBM02Field('recipients', e.target.value.split('\n'))}
                                placeholder="Mỗi phòng ban/đại diện trên một dòng..."
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Nội dung đề nghị mặc định</label>
                              <textarea 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white h-16"
                                value={config.bm02.requestContent || ''}
                                onChange={(e) => updateBM02Field('requestContent', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Thời hạn thanh toán</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white font-medium"
                                value={config.bm02.paymentTerm || ''}
                                onChange={(e) => updateBM02Field('paymentTerm', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Ghi chú tờ trình mặc định</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white font-medium"
                                value={config.bm02.defaultNote || ''}
                                onChange={(e) => updateBM02Field('defaultNote', e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Căn cứ kèm theo ( Grounds )</label>
                            <textarea 
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-mono h-20"
                              value={(config.bm02.grounds || []).join('\n')}
                              onChange={(e) => updateBM02Field('grounds', e.target.value.split('\n'))}
                              placeholder="Mỗi dòng một căn cứ..."
                            />
                          </div>

                          {/* INTERACTIVE COMPREHENSIVE DYNAMIC SIGNATURE MANAGER FOR BM02 */}
                          <div className="border-t border-slate-800 pt-5 mt-6 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <h4 className="text-white font-extrabold uppercase text-[11px] tracking-wider text-indigo-400">Danh sách chữ ký tùy chọn BM02 (Tối đa 6)</h4>
                                <p className="text-slate-500 text-[10px] mt-0.5">Biểu mẫu BM02 sẽ tự động phân bổ layout cho các chữ ký dưới đây.</p>
                              </div>
                              <button 
                                onClick={addBM02Signature}
                                disabled={saving}
                                className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 hover:text-white text-indigo-300 rounded-xl text-[10px] font-extrabold transition-all shrink-0 flex items-center gap-1.5 select-none cursor-pointer"
                              >
                                <Plus size={13} /> Thêm chữ ký
                              </button>
                            </div>

                            <div className="bg-slate-950/35 border border-slate-800 rounded-2xl overflow-hidden">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="border-b border-slate-850 bg-slate-950/60 font-bold text-slate-400 text-[10px] uppercase tracking-wider">
                                    <th className="p-3 w-12 text-center">STT</th>
                                    <th className="p-3">Chức danh ký duyệt</th>
                                    <th className="p-3">Họ và tên người ký</th>
                                    <th className="p-3 w-32 text-center">Thứ tự</th>
                                    <th className="p-3 w-12 text-center">Xem</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(config.bm02.kyTenList || []).map((sig, idx, arr) => (
                                    <tr key={sig.id} className="border-b border-slate-900 hover:bg-slate-950/15 transition-colors">
                                      <td className="p-2.5 text-center text-slate-500 font-semibold">{idx + 1}</td>
                                      <td className="p-2.5">
                                        <input 
                                          type="text"
                                          value={sig.chucDanh || ''}
                                          onChange={(e) => updateBM02SigField(sig.id, 'chucDanh', e.target.value)}
                                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:border-indigo-500 text-xs font-bold"
                                        />
                                      </td>
                                      <td className="p-2.5">
                                        <input 
                                          type="text"
                                          value={sig.hoTen || ''}
                                          onChange={(e) => updateBM02SigField(sig.id, 'hoTen', e.target.value)}
                                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 focus:border-indigo-500 text-xs font-medium"
                                        />
                                      </td>
                                      <td className="p-2.5">
                                        <div className="flex items-center justify-center gap-1">
                                          <button 
                                            onClick={() => moveBM02Signature(idx, 'up')}
                                            disabled={idx === 0 || saving}
                                            className="p-1 px-1.5 bg-slate-800 rounded hover:bg-indigo-600 disabled:opacity-20 text-slate-350 cursor-pointer"
                                          >
                                            <ArrowUp size={11} />
                                          </button>
                                          <button 
                                            onClick={() => moveBM02Signature(idx, 'down')}
                                            disabled={idx === arr.length - 1 || saving}
                                            className="p-1 px-1.5 bg-slate-800 rounded hover:bg-indigo-600 disabled:opacity-20 text-slate-350 cursor-pointer"
                                          >
                                            <ArrowDown size={11} />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="p-2.5 text-center">
                                        <button 
                                          onClick={() => deleteBM02Signature(sig.id)}
                                          disabled={saving}
                                          className="p-1.5 text-red-500 hover:bg-red-950/40 rounded transition-all cursor-pointer"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                  {(config.bm02.kyTenList || []).length === 0 && (
                                    <tr>
                                      <td colSpan={5} className="p-6 text-center italic text-slate-600">
                                        Chưa có chữ ký tùy chỉnh nào được cấu hình.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* BM03.2 & BM04 MATERIAL CONFIG (SHARED CONTENT + INDIVIDUAL TITLES) */}
                      {activeTab === 'BM03.2' && (
                        <div className="space-y-5 animate-fade-in text-xs">
                          {/* TITLE SECTION (CẤU HÌNH TIÊU ĐỀ RIÊNG CHO TỪNG BIỂU MẪU) */}
                          <div className="bg-slate-900/90 p-3.5 rounded-xl border border-indigo-500/30 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black uppercase text-indigo-400 tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                TIÊU ĐỀ BIỂU MẪU (TITLE THEO FORMTYPE)
                              </span>
                              <span className="text-[10px] text-slate-400 italic">Cấu hình tiêu đề riêng biệt cho BM03.2 & BM04</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                                  1. Tiêu đề BM03.2 (BBNT)
                                </label>
                                <input 
                                  type="text" 
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-bold text-red-400"
                                  value={config.bm032.title || ''}
                                  onChange={(e) => updateBM032Field('title', e.target.value)}
                                  placeholder="BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                                  2. Tiêu đề BM04 (Giao nhận vật tư)
                                </label>
                                <input 
                                  type="text" 
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 text-white font-bold text-emerald-400"
                                  value={config.bm032.titleBM04 || ''}
                                  onChange={(e) => updateBM032Field('titleBM04', e.target.value)}
                                  placeholder="BIÊN BẢN GIAO NHẬN VẬT TƯ"
                                />
                              </div>
                            </div>
                          </div>

                          {/* SHARED CONTENT BANNER */}
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2 pt-1">
                            <span className="text-[11px] font-black uppercase text-slate-300 tracking-wider flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              NỘI DUNG DÙNG CHUNG (SHARED CONTENT: BÊN GIAO / BÊN NHẬN / NHÂN SỰ / CHỮ KÝ)
                            </span>
                            <span className="text-[10px] text-emerald-400 font-medium">Tự động đồng bộ cho cả BM03.2 và BM04</span>
                          </div>

                          {/* PART A: ESSENTIAL BM03.2 FIELDS */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5 md:col-span-2">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Địa điểm nghiệm thu mặc định</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white"
                                value={config.bm032.defaultLocation || ''}
                                onChange={(e) => updateBM032Field('defaultLocation', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Bên Giao (Công ty A)</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-808 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white"
                                value={config.bm032.senderCompany || ''}
                                onChange={(e) => updateBM032Field('senderCompany', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Bên Nhận (Công ty B)</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white"
                                value={config.bm032.receiverCompany || ''}
                                onChange={(e) => updateBM032Field('receiverCompany', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Thời gian Bắt đầu nghiệm thu</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-802 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white"
                                value={config.bm032.startTime || ''}
                                onChange={(e) => updateBM032Field('startTime', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Thời gian Kết thúc nghiệm thu</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white"
                                value={config.bm032.endTime || ''}
                                onChange={(e) => updateBM032Field('endTime', e.target.value)}
                              />
                            </div>
                          </div>

                          {/* BÊN GIAO & BÊN NHẬN REPS LIST */}
                          <div className="space-y-6 mt-4">
                            {/* BÊN GIAO */}
                            <div className="space-y-3">
                              <h4 className="text-blue-500 font-bold uppercase tracking-wider text-xs border-b border-slate-800 pb-2">
                                BÊN GIAO (CUNG CẤP)
                              </h4>
                              
                              <div className="space-y-1.5">
                                <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tên công ty bên giao (Nội dung cố định)</label>
                                <input 
                                  type="text"
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white"
                                  value={config.bm032.senderCompany || ''}
                                  onChange={(e) => updateBM032Field('senderCompany', e.target.value)}
                                />
                              </div>

                              <div className="space-y-2 pt-1">
                                <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Danh sách đại diện bên giao</label>
                                {(config.bm032.senderRepresentatives || []).map((rep, idx) => (
                                  <div key={idx} className="flex gap-2 items-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newReps = [...(config.bm032.senderRepresentatives || [])];
                                        newReps[idx] = { ...newReps[idx], salutation: (newReps[idx]?.salutation || 'Ông') === 'Bà' ? 'Ông' : 'Bà' };
                                        updateBM032Field('senderRepresentatives', newReps);
                                      }}
                                      className="px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold text-blue-400 hover:bg-slate-800 shrink-0"
                                      title="Bấm để đổi Ông / Bà"
                                    >
                                      {rep.salutation || 'Ông'}
                                    </button>
                                    <input
                                      type="text"
                                      placeholder="Họ và tên"
                                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white text-sm"
                                      value={rep.name}
                                      onChange={(e) => {
                                        const newReps = [...(config.bm032.senderRepresentatives || [])];
                                        newReps[idx] = { ...newReps[idx], name: e.target.value };
                                        updateBM032Field('senderRepresentatives', newReps);
                                      }}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Chức vụ"
                                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white text-sm"
                                      value={rep.position}
                                      onChange={(e) => {
                                        const newReps = [...(config.bm032.senderRepresentatives || [])];
                                        newReps[idx] = { ...newReps[idx], position: e.target.value };
                                        updateBM032Field('senderRepresentatives', newReps);
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newReps = [...(config.bm032.senderRepresentatives || [])];
                                        newReps.splice(idx, 1);
                                        updateBM032Field('senderRepresentatives', newReps);
                                      }}
                                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newReps = [...(config.bm032.senderRepresentatives || [])];
                                    newReps.push({ salutation: 'Ông', name: '', position: '' });
                                    updateBM032Field('senderRepresentatives', newReps);
                                  }}
                                  className="w-full py-2 border border-dashed border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-400 font-bold uppercase tracking-wider text-xs rounded-lg flex items-center justify-center gap-2 transition-colors mt-2"
                                >
                                  <Plus size={14} /> Thêm người bên giao
                                </button>
                              </div>
                            </div>

                            {/* BÊN NHẬN */}
                            <div className="space-y-3 pt-2">
                              <h4 className="text-blue-500 font-bold uppercase tracking-wider text-xs border-b border-slate-800 pb-2">
                                BÊN NHẬN (NGHIỆM THU)
                              </h4>
                              
                              <div className="space-y-1.5">
                                <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tên công ty bên nhận (Nội dung cố định)</label>
                                <input 
                                  type="text"
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 text-white"
                                  value={config.bm032.receiverCompany || ''}
                                  onChange={(e) => updateBM032Field('receiverCompany', e.target.value)}
                                />
                              </div>

                              <div className="pt-2">
                                <PersonnelDirectoryManager />
                              </div>
                            </div>
                          </div>

                          {/* EXTRA BBNT METADATA METADATA FIELDS (ADD THEM TY CO, DU AN PER MATERIAL) */}
                          <div className="border border-indigo-950/40 bg-indigo-950/10 rounded-2xl p-4 space-y-3.5">
                            <h4 className="text-white font-extrabold uppercase text-[10px] tracking-wider text-indigo-400 flex items-center gap-2">
                              <Layers size={14} /> Thêm thông tin mở rộng (Phục vụ BM03.2 / Nghiệm thu)
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="block text-slate-400 font-bold tracking-wider text-[9px] uppercase">Tên công trình</label>
                                <input 
                                  type="text" 
                                  value={config.bm032.tenCongTrinh || ''}
                                  onChange={(e) => updateBM032Field('tenCongTrinh', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 text-white"
                                  placeholder="Nhập tên dự án..."
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-400 font-bold tracking-wider text-[9px] uppercase">Nhà thầu thi công</label>
                                <input 
                                  type="text" 
                                  value={config.bm032.nhaThauThiCong || ''}
                                  onChange={(e) => updateBM032Field('nhaThauThiCong', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 text-white"
                                  placeholder="Nhập tên đơn vị thi công..."
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-400 font-bold tracking-wider text-[9px] uppercase">Nhà cung cấp vật tư</label>
                                <input 
                                  type="text" 
                                  value={config.bm032.nhaCungCap || ''}
                                  onChange={(e) => updateBM032Field('nhaCungCap', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 text-white"
                                  placeholder="Nhập bên cung cấp..."
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-400 font-bold tracking-wider text-[9px] uppercase">Số Hợp đồng Nghiệm thu (HĐNT)</label>
                                <input 
                                  type="text" 
                                  value={config.bm032.soHDNT || ''}
                                  onChange={(e) => updateBM032Field('soHDNT', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 text-white"
                                  placeholder="Số HĐ / mã chứng từ..."
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-400 font-bold tracking-wider text-[9px] uppercase">Ngày ký hợp đồng</label>
                                <input 
                                  type="text" 
                                  value={config.bm032.ngayKyHD || ''}
                                  onChange={(e) => updateBM032Field('ngayKyHD', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 text-white"
                                  placeholder="Ví dụ: 12/03/2026..."
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-400 font-bold tracking-wider text-[9px] uppercase">Mã biểu mẫu BM02 đi kèm</label>
                                <input 
                                  type="text" 
                                  value={config.bm032.maBM02 || ''}
                                  onChange={(e) => updateBM032Field('maBM02', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 text-white"
                                  placeholder="Mã liên kết BM02..."
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tài liệu làm căn cứ ( Grounds BBNT )</label>
                            <textarea 
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-20 focus:outline-none focus:border-indigo-500 text-white font-mono h-20"
                              value={(config.bm032.grounds || []).join('\n')}
                              onChange={(e) => updateBM032Field('grounds', e.target.value.split('\n'))}
                              placeholder="Mỗi dòng là một văn bản căn cứ..."
                            />
                          </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="block text-slate-450 font-bold tracking-wider text-[10px] uppercase">Thành phần tham gia ký biên bản</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-808 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-semibold"
                                value={config.bm032.signers || ''}
                                onChange={(e) => updateBM032Field('signers', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-slate-450 font-bold tracking-wider text-[10px] uppercase">Ghi chú kết luận mặc định BBNT</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-white font-semibold"
                                value={config.bm032.defaultNote || ''}
                                onChange={(e) => updateBM032Field('defaultNote', e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="border-t border-slate-800/60 pt-4 space-y-3">
                            <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-wider">Chữ ký các bên (BM03.2)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/30 p-3 rounded-xl border border-slate-800/40">
                              {/* Bên A */}
                              <div className="space-y-2">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider block border-b border-slate-800/60 pb-1">BÊN A (GIAO VẬT TƯ)</span>
                                <div className="space-y-1">
                                  <label className="block text-slate-400 text-[9px] uppercase font-bold">Tên Công ty A</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 text-white font-semibold text-xs"
                                    value={config.bm032.bbnt_benA_congTy !== undefined ? config.bm032.bbnt_benA_congTy : (config.bm032.nhaCungCap || 'ĐƠN VỊ CUNG CẤP')}
                                    onChange={(e) => updateBM032Field('bbnt_benA_congTy', e.target.value)}
                                    placeholder="Tên Cty A..."
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-slate-400 text-[9px] uppercase font-bold">Đại diện bên A (Họ và tên)</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 text-white font-semibold text-xs"
                                    value={config.bm032.bbnt_benA_daiDien || ''}
                                    onChange={(e) => updateBM032Field('bbnt_benA_daiDien', e.target.value)}
                                    placeholder="Nhập đại diện Cty A..."
                                  />
                                </div>
                              </div>
                              {/* Bên B */}
                              <div className="space-y-2">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider block border-b border-slate-800/60 pb-1">BÊN B (NHẬN VẬT TƯ)</span>
                                <div className="space-y-1">
                                  <label className="block text-slate-400 text-[9px] uppercase font-bold">Tên Công ty B</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 text-white font-semibold text-xs"
                                    value={config.bm032.bbnt_benB_congTy !== undefined ? config.bm032.bbnt_benB_congTy : (config.bm032.nhaThauThiCong || 'CÔNG TY TNHH MTV XÂY DỰNG IJC')}
                                    onChange={(e) => updateBM032Field('bbnt_benB_congTy', e.target.value)}
                                    placeholder="Tên Cty B..."
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-slate-400 text-[9px] uppercase font-bold">Đại diện bên B (Họ và tên)</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 text-white font-semibold text-xs"
                                    value={config.bm032.bbnt_benB_daiDien || ''}
                                    onChange={(e) => updateBM032Field('bbnt_benB_daiDien', e.target.value)}
                                    placeholder="Nhập đại diện Cty B..."
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* PREVIEW BIỂU MẪU MOCKUP OVERLAY PANEL */}
                {showPreview && config && (
                  <div className="absolute inset-0 bg-slate-950/95 z-30 p-6 flex flex-col overflow-hidden animate-fade-in text-slate-900 font-serif">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                      <span className="text-white text-xs font-bold uppercase tracking-wider">Xem trước biểu mẫu ({activeTab}) - {activeMaterial.ten}</span>
                      <button 
                        onClick={() => setShowPreview(false)}
                        className="px-3 py-1 bg-red-655 hover:bg-red-700 text-white text-xs font-bold rounded-md cursor-pointer"
                      >
                        Đóng xem thử
                      </button>
                    </div>
                    
                    {/* Simulated A4 white visual sheet */}
                    <div className="flex-1 overflow-y-auto bg-white p-10 max-w-2xl mx-auto shadow-xl rounded w-full h-full text-black space-y-4">
                      {activeTab === 'BM06' ? (
                        <div className="text-[10pt] leading-relaxed">
                          <div className="text-center font-bold text-base uppercase border-b border-black pb-2 mb-4">Mẫu phiếu đề nghị mua vật tư (BM06)</div>
                          <p className="font-bold">Kính gửi: <span className="font-normal underline text-blue-800">{config.bm06.receiver}</span></p>
                          <div className="space-y-1 mt-2">
                            {(config.bm06.grounds || []).map((g, i) => (
                              <p key={i} className="text-slate-700">- {g}</p>
                            ))}
                          </div>
                          <p className="mt-2 font-bold">Mục đích sử dụng: <span className="font-normal">{config.bm06.defaultPurpose}</span></p>
                          <p className="font-bold">Địa điểm giao hàng: <span className="font-normal">{config.bm06.defaultLocation}</span></p>
                          <p className="font-bold">Thời hạn sử dụng/cấp hàng: <span className="font-normal">{config.bm06.defaultUseDate}</span></p>
                          
                          <div className="grid grid-cols-3 text-center font-bold mt-16 text-[9pt]">
                            <div>
                              <div>TRƯỜNG BỘ PHẬN</div>
                              <div className="h-10"></div>
                              <div className="font-normal text-blue-800 underline">{config.bm06.departmentHead || generalDeptHead}</div>
                            </div>
                            <div>
                              <div>XÁC NHẬN THỦ KHO</div>
                              <div className="h-10"></div>
                              <div className="font-normal text-blue-800 underline">{config.bm06.storekeeper || generalStorekeeper}</div>
                            </div>
                            <div>
                              <div>NGƯỜI ĐỀ NGHỊ</div>
                              <div className="h-10"></div>
                              <div className="font-normal text-blue-800 underline">{config.bm06.proposer || generalProposer}</div>
                            </div>
                          </div>
                        </div>
                      ) : activeTab === 'BM02' ? (
                        <div className="text-[10pt] leading-relaxed">
                          <div className="text-center font-bold text-base uppercase border-b border-black pb-2 mb-4">TỜ TRÌNH PHÊ DUYỆT KINH PHÍ (BM02)</div>
                          <p className="text-center italic text-slate-500 uppercase mt-[-10px] pb-3">{config.bm02.title}</p>
                          <p className="font-bold">Kính gửi: <span className="font-normal text-blue-800 underline">{(config.bm02.recipients || []).join(' và ')}</span></p>
                          <div className="space-y-1 mt-2 mb-3">
                            {(config.bm02.grounds || []).map((g, i) => (
                              <p key={i} className="text-slate-600 italic">- {g}</p>
                            ))}
                          </div>
                          <p className="font-bold">Nội dung đề nghị: <span className="font-normal">{config.bm02.requestContent}</span></p>
                          <p className="font-bold">Thời hạn thanh toán: <span className="font-normal">{config.bm02.paymentTerm}</span></p>
                          <p className="font-bold">Ghi chú: <span className="font-normal text-slate-800">{config.bm02.defaultNote}</span></p>
                          
                          {/* Render custom dynamically configured signatures */}
                          <div className="grid grid-cols-3 text-center font-bold mt-16 gap-y-10 text-[8pt]">
                            {(config.bm02.kyTenList || KY_TEN_MAC_DINH).map((sig, sIdx) => (
                              <div key={sig.id || sIdx}>
                                <div className="uppercase">{sig.chucDanh}</div>
                                <div className="h-10"></div>
                                <div className="font-normal text-blue-800 underline">{sig.hoTen}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10pt] leading-relaxed">
                          <div className="text-center border-b border-black pb-2 mb-4 space-y-1">
                            <div className="font-bold text-base uppercase text-red-600">{config.bm032.title || 'BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO'}</div>
                            <div className="font-bold text-xs uppercase text-emerald-700">[BM04]: {config.bm032.titleBM04 || 'BIÊN BẢN GIAO NHẬN VẬT TƯ'}</div>
                          </div>
                          {config.bm032.tenCongTrinh && <p className="font-bold text-slate-850">Công trình: <span className="font-semibold text-indigo-900">{config.bm032.tenCongTrinh}</span></p>}
                          {config.bm032.nhaThauThiCong && <p className="font-bold text-slate-850">Nhà thầu thi công: <span className="font-semibold">{config.bm032.nhaThauThiCong}</span></p>}
                          {config.bm032.nhaCungCap && <p className="font-bold text-slate-850">Nhà cung cấp: <span className="font-semibold">{config.bm032.nhaCungCap}</span></p>}
                          <p className="font-bold">BÊN GIAO: <span className="font-normal text-blue-800">{config.bm032.senderCompany}</span></p>
                          <div className="ml-4 space-y-0.5 text-slate-700">
                            {(config.bm032.senderRepresentatives || []).map((r, i) => (
                              <p key={i}>- {r.salutation}: {r.name} - Chức vụ: {r.position}</p>
                            ))}
                          </div>
                          <p className="font-bold mt-2">BÊN NHẬN: <span className="font-normal text-slate-800">{config.bm032.receiverCompany}</span></p>
                          <div className="ml-4 space-y-0.5 text-slate-700">
                            {(config.bm032.receiverRepresentatives || []).map((r, i) => (
                              <p key={i}>- {r.salutation}: {r.name} - Chức vụ: {r.position}</p>
                            ))}
                          </div>
                          <div className="mt-3">
                            <p className="font-bold">Địa điểm nghiệm thu: <span className="font-normal">{config.bm032.defaultLocation}</span></p>
                            <p className="font-bold">Bắt đầu: <span className="font-normal">{config.bm032.startTime}</span></p>
                            <p className="font-bold">Kết thúc: <span className="font-normal">{config.bm032.endTime}</span></p>
                          </div>
                          <div className="space-y-1 mt-2">
                            <p className="font-bold">Tài liệu làm căn cứ:</p>
                            {(config.bm032.grounds || []).map((g, i) => (
                              <p key={i} className="text-slate-600">- {g}</p>
                            ))}
                          </div>
                          <p className="font-bold mt-2">Kết luận: <span className="font-normal italic text-red-650">{config.bm032.defaultNote}</span></p>
                          <p className="font-bold">Người ký duyệt: <span className="font-normal">{config.bm032.signers}</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* LOWER FORM ACTION BUTTONS */}
                <footer className="p-4 border-t border-slate-800 bg-slate-950/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
                  
                  {/* COPY ACCORDINGLY */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setBatchSelectedIds([]);
                        setErrorMess(null);
                        setSuccessMess(null);
                        setShowBatchCopyModal(true);
                      }}
                      disabled={loading || saving || !canUserWrite}
                      title="Sao chép cấu hình sang các vật tư khác"
                      className="px-3.5 py-2 bg-gradient-to-r from-slate-900 to-slate-850 hover:from-slate-800 hover:to-slate-750 border border-slate-700 text-indigo-400 hover:text-indigo-300 transition-all rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Copy size={13} /> Sao chép cấu hình...
                    </button>
                  </div>

                  {/* COMMAND BUTTONS */}
                  <div className="flex items-center gap-2.5 justify-end">
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      disabled={loading || saving}
                      className="px-3.5 py-2 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-all rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer select-none"
                    >
                      <Eye size={14} /> {showPreview ? "Quay lại" : "Xem trước"}
                    </button>

                    {isUserAdmin && (
                      <button
                        onClick={handleRestoreDefaults}
                        disabled={loading || saving}
                        title="Khôi phục mặc định gốc hệ thống"
                        className="px-3.5 py-2 border border-red-900 bg-red-950/20 text-red-400 hover:bg-red-800 hover:text-white transition-all rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer select-none"
                      >
                        <RotateCcw size={14} /> Khôi phục (Admin)
                      </button>
                    )}

                    <button
                      onClick={handleSaveMaterial}
                      disabled={loading || saving || !canUserWrite}
                      className={`px-4.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all select-none shadow-lg ${
                        canUserWrite 
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/10 cursor-pointer' 
                          : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      }`}
                    >
                      <Save size={14} /> {saving ? "Đang lưu..." : "Lưu cấu hình"}
                    </button>
                  </div>
                </footer>

              </main>
            </>
          )}

        </div>
      </div>

      {/* BATCH COPY MODAL */}
      {showBatchCopyModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col border-indigo-500/20 max-h-[90vh]">
            <header className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                  <Copy size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-wide uppercase">Sao chép cấu hình vật tư</h3>
                  <p className="text-[10px] text-slate-400">Đang chọn: <span className="text-indigo-400 font-bold">{activeMaterial.ten}</span></p>
                </div>
              </div>
              <button
                onClick={() => {
                  setErrorMess(null);
                  setSuccessMess(null);
                  setShowBatchCopyModal(false);
                }}
                className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </header>

            {errorMess && (
              <div className="bg-red-500/10 border-b border-red-500/20 p-3 px-5 flex items-center gap-3 text-red-400 text-xs font-semibold shrink-0">
                <AlertCircle size={15} className="shrink-0" /> <span className="line-clamp-2">{errorMess}</span>
              </div>
            )}
            {successMess && (
              <div className="bg-emerald-500/10 border-b border-emerald-500/20 p-3 px-5 flex items-center gap-3 text-emerald-400 text-xs font-semibold shrink-0">
                <Check size={15} className="shrink-0" /> <span className="line-clamp-2">{successMess}</span>
              </div>
            )}

            <div className="p-5 overflow-y-auto space-y-6 shrink">
              {/* SECTION SELECTION */}
              <div className="space-y-3 bg-slate-950/50 p-4 rounded-xl border border-indigo-500/10">
                <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-800">
                  📋 Chọn đầu mục nội dung cần sao chép
                </h4>
                
                <div className="grid grid-cols-1 gap-2.5 pt-1.5">
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">Tờ trình kinh phí (BM02)</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={copyOptions.bm02General}
                          onChange={(e) => setCopyOptions({ ...copyOptions, bm02General: e.target.checked })}
                          className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        Thông tin chung BM02
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={copyOptions.bm02Signatures}
                          onChange={(e) => setCopyOptions({ ...copyOptions, bm02Signatures: e.target.checked })}
                          className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        Sơ đồ chữ ký BM02
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-slate-800/40">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">Đơn hàng nội bộ (BM06)</span>
                    <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={copyOptions.bm06General}
                        onChange={(e) => setCopyOptions({ ...copyOptions, bm06General: e.target.checked })}
                        className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                      Nội dung & Người ký BM06
                    </label>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-slate-800/40">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">Biên bản nghiệm thu (BM03.2)</span>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={copyOptions.bm032General}
                          onChange={(e) => setCopyOptions({ ...copyOptions, bm032General: e.target.checked })}
                          className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        Thông tin chung, tiêu đề & hợp đồng
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={copyOptions.bm032Representatives}
                            onChange={(e) => setCopyOptions({ ...copyOptions, bm032Representatives: e.target.checked })}
                            className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          Thành phần đại diện các bên
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={copyOptions.bm032Grounds}
                            onChange={(e) => setCopyOptions({ ...copyOptions, bm032Grounds: e.target.checked })}
                            className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                          Căn cứ nghiệm thu
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* DIRECTION 1: COPY FROM CURRENT TO OTHERS (BATCH COPY) */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  ⚡ HƯỚNG 1: Áp dụng từ '{activeMaterial.ten}' sang các vật tư khác
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Sao chép toàn bộ cấu hình nội dung cố định hiện tại của <b className="text-slate-200">'{activeMaterial.ten}'</b> sang các vật tư đích được chọn bên dưới (Hệ thống tự động chuyển đổi từ ngữ tương ứng).
                </p>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <label className="flex items-center gap-2.5 text-xs text-indigo-400 font-bold cursor-pointer select-none pb-2 border-b border-slate-800/60">
                    <input
                      type="checkbox"
                      checked={
                        batchSelectedIds.length > 0 &&
                        batchSelectedIds.length ===
                        danhSachVatTu.filter(v => v.id !== activeMaterial.id && v.trangThai !== 'hidden').length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allIds = danhSachVatTu
                            .filter(v => v.id !== activeMaterial.id && v.trangThai !== 'hidden')
                            .map(v => v.id);
                          setBatchSelectedIds(allIds);
                        } else {
                          setBatchSelectedIds([]);
                        }
                      }}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    Chọn tất cả các vật tư khác
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-44 overflow-y-auto pr-1">
                    {danhSachVatTu
                      .filter(v => v.id !== activeMaterial.id && v.trangThai !== 'hidden')
                      .map(v => {
                        const isSelected = batchSelectedIds.includes(v.id);
                        return (
                          <label
                            key={v.id}
                            className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all text-xs font-semibold cursor-pointer select-none ${
                              isSelected
                                ? 'bg-indigo-600/10 border-indigo-500/40 text-white'
                                : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/40 hover:text-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setBatchSelectedIds(batchSelectedIds.filter(id => id !== v.id));
                                } else {
                                  setBatchSelectedIds([...batchSelectedIds, v.id]);
                                }
                              }}
                              className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                            />
                            <span className="truncate">{v.ten}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <button
                  onClick={handleApplyConfigToSelectedMaterials}
                  disabled={loading || saving}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
                >
                  <Copy size={13} /> ÁP DỤNG CẤU HÌNH SANG {batchSelectedIds.length} VẬT TƯ ĐÃ CHỌN
                </button>
              </div>

              <div className="border-t border-slate-800/60 my-4"></div>

              {/* DIRECTION 2: COPY FROM SOME OTHER TO CURRENT */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  🔄 HƯỚNG 2: Nhập cấu hình từ vật tư khác đè vào '{activeMaterial.ten}'
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Lấy toàn bộ nội dung từ một vật tư nguồn khác để ghi đè vào <b className="text-slate-200">'{activeMaterial.ten}'</b> đang thiết lập.
                </p>

                <div className="flex gap-2.5">
                  <select
                    value={copySourceId}
                    onChange={(e) => setCopySourceId(e.target.value)}
                    disabled={loading || saving}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Chọn vật tư nguồn --</option>
                    {danhSachVatTu
                      .filter(v => v.id !== activeMaterial.id && v.trangThai !== 'hidden')
                      .map(v => (
                        <option key={v.id} value={v.id}>{v.ten}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      handleCopyFromOther();
                      setShowBatchCopyModal(false);
                    }}
                    disabled={!copySourceId || loading || saving}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white rounded-xl text-xs font-black transition-all uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border border-slate-700 hover:border-slate-650"
                  >
                    <Copy size={13} /> Chấp nhận
                  </button>
                </div>
              </div>
            </div>

            <footer className="p-3.5 bg-slate-950/40 border-t border-slate-800/60 flex justify-end">
              <button
                onClick={() => {
                  setErrorMess(null);
                  setSuccessMess(null);
                  setShowBatchCopyModal(false);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer border border-slate-700"
              >
                Đóng lại
              </button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}

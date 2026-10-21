/**
 * Utility functions for precise number, currency, and percentage formatting.
 * These formatters display the exact values without any compact abbreviations like M, K, or Tỷ.
 */

export function formatCurrencyFull(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0 đ';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '0 đ';
  return num.toLocaleString('vi-VN') + ' đ';
}

export function formatNumberFull(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '0';
  return num.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
}

export function formatNumberForExport(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0';
  const numStr = typeof value === 'number' ? value.toString() : String(value).trim();
  if (!numStr) return '0';
  
  let num = parseFloat(numStr);
  if (isNaN(num)) return '0';

  // Fix floating point issues (e.g. 165.99999999999997 -> 166)
  num = Math.round(num * 1000) / 1000;
  
  const roundedStr = num.toString();
  const parts = roundedStr.split('.');
  let integerPart = parts[0];
  let decimalPart = parts[1] || '';

  let isNegative = false;
  if (integerPart.startsWith('-')) {
    isNegative = true;
    integerPart = integerPart.substring(1);
  }

  // Format integer part with dot separators
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let result = (isNegative ? '-' : '') + formattedInteger;

  // Append decimal part if it exists (using comma as separator)
  if (decimalPart) {
    result += ',' + decimalPart;
  }

  return result;
}

export type DocumentNumberConvention = 'VIETNAMESE' | 'INTERNATIONAL' | 'AUTO';

export interface SmartNumberOptions {
  unit?: string;
  total?: number | null;
  unitPrice?: number | null;
  quantity?: number | null;
  rawStr?: string;
  convention?: DocumentNumberConvention;
  documentSamples?: (string | number | undefined | null)[];
  fieldRole?: 'quantity' | 'unitPrice' | 'total' | 'generic';
}

export interface SmartNumberResult {
  value: number;
  isAmbiguous: boolean;
  detectedConvention: 'VIETNAMESE' | 'INTERNATIONAL';
  explanation?: string;
}

/**
 * Tự động nhận diện quy ước dấu phân cách số của tài liệu:
 * - VIETNAMESE: Dấu chấm (.) phân cách hàng nghìn (1.462.963, 72.000, 85.017), dấu phẩy (,) thập phân (69,5 hay 28,3).
 * - INTERNATIONAL: Dấu phẩy (,) phân cách hàng nghìn (1,462,963, 72,000), dấu chấm (.) thập phân (69.5 hay 28.3).
 */
export function detectDocumentNumberConvention(samples: (string | number | undefined | null)[]): 'VIETNAMESE' | 'INTERNATIONAL' {
  let vnVotes = 0;
  let intlVotes = 0;

  for (const item of samples) {
    if (item === null || item === undefined) continue;
    const str = String(item).trim();
    if (!str) continue;

    // Pattern 1: Nhiều dấu chấm như 1.462.963 hoặc 13.163.785 -> Chắc chắn chuẩn VN
    if (/\d{1,3}(?:\.\d{3}){2,}/.test(str)) vnVotes += 12;
    // Pattern 2: Nhiều dấu phẩy như 1,462,963 hoặc 13,163,785 -> Chuẩn Quốc tế
    if (/\d{1,3}(?:,\d{3}){2,}/.test(str)) intlVotes += 12;
    // Pattern 3: Dấu chấm rồi dấu phẩy như 1.462.962,96 hoặc 1.500,5 -> Chuẩn VN
    if (/\d+\.\d+,\d+/.test(str)) vnVotes += 16;
    // Pattern 4: Dấu phẩy rồi dấu chấm như 1,462,962.96 hoặc 1,500.5 -> Chuẩn Quốc tế
    if (/\d+,\d+\.\d+/.test(str)) intlVotes += 16;
    // Pattern 5: Dấu phẩy kèm 1-2 chữ số như 69,5 hoặc 28,3 (không có chấm) -> Chuẩn VN
    if (/\d+,\d{1,2}$/.test(str) && !str.includes('.')) vnVotes += 5;
    // Pattern 6: Dấu chấm kèm đuôi .000 như 72.000 (không có phẩy) -> Chuẩn VN
    if (/\d+\.000$/.test(str) && !str.includes(',')) vnVotes += 6;
    // Pattern 7: Dấu chấm kèm 3 chữ số như 85.017, 30.250 -> Chuẩn VN
    if (/\d+\.\d{3}$/.test(str) && !str.includes(',')) vnVotes += 4;
    // Pattern 8: Ký hiệu tiền tệ VND, đ
    if (/(?:đ|vnd|vnđ|đồng)/i.test(str)) vnVotes += 3;
  }

  return vnVotes >= intlVotes ? 'VIETNAMESE' : 'INTERNATIONAL';
}

/**
 * Phân tích và chuyển đổi số thông minh theo bối cảnh tài liệu:
 * - Dựa vào quy ước tài liệu (VIETNAMESE vs INTERNATIONAL)
 * - Dựa vào đối chiếu toán học giữa Số lượng, Đơn giá và Thành tiền (Quantity * UnitPrice ≈ Total)
 * - Dựa vào bản chất đơn vị tính (rời rạc như viên, cây, cái, bao vs liên tục như m3, kg, tấn)
 * - Xử lý đúng: 85.017 -> 85017 (85 nghìn 17); 72.000 -> 72000; 30.250 -> 30250; 69,5 -> 69.5; 28.3 -> 28.3; 28,3 -> 28.3
 * - Nếu không đủ căn cứ xác định, đánh dấu isAmbiguous = true để người dùng kiểm tra
 */
export function parseSmartNumber(val: any, options: SmartNumberOptions = {}): SmartNumberResult {
  const fallback = 0;
  if (val === null || val === undefined) {
    return { value: fallback, isAmbiguous: false, detectedConvention: 'VIETNAMESE' };
  }

  let convention = options.convention;
  if (!convention || convention === 'AUTO') {
    if (options.documentSamples && options.documentSamples.length > 0) {
      convention = detectDocumentNumberConvention(options.documentSamples);
    } else {
      convention = 'VIETNAMESE';
    }
  }

  // Ưu tiên chuỗi gốc (rawStr) nếu có để tránh việc float đã bị JSON parse làm mất định dạng
  let str = (options.rawStr !== undefined && options.rawStr !== null && String(options.rawStr).trim() !== '')
    ? String(options.rawStr).trim()
    : (typeof val === 'string' ? val.trim() : '');

  // Nếu chỉ có giá trị kiểu number (ví dụ 85.017 từ JSON trước đó)
  if (!str && typeof val === 'number') {
    if (isNaN(val)) return { value: fallback, isAmbiguous: false, detectedConvention: convention };

    const floatStr = val.toString();
    const parts = floatStr.split('.');

    // Nếu số thực có đúng 3 chữ số thập phân (như 85.017, 30.25, 72)
    if (parts.length === 2 && parts[1].length === 3) {
      // Kiểm tra đối chiếu toán học: Quantity * UnitPrice ≈ Total
      if (options.total && options.unitPrice && options.total > 0 && options.unitPrice > 0) {
        const asThousand = Math.round(val * 1000); // 85017
        const asDecimal = val;                     // 85.017
        const diffThousand = Math.abs(asThousand * options.unitPrice - options.total);
        const diffDecimal = Math.abs(asDecimal * options.unitPrice - options.total);
        if (diffThousand < diffDecimal && diffThousand / options.total < 0.05) {
          return { value: asThousand, isAmbiguous: false, detectedConvention: convention, explanation: 'Khớp toán học với thành tiền' };
        } else if (diffDecimal < diffThousand && diffDecimal / options.total < 0.05) {
          return { value: asDecimal, isAmbiguous: false, detectedConvention: convention, explanation: 'Khớp toán học với thành tiền' };
        }
      }

      // Kiểm tra đơn vị tính rời rạc
      const unit = (options.unit || '').toLowerCase().trim();
      const discreteUnits = ['viên', 'cây', 'bao', 'bộ', 'cái', 'chuyến', 'thùng', 'hộp', 'tấm', 'thanh', 'cuộn', 'ống', 'bình', 'chiếc', 'can', 'đ', 'đồng', 'vnd'];
      if (discreteUnits.some(u => unit.includes(u))) {
        return { value: Math.round(val * 1000), isAmbiguous: false, detectedConvention: convention, explanation: `Đơn vị '${unit}' là số nguyên` };
      }

      if (convention === 'VIETNAMESE') {
        return { value: Math.round(val * 1000), isAmbiguous: false, detectedConvention: convention, explanation: 'Theo chuẩn phân cách hàng nghìn Việt Nam' };
      }
    }

    return { value: val, isAmbiguous: false, detectedConvention: convention };
  }

  // Làm sạch các ký tự không phải số hoặc dấu phân cách
  let cleaned = str.replace(/[^\d.,\-+]/g, '').trim();
  if (!cleaned) return { value: fallback, isAmbiguous: false, detectedConvention: convention };

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  // TH 1: Cả dấu chấm và dấu phẩy (vd: "1.462.962,96" hoặc "1,462,962.89")
  if (hasComma && hasDot) {
    const lastCommaIndex = cleaned.lastIndexOf(',');
    const lastDotIndex = cleaned.lastIndexOf('.');
    if (lastCommaIndex > lastDotIndex) {
      // Chuẩn VN: chấm là phân cách ngàn, phẩy là thập phân
      const numStr = cleaned.replace(/\./g, '').replace(',', '.');
      const num = parseFloat(numStr) || 0;
      return { value: num, isAmbiguous: false, detectedConvention: 'VIETNAMESE' };
    } else {
      // Chuẩn QT: phẩy là phân cách ngàn, chấm là thập phân
      const numStr = cleaned.replace(/,/g, '');
      const num = parseFloat(numStr) || 0;
      return { value: num, isAmbiguous: false, detectedConvention: 'INTERNATIONAL' };
    }
  }

  // TH 2: Chỉ có dấu chấm (vd: "1.462.963", "85.017", "72.000", "30.250", "28.3", "1.5")
  if (hasDot && !hasComma) {
    const dotParts = cleaned.split('.');
    if (dotParts.length > 2) {
      // Nhiều hơn 1 dấu chấm -> Chắc chắn là phân cách hàng ngàn (vd: 1.462.963)
      const numStr = cleaned.replace(/\./g, '');
      return { value: parseFloat(numStr) || 0, isAmbiguous: false, detectedConvention: 'VIETNAMESE' };
    }

    // Đúng 1 dấu chấm: [part1, part2]
    const [part1, part2] = dotParts;

    // Nếu phần sau chấm KHÔNG PHẢI đúng 3 chữ số (vd: "28.3", "14.25", "0.5") -> Chắc chắn số thập phân!
    if (part2.length !== 3) {
      return { value: parseFloat(cleaned) || 0, isAmbiguous: false, detectedConvention: 'INTERNATIONAL' };
    }

    // Phần sau chấm có ĐÚNG 3 CHỮ SỐ (vd: "85.017", "72.000", "30.250", "1.500")
    // Bước 1: Kiểm tra đối chiếu toán học Quantity * UnitPrice ≈ Total
    if (options.total && options.unitPrice && options.total > 0 && options.unitPrice > 0) {
      const qThousand = parseFloat(part1 + part2);
      const qDecimal = parseFloat(part1 + '.' + part2);
      const diffThousand = Math.abs(qThousand * options.unitPrice - options.total);
      const diffDecimal = Math.abs(qDecimal * options.unitPrice - options.total);
      if (diffThousand < diffDecimal && diffThousand / options.total < 0.05) {
        return { value: qThousand, isAmbiguous: false, detectedConvention: 'VIETNAMESE', explanation: 'Khớp toán học với thành tiền' };
      } else if (diffDecimal < diffThousand && diffDecimal / options.total < 0.05) {
        return { value: qDecimal, isAmbiguous: false, detectedConvention: 'INTERNATIONAL', explanation: 'Khớp toán học với thành tiền' };
      }
    }

    // Bước 2: Kiểm tra đơn vị tính rời rạc (viên, cây, bao, bộ, cái...)
    const unit = (options.unit || '').toLowerCase().trim();
    const discreteUnits = ['viên', 'cây', 'bao', 'bộ', 'cái', 'chuyến', 'thùng', 'hộp', 'tấm', 'thanh', 'cuộn', 'ống', 'bình', 'chiếc', 'can', 'đ', 'đồng', 'vnd'];
    if (discreteUnits.some(u => unit.includes(u))) {
      return { value: parseFloat(part1 + part2) || 0, isAmbiguous: false, detectedConvention: 'VIETNAMESE', explanation: `Đơn vị '${unit}' là số nguyên` };
    }

    // Bước 3: Nếu là đuôi .000 (vd: "72.000", "15.000") -> Luôn là hàng ngàn
    if (part2 === '000') {
      return { value: parseFloat(part1 + part2) || 0, isAmbiguous: false, detectedConvention: 'VIETNAMESE' };
    }

    // Bước 4: Kiểm tra theo quy ước tài liệu
    if (convention === 'VIETNAMESE') {
      // Trong ngữ cảnh tài liệu Việt Nam, "85.017" là 85 nghìn 17, "30.250" là 30 nghìn 250
      return { value: parseFloat(part1 + part2) || 0, isAmbiguous: false, detectedConvention: 'VIETNAMESE' };
    } else if (convention === 'INTERNATIONAL') {
      return { value: parseFloat(part1 + '.' + part2) || 0, isAmbiguous: false, detectedConvention: 'INTERNATIONAL' };
    }

    // Nếu hoàn toàn không đủ căn cứ xác định, đánh dấu cần xác nhận
    return { 
      value: parseFloat(part1 + part2) || 0, 
      isAmbiguous: true, 
      detectedConvention: 'VIETNAMESE',
      explanation: `Cần xác nhận định dạng số: '${cleaned}' (${part1 + '.' + part2} hay ${part1 + part2})`
    };
  }

  // TH 3: Chỉ có dấu phẩy (vd: "1,462,963", "69,5", "28,3", "14,25", "150,000")
  if (hasComma && !hasDot) {
    const commaParts = cleaned.split(',');
    if (commaParts.length > 2) {
      // Nhiều hơn 1 dấu phẩy -> Phân cách hàng ngàn (vd 1,462,963)
      const numStr = cleaned.replace(/,/g, '');
      return { value: parseFloat(numStr) || 0, isAmbiguous: false, detectedConvention: 'INTERNATIONAL' };
    }

    // Đúng 1 dấu phẩy: [part1, part2]
    const [part1, part2] = commaParts;

    // Nếu phần sau phẩy là 1 hoặc 2 chữ số (vd: "69,5", "28,3", "14,25") -> Chắc chắn số thập phân!
    if (part2.length !== 3) {
      return { value: parseFloat(part1 + '.' + part2) || 0, isAmbiguous: false, detectedConvention: 'VIETNAMESE' };
    }

    // Phần sau phẩy có ĐÚNG 3 CHỮ SỐ (vd: "150,000" hoặc "1,500")
    if (convention === 'INTERNATIONAL' || part2 === '000') {
      return { value: parseFloat(part1 + part2) || 0, isAmbiguous: false, detectedConvention: 'INTERNATIONAL' };
    }

    // Kiểm tra đối chiếu toán học
    if (options.total && options.unitPrice && options.total > 0 && options.unitPrice > 0) {
      const qThousand = parseFloat(part1 + part2);
      const qDecimal = parseFloat(part1 + '.' + part2);
      const diffThousand = Math.abs(qThousand * options.unitPrice - options.total);
      const diffDecimal = Math.abs(qDecimal * options.unitPrice - options.total);
      if (diffThousand < diffDecimal && diffThousand / options.total < 0.05) {
        return { value: qThousand, isAmbiguous: false, detectedConvention: 'INTERNATIONAL' };
      } else if (diffDecimal < diffThousand && diffDecimal / options.total < 0.05) {
        return { value: qDecimal, isAmbiguous: false, detectedConvention: 'VIETNAMESE' };
      }
    }

    if (convention === 'VIETNAMESE') {
      // Trong tiếng Việt, dấu phẩy đơn là số thập phân
      return { value: parseFloat(part1 + '.' + part2) || 0, isAmbiguous: false, detectedConvention: 'VIETNAMESE' };
    } else {
      return { value: parseFloat(part1 + part2) || 0, isAmbiguous: false, detectedConvention: 'INTERNATIONAL' };
    }
  }

  // Không có dấu chấm hay phẩy
  const finalNum = parseFloat(cleaned);
  return { value: isNaN(finalNum) ? fallback : finalNum, isAmbiguous: false, detectedConvention: convention };
}

/**
 * Phân tích số tiếng Việt / quốc tế tương thích ngược hoàn toàn,
 * nay hỗ trợ thêm các tùy chọn ngữ cảnh thông minh:
 */
export function parseVNNumber(val: any, fallback = 0, options?: SmartNumberOptions): number {
  if (val === null || val === undefined) return fallback;
  const res = parseSmartNumber(val, options);
  return isNaN(res.value) ? fallback : res.value;
}

/**
 * Format BM02 line total (thành tiền) and unit price:
 * - When there are decimals (số lẻ), always display 2 decimal digits (e.g. 3.657.407,40)
 * - When it is an integer (chẵn), format without decimal places (e.g. 1.000.000)
 */
export function formatBM02Currency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0';
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return '0';

  const rounded = Math.round(num * 100) / 100;
  const isFractional = Math.abs(rounded - Math.round(rounded)) > 1e-4;

  if (isFractional) {
    return rounded.toLocaleString('vi-VN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return Math.round(rounded).toLocaleString('vi-VN', {
    maximumFractionDigits: 0
  });
}

/**
 * Format BM02 line total and unit price for Excel / Word export:
 * - When there are decimals (số lẻ), always display 2 decimal digits with comma (e.g. 3.657.407,40)
 * - When it is an integer (chẵn), format without decimal places (e.g. 1.000.000)
 */
export function formatBM02CurrencyForExport(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0';
  const numStr = typeof value === 'number' ? value.toString() : String(value).trim();
  if (!numStr) return '0';

  let num = parseFloat(numStr);
  if (isNaN(num)) return '0';

  num = Math.round(num * 100) / 100;
  const isFractional = Math.abs(num - Math.round(num)) > 1e-4;

  if (!isFractional) {
    const intStr = Math.abs(Math.round(num)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (num < 0 ? '-' : '') + intStr;
  }

  const parts = Math.abs(num).toFixed(2).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimalPart = parts[1] || '00';
  return (num < 0 ? '-' : '') + integerPart + ',' + decimalPart;
}

export function formatUnitNameForTable(unitId: string): string {
  if (!unitId) return "";
  const trimmed = unitId.trim();
  if (trimmed === "PROJECT_SHARED") return "Toàn Dự án";
  if (trimmed === "SHARED") return "Dùng chung";
  if (/^căn\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Căn ${trimmed}`;
}

export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0%';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '0%';
  return num.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%';
}

export function stripAppliedUnitsSuffix(text: string): string {
  if (!text) return "";
  let res = text.replace(/\s*\([\s\S]*?[Áá]p dụng cho[\s\S]*?\)/gi, '').trim();
  if (/^[Áá]p dụng cho.*$/i.test(res)) {
    return "";
  }
  return res;
}

export function getFirebaseSafeKey(projectId: string, unitId: string): string {
  return `${projectId}::${unitId}`.replace(/[.#$/\[\]]/g, '_');
}

export function sanitizeUnitPurposes(purposes: Record<string, string> | undefined): Record<string, string> {
  if (!purposes) return {};
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(purposes)) {
    const cleanKey = k.replace(/[.#$/\[\]]/g, '_');
    clean[cleanKey] = v;
  }
  return clean;
}

export const CANONICAL_PROJECTS = [
  "Lô G24, Dự án Green City, P. Bình Dương, TP.HCM",
  "Lô G9, Dự án Green City, P. Bình Dương, TP. HCM",
  "Lô HL-A15, HL-A3B, P. Bình Dương, TP. HCM",
  "Lô N6, Khu liên hợp Công nghiệp - Dịch vụ đô thị Bình Dương, P. Bình Dương, TP.HCM",
  "Lô N7-N8, Khu liên hợp Công nghiệp - Dịch vụ đô thị Bình Dương, P. Bình Dương, TP.HCM"
];

export function normalizeProjectName(projName?: string | null): string {
  if (!projName) return '';
  const str = String(projName).trim();
  if (!str) return '';

  const lower = str.toLowerCase();
  if (lower.includes("test") || lower.includes("demo") || lower.includes("dự án tạm") || lower.includes("project tạm") || lower.includes("rác")) {
    return '';
  }

  if (str.includes("G24") || str.includes("G-24")) {
    return "Lô G24, Dự án Green City, P. Bình Dương, TP.HCM";
  }
  if (str.includes("G9") || str.includes("G-9") || str.includes("Green City")) {
    return "Lô G9, Dự án Green City, P. Bình Dương, TP. HCM";
  }
  if (str.includes("HL-A15") || str.includes("HL-A3B") || str.includes("Hòa Lợi")) {
    return "Lô HL-A15, HL-A3B, P. Bình Dương, TP. HCM";
  }
  if (str.includes("Lô N6") || str.includes("N6,") || str.includes("N6")) {
    return "Lô N6, Khu liên hợp Công nghiệp - Dịch vụ đô thị Bình Dương, P. Bình Dương, TP.HCM";
  }
  if (str.includes("Lô N7-N8") || str.includes("N7-N8") || str.includes("N7, N8") || str.includes("N7-8") || str.includes("N7") || str.includes("N8")) {
    return "Lô N7-N8, Khu liên hợp Công nghiệp - Dịch vụ đô thị Bình Dương, P. Bình Dương, TP.HCM";
  }

  return str;
}

export function chuanHoaNgayUtils(val: any): string {
  if (!val || val === '') return '';
  let str = String(val).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    let p = str.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  if (str.indexOf('T') !== -1 || str.indexOf('Z') !== -1) {
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
      let ngay  = String(d.getUTCDate()).padStart(2, '0');
      let thang = String(d.getUTCMonth() + 1).padStart(2, '0');
      let nam   = d.getUTCFullYear();
      return ngay + '/' + thang + '/' + nam;
    }
  }
  return str;
}

export function addOneDayToString(dateStr: string): string {
  if (!dateStr) return '';
  const str = chuanHoaNgayUtils(dateStr);
  if (!str) return dateStr;
  
  const parts = str.split('/');
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

export function getShortProjectName(projName?: string | null): string {
  if (!projName) return '';
  const norm = normalizeProjectName(projName);
  if (!norm) return '';

  if (norm.includes("G24")) return "Lô G24 - Green City";
  if (norm.includes("G9")) return "Lô G9 - Green City";
  if (norm.includes("HL-A15") || norm.includes("HL-A3B")) return "Lô HL-A15, HL-A3B";
  if (norm.includes("N6")) return "Lô N6 - KLH Bình Dương";
  if (norm.includes("N7-N8") || norm.includes("N7") || norm.includes("N8")) return "Lô N7-N8 - KLH Bình Dương";

  if (norm.includes(",")) return norm.split(",")[0].trim();
  return norm;
}

export function extractCongTrinhFromDiaDiem(diaDiem: string): string {
  if (!diaDiem) return '';
  const str = diaDiem.trim();
  
  let cleaned = str.replace(/^(tại\s+công\s+trình|công\s+trình|địa\s+điểm)\s*:\s*/i, '');
  const parts = cleaned.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);

  const projectKeywords = [
    /khu\s+liên\s+hợp/i, /dự\s+án/i, /khu\s+đô\s+thị/i, /khu\s+dân\s+cư/i, /khu\s+nhà\s+ở/i, 
    /khu\s+công\s+nghiệp/i, /kcn/i, /tòa\s+nhà/i, /chung\s+cư/i, /công\s+trình/i, /trung\s+tâm/i
  ];

  for (const part of parts) {
    if (projectKeywords.some(kw => kw.test(part))) {
      let p = part.replace(/^(thuộc\s+dự\s+án|thuộc|tại)\s+/i, '').trim();
      return p;
    }
  }

  const match = cleaned.match(/(?:dự\s+án|khu\s+[\w\s-]+)(?=\s*,|\s*$)/i);
  if (match) {
    return match[0].trim();
  }

  if (parts.length > 1 && !/^(TP|Thành phố|Tỉnh|Quận|Huyện|Phường|Xã)\b/i.test(parts[1])) {
    return parts[1].replace(/^(thuộc\s+dự\s+án|thuộc|tại)\s+/i, '').trim();
  } else if (parts.length > 0 && !/^(TP|Thành phố|Tỉnh|Quận|Huyện|Phường|Xã)\b/i.test(parts[0])) {
    return parts[0].replace(/^(thuộc\s+dự\s+án|thuộc|tại)\s+/i, '').trim();
  }

  return cleaned;
}

export function formatProjectLocation(diaDiem: string): string {
  if (!diaDiem || typeof diaDiem !== 'string') return 'Dự án CHƯA TÊN';
  const str = diaDiem.trim();
  if (!str) return 'Dự án CHƯA TÊN';

  const lines = str.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length > 1) {
    const parenMatches = Array.from(new Set(
      (str.match(/\(([^)]+)\)/g) || []).map(s => s.slice(1, -1).trim())
    ));

    if (parenMatches.length > 0) {
      const locationSummary = parenMatches.join(' - ');
      const unitNames = lines.map(l => {
        const m = l.match(/^(Công trình|Căn|Lô|Hạng mục|Dự án)\s*[\w\d.-]+/i);
        return m ? m[0] : '';
      }).filter(Boolean);

      if (unitNames.length > 2) {
        return `${locationSummary} (${lines.length} công trình/căn)`;
      } else if (unitNames.length > 0) {
        return `${unitNames.join(', ')} - ${locationSummary}`;
      }
      return locationSummary;
    }

    return lines.join(', ').replace(/\s+/g, ' ');
  }

  return str.replace(/[\r\n]+/g, ', ').replace(/\s+/g, ' ');
}

/**
 * Chuẩn hóa và bảo toàn định dạng xuống dòng (\n) cho phần NỘI DUNG của các biểu mẫu BM02, BM03.2, BM04:
 * - Giữ nguyên các dấu câu, khoảng trắng cần thiết, thứ tự nội dung và các đoạn xuống dòng có sẵn.
 * - Tự động tách các dòng bị dồn trên 1 hàng (do ngăn cách bởi dấu chấm phẩy, dấu gạch đầu dòng • / -, hoặc các cụm công việc).
 * - Loại bỏ các tiền tố nhãn hành chính thừa ở đầu ("Nội dung:", "Hạng mục:", "V/v:").
 */
export function normalizeMultilineContent(raw: string | undefined | null): string {
  if (!raw) return '';
  let str = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Loại bỏ các tiền tố nhãn hành chính ở đầu văn bản (ví dụ "Nội dung:", "- Nội dung:", "V/v:")
  str = str.replace(/^[\s\-_*•]*(-?\s*Nội dung|-?\s*Hạng mục|V\/v)\s*[:：]\s*/i, '').trim();

  // Nếu chuỗi đã có các đoạn xuống dòng thực tế (\n), giữ nguyên cấu trúc các dòng
  const existingLines = str.split('\n').map(l => l.trim()).filter(Boolean);
  if (existingLines.length > 1) {
    return existingLines.join('\n');
  }

  // Nếu chuỗi chỉ nằm trên 1 dòng đơn nhưng chứa nhiều gạch đầu dòng, dấu chấm phẩy hoặc dấu chấm tròn
  if (existingLines.length === 1) {
    const single = existingLines[0];

    // Trường hợp 1: Có chứa dấu chấm tròn •
    if (single.includes('•')) {
      const parts = single.split(/•\s*/).map(l => l.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.map(p => `• ${p}`).join('\n');
      }
    }

    // Trường hợp 2: Có chứa nhiều dấu gạch đầu dòng " - " ở giữa câu (ví dụ "- Công tác 1 - Công tác 2")
    if (/(?<=\S)\s+-\s+(?=[A-ZÀ-Ỹa-zà-ỹ0-9])/u.test(single)) {
      const parts = single.split(/(?<=\S)\s+-\s+/u).map(l => l.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.map((p, idx) => (idx === 0 && !single.startsWith('-') ? p : `- ${p}`)).join('\n');
      }
    }

    // Trường hợp 3: Có chứa dấu chấm phẩy giữa các công việc (ví dụ "Thi công cọc ép; Thi công xây tường tầng 1;...")
    if (single.includes(';') && (single.includes('Thi công') || single.includes('tầng') || single.includes('cọc') || single.includes('lô') || single.includes('xây') || single.includes('cột') || single.includes('dầm') || single.includes('công tác') || single.includes('ép'))) {
      const parts = single.split(/;\s*/).map(l => l.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.map(p => (p.startsWith('-') || p.startsWith('•') ? p : `- ${p}`)).join('\n');
      }
    }

    // Trường hợp 4: Nhiều cụm "Thi công ..." dồn liền nhau mà không có dấu xuống dòng
    const tcMatches = single.split(/(?<=\S)\s+(?=Thi công\b)/i).map(l => l.trim()).filter(Boolean);
    if (tcMatches.length > 1) {
      return tcMatches.map(p => (p.startsWith('-') || p.startsWith('•') ? p : `- ${p}`)).join('\n');
    }
  }

  return str;
}




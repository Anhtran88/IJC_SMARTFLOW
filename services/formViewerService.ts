import { ref, onValue, off } from 'firebase/database';
import { getDB } from '../src/lib/firebaseService';
import { BM02Data, BM032Data, BM06FormData } from '../types';

export interface BM06OrderItem {
  itemId: string;
  projectId: string;
  unitId: string;
  code: string;
  name: string;
  unit: string;
  specification: string;
  estimatedQty: number;
  cumulativeQtyBefore: number;
  remainingQtyBefore: number;
  orderQty: number;
  unitPrice: number;
  notes: string;
}

export interface BM06OrderData {
  id: string; // formId
  projectId: string; // Comma separated list of projects
  unitId: string; // Comma separated list of units
  orderDate: string;
  purpose: string;
  location: string;
  company: string;
  receiver: string;
  proposer: string;
  storekeeper: string;
  departmentHead: string;
  selectedItems: BM06OrderItem[];
  sourceType: "BM06" | "PDF";
  createdAt: number;
  updatedAt: number;
  bm02Data?: any;
  bm032Data?: any;
}

/**
 * Mappings from BM06 Order schema to BM02 (Tờ trình phê duyệt kinh phí) schema
 */
export function mapBM06ToBM02(order: BM06OrderData | BM06FormData): BM02Data {
  if ((order as any).bm02Data) {
    const data = (order as any).bm02Data;
    return { ...data, sourceType: 'BM06' };
  }

  const itemsList = order.selectedItems || [];

  // Dynamic automatic mapping of shape FormData/BM02Data
  const items = itemsList.map((it, idx) => ({
    id: (it as any).itemId || (it as any).estimateItemId || Math.random().toString(36).substr(2, 9),
    stt: idx + 1,
    name: it.name,
    unit: it.unit || 'm3',
    quantity: (it as any).orderQty || 0,
    unitPrice: (it as any).unitPrice || 0,
    total: ((it as any).orderQty || 0) * ((it as any).unitPrice || 0),
    note: it.notes || '',
    duToanQty: (it as any).estimatedQty || 0,
    luyKeQty: (it as any).cumulativeQtyBefore || (it as any).cumulativeQtyOld || 0
  }));

  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

  return {
    docNumber: 'QTMH-BM02',
    title: order.purpose || 'Phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ',
    date: order.orderDate,
    location: order.location ? order.location.split(',')[0].trim() : 'Tp. Hồ Chí Minh',
    recipients: ['Hội Đồng Thành Viên', 'BGĐ Công ty TNHH MTV Xây Dựng IJC'],
    grounds: [
      `Căn cứ Phiếu đề nghị về việc cung cấp vật tư của Công ty ${order.company || 'TNHH MTV Xây Dựng IJC'}`,
      'Căn cứ Báo giá của đơn vị cung cấp'
    ],
    items,
    totalAmount,
    proposingCompany: order.company || 'IJC',
    soTienBangChu: '', // To be dynamically resolved by the component helper
    thoiHanThanhToan: 'Thanh toán bằng chuyển khoản ngay sau khi nhận được biên bản nghiệm thu và bàn giao vật tư thiết bị dịch vụ, hóa đơn tài chính hợp lệ và hồ sơ thanh toán.',
    mucDichSuDungDiaDiem: order.location || 'Khu vực dự án công trường thi công',
    sourceType: 'BM06',
    projectId: order.projectId || '',
    project_name: order.projectId || (order as any).project_name || '',
    unitId: order.unitId || ''
  };
}

/**
 * Mappings from BM06 Order schema to BM03.2 (Biên bản nghiệm thu bàn giao) schema
 */
export function mapBM06ToBM032(order: BM06OrderData | BM06FormData): BM032Data {
  if ((order as any).bm032Data) {
    const data = (order as any).bm032Data;
    return { ...data, sourceType: 'BM06' };
  }

  const itemsList = order.selectedItems || [];

  // Dynamic automatic mapping if bm032Data is not pre-calculated
  const items = itemsList.map((it, idx) => ({
    id: (it as any).itemId || (it as any).estimateItemId || Math.random().toString(36).substr(2, 9),
    stt: idx + 1,
    description: it.name,
    unit: it.unit || 'm3',
    requestedQty: (it as any).orderQty || 0,
    acceptedQty: (it as any).orderQty || 0,
    note: it.notes || ''
  }));

  function addOneDay(dateStr: string): string {
    if (!dateStr) return '';
    const match = dateStr.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      const d = new Date(year, month, day);
      d.setDate(d.getDate() + 1);
      const newDay = String(d.getDate()).padStart(2, '0');
      const newMonth = String(d.getMonth() + 1).padStart(2, '0');
      const newYear = d.getFullYear();
      return `ngày ${newDay} tháng ${newMonth} năm ${newYear}`;
    }
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const d = new Date(year, month, day);
        d.setDate(d.getDate() + 1);
        const newDay = String(d.getDate()).padStart(2, '0');
        const newMonth = String(d.getMonth() + 1).padStart(2, '0');
        const newYear = d.getFullYear();
        return `${newDay}/${newMonth}/${newYear}`;
      }
    }
    return dateStr;
  }

  const bbntDate = addOneDay(order.orderDate);

  return {
    docNumber: 'QTMH-BM03.2',
    location: order.location ? order.location.split(',')[0].trim() : 'Tp. Hồ Chí Minh',
    date: bbntDate || order.orderDate,
    project: order.projectId || '',
    category: order.unitId || '',
    address: order.location || '',
    senderCompany: 'Đơn vị cung cấp',
    senderList: [
      { name: order.proposer || 'Đại diện Đơn vị cung cấp', position: 'Đại diện', salutation: 'Ông/Bà' }
    ],
    receiverCompany: order.company || 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    receiverList: [
      { name: 'Nguyễn Xuân Nam', position: 'Giám đốc', salutation: 'Ông' },
      { name: 'Nguyễn Thị Thêm', position: 'Kế toán trưởng', salutation: 'Bà' },
      { name: 'Trần Kim Nguyện', position: 'Chỉ huy trưởng', salutation: 'Ông' },
      { name: 'Đỗ Huỳnh Linh Khoa', position: 'Thủ kho', salutation: 'Ông' },
      { name: 'Trần Nam Anh', position: 'NV Thu mua', salutation: 'Ông' }
    ],
    startTime: '08h00',
    startDate: bbntDate || order.orderDate,
    endTime: '17h00',
    endDate: bbntDate || order.orderDate,
    locationDetail: `Tại: ${order.location || 'Công trình'}`,
    grounds: [
      "Hợp đồng nguyên tắc ký giữa các bên và các phụ lục kèm theo;",
      `Tờ trình phê duyệt dự trù kinh phí mua vật tư ${order.id || ''};`,
      "Biên bản giao nhận hàng;"
    ],
    items,
    sourceType: 'BM06',
    projectId: order.projectId || '',
    project_name: order.projectId || (order as any).project_name || '',
    unitId: order.unitId || ''
  };
}

/**
 * Retrieve form data with sourceType selection
 */
export function getFormData(order: BM06OrderData, formType: 'BM02' | 'BM03.2'): any {
  if (!order) return null;

  if (order.sourceType === "BM06") {
    // Preferred: Use structured auto-generation
    return formType === 'BM02' ? mapBM06ToBM02(order) : mapBM06ToBM032(order);
  } else {
    // Fallback: If sourceType is "PDF", return extracted values
    if (formType === 'BM02') {
      return order.bm02Data || mapBM06ToBM02(order);
    } else {
      return order.bm032Data || mapBM06ToBM032(order);
    }
  }
}

/**
 * Determine dynamic source badge string
 */
export function determineDataSource(order: BM06OrderData): "BM06" | "PDF" {
  if (!order) return 'BM06';
  return order.sourceType === 'PDF' ? 'PDF' : 'BM06';
}

/**
 * Subscribe to the document using multi-engine real-time subscription model (Firestore & RTDB)
 */
export function subscribeToForm(
  formId: string, 
  onUpdate: (data: BM06OrderData | null) => void,
  onError: (err: any) => void
): () => void {
  let unsubRTDB: (() => void) | null = null;
  const rtdb = getDB();

  if (rtdb) {
    try {
      const orderRef = ref(rtdb, `bm06Orders/${formId}`);
      unsubRTDB = onValue(orderRef, (snapshot) => {
        if (snapshot.exists()) {
          onUpdate(snapshot.val() as BM06OrderData);
        } else {
          onUpdate(null);
        }
      }, (err) => {
        console.error("RTDB subscription error:", err);
        onError(err);
      });
    } catch (e) {
      console.error("RTDB subscription setup failed:", e);
      onError(e);
    }
  } else {
    onUpdate(null);
  }

  return () => {
    if (unsubRTDB) {
      unsubRTDB();
    }
  };
}

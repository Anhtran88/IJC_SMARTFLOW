import { OrderService } from './OrderService';
import { HistoryService } from './HistoryService';
import { MaterialTypeService } from './MaterialTypeService';
import { MaterialService } from './MaterialService';
import { getDB, ref, get } from '../lib/firebaseService';
import { extractMaPhieu, isTemplateCodeOnly, formatStandardMaPhieu } from '../utils/extractMaPhieu';
import { formatProjectLocation } from '../lib/formatUtils';

export interface ReportFilter {
  maPhieu?: string;
  loaiVatTu?: string;
  tenVatTu?: string;
  duAn?: string;
  tuNgay?: string;
  denNgay?: string;
  trangThai?: string;
}

export interface SummaryReport {
  tongSoPhieu: number;
  tongGiaTri: number;
  tongSoVatTu: number;
  tongKhoiLuong: number;
  giaTriTrungBinhPerPhieu: number;
}

export interface OrderReportRow {
  id: string;
  maPhieu: string;
  timestamp: number;
  ngay: string;
  noiDung: string;
  loaiVatTu: string;
  soLuongVatTu: number;
  tongTien: number; // Lấy trực tiếp grandTotal từ Snapshot BM02
  vatAmount: number;
  vatPercent: number;
  showVat: boolean;
  trangThai: string;
  duAn: string;
  rawDuAn?: string;
  bm02Data?: any;
  bm032Data?: any;
  items: any[];
}

export interface MaterialReportRow {
  tenVatTu: string;
  donVi: string;
  soPhieu: number;
  tongKhoiLuong: number;
  donGiaBinhQuan: number;
  donGiaMoiNhat: number;
  tongTien: number;
  maPhieuList: string[];
}

export interface CumulativeReportRow {
  tenVatTu: string;
  donVi: string;
  tongDaTrinh: number;
  luyKe: number;
  soPhieu: number;
  chiTietPhieu: Array<{
    maPhieu: string;
  
    ngay: string;
    duAn: string;
    khoiLuong: number;
    donGia: number;
    thanhTien: number;
  }>;
}

export interface PriceFluctuationRow {
  id: string;
  thoiGian: number;
  ngay: string;
  user: string;
  duAn: string;
  can: string;
  maPhieu: string;
  
  tenVatTu: string;
  maVatTu: string;
  giaCu: number;
  giaMoi: number;
  chenhLech: number;
  phanTramChenhLech: number;
  nguon: string;
}

export interface MissingPriceMaterialRow {
  tenVatTu: string;
  donVi: string;
  maPhieu: string;
  
  ngay: string;
  duAn: string;
  loaiVatTuId: string;
  loaiVatTuTen: string;
  itemId?: string;
  quantity: number;
}

export interface OcrReportData {
  tongOcr: number;
  soVatTuKhopDanhMuc: number;
  soVatTuChuaKhop: number;
  soVatTuDuocChinhSua: number;
  soVatTuDuocThemMoi: number;
  logs: Array<{
    id: string;
    thoiGian: number;
    ngay: string;
    tenFile: string;
    maPhieu: string;
  
    soVatTuNhanDien: number;
    soVatTuKhop: number;
    soVatTuMoi: number;
    user?: string;
  }>;
}

function parseDateToTimestamp(dateStr: any): number {
  if (!dateStr) return 0;
  const str = String(dateStr).trim();

  // "ngày DD tháng MM năm YYYY"
  const matchVN = str.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
  if (matchVN) {
    const d = parseInt(matchVN[1], 10);
    const m = parseInt(matchVN[2], 10) - 1;
    const y = parseInt(matchVN[3], 10);
    return new Date(y, m, d).getTime();
  }

  // "DD/MM/YYYY"
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const p = str.split('/');
    return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10)).getTime();
  }

  // "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const p = str.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)).getTime();
  }

  const dt = new Date(str);
  return isNaN(dt.getTime()) ? 0 : dt.getTime();
}

function formatDateDisplay(dateStr: any): string {
  if (!dateStr) return 'N/A';
  const ts = parseDateToTimestamp(dateStr);
  if (!ts) return String(dateStr);
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export class ReportService {
  private static cachedRawOrders: any[] | null = null;
  private static cachedPriceLogs: any[] | null = null;
  private static cachedOcrLogs: any[] | null = null;
  private static lastCacheTime: number = 0;
  private static readonly CACHE_TTL = 30000; // 30 seconds

  /**
   * Resets in-memory cache to force fresh data load
   */
  static clearCache(): void {
    this.cachedRawOrders = null;
    this.cachedPriceLogs = null;
    this.cachedOcrLogs = null;
    this.lastCacheTime = 0;
  }

  /**
   * Fetches all raw order records (BM02 / BM06 Snapshots / Lịch sử) from Firebase/RTDB
   */
  static async loadAllRawOrders(forceRefresh = false): Promise<any[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedRawOrders && (now - this.lastCacheTime < this.CACHE_TTL)) {
      return this.cachedRawOrders;
    }

    try {
      const [bm02OrdersList, bm06OrdersList, allHistoryList] = await Promise.all([
        OrderService.fetchBM02Orders(),
        OrderService.fetchBM06Orders(),
        HistoryService.fetchAllLichSu()
      ]);

      const uniqueMap = new Map<string, any>();

      const safeParseJSON = (data: any) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (typeof data === 'string') {
          try { return JSON.parse(data); } catch { return []; }
        }
        return [];
      };

      const processRecord = (rec: any) => {
        if (!rec) return;
        const code = extractMaPhieu(rec);
        const rawId = String(rec.id || rec.snapshotId || rec.docNumber || code || '')
          .replace(/^(BM06|BM02|BM03\.2)-/i, '')
          .trim();

        // Consistent primary key for deduplication
        const primaryKey = (code && !isTemplateCodeOnly(code))
          ? code.toLowerCase()
          : (rawId ? rawId.toLowerCase() : String(rec.id).toLowerCase());

        if (!primaryKey) return;

        // Ensure we preserve the grandTotal directly from Snapshot
        let directGrandTotal = 0;
        if (rec.vatSnapshot && typeof rec.vatSnapshot.grandTotal === 'number' && rec.vatSnapshot.grandTotal > 0) {
          directGrandTotal = rec.vatSnapshot.grandTotal;
        } else if (typeof rec.totalAmountWithVat === 'number' && rec.totalAmountWithVat > 0) {
          directGrandTotal = rec.totalAmountWithVat;
        } else if (typeof rec.totalWithTax === 'number' && rec.totalWithTax > 0) {
          directGrandTotal = rec.totalWithTax;
        } else if (typeof rec.tongTien === 'number' && rec.tongTien > 0) {
          directGrandTotal = rec.tongTien;
        } else if (typeof rec.totalAmount === 'number' && rec.totalAmount > 0) {
          directGrandTotal = rec.totalAmount;
        }

        const items = rec.bm02?.items || rec.items || rec.danhSachVatTu || rec.selectedItems || [];
        const normalizedItems = safeParseJSON(items);

        const recordTitle = rec.mucDichSuDungNoiDung || rec.tieuDe || rec.title || rec.purpose || 'Phiếu trình vật tư';
        const rawLocation = rec.mucDichSuDungDiaDiem || rec.location || rec.diaDiem || rec.proposingCompany || rec.company || rec.projectId || 'Dự án CHƯA TÊN';
        const formattedLocation = formatProjectLocation(rawLocation);
        const recordType = rec.loaiTaiLieu || rec.type || (String(rec.id || '').startsWith('BM06') ? 'BM06' : 'BM02');
        const recordDate = rec.orderDate || rec.date || rec.ngayLap || rec.createdAt || rec.updatedAt || '';

        const cleanRecord = {
          ...rec,
          id: rec.id || primaryKey,
          docNumber: rec.docNumber || rec.id || primaryKey,
          maPhieu: code ? formatStandardMaPhieu(code) : (rawId ? formatStandardMaPhieu(rawId) : primaryKey),
          maPhieuNguon: code ? formatStandardMaPhieu(code) : primaryKey,
          grandTotal: directGrandTotal,
          tongTien: directGrandTotal,
          totalWithTax: directGrandTotal,
          items: normalizedItems,
          loaiVatTu: rec.loaiVatTu || rec.materialTypeId || 'BeTong',
          loaiTaiLieu: recordType,
          type: recordType,
          date: recordDate,
          orderDate: recordDate,
          ngayLap: recordDate,
          createdAt: rec.createdAt || rec.updatedAt || Date.now(),
          updatedAt: rec.updatedAt || rec.createdAt || Date.now(),
          title: recordTitle,
          mucDichSuDungNoiDung: recordTitle,
          duAn: formattedLocation,
          rawDuAn: rawLocation,
          diaDiem: formattedLocation,
          mucDichSuDungDiaDiem: rawLocation,
          trangThai: rec.trangThai || rec.status || 'Đã lưu'
        };

        const existing = uniqueMap.get(primaryKey);
        if (!existing) {
          uniqueMap.set(primaryKey, cleanRecord);
        } else {
          // Merge / update existing record with newer or more complete data
          const t1 = parseDateToTimestamp(existing.updatedAt || existing.createdAt || existing.date);
          const t2 = parseDateToTimestamp(cleanRecord.updatedAt || cleanRecord.createdAt || cleanRecord.date);
          const mergedItems = cleanRecord.items && cleanRecord.items.length > 0 ? cleanRecord.items : existing.items;
          const mergedTotal = cleanRecord.grandTotal > 0 ? cleanRecord.grandTotal : existing.grandTotal;

          if (t2 >= t1) {
            uniqueMap.set(primaryKey, {
              ...existing,
              ...cleanRecord,
              items: mergedItems,
              grandTotal: mergedTotal,
              tongTien: mergedTotal,
              totalWithTax: mergedTotal
            });
          } else {
            uniqueMap.set(primaryKey, {
              ...cleanRecord,
              ...existing,
              items: existing.items && existing.items.length > 0 ? existing.items : mergedItems,
              grandTotal: existing.grandTotal > 0 ? existing.grandTotal : mergedTotal,
              tongTien: existing.grandTotal > 0 ? existing.grandTotal : mergedTotal,
              totalWithTax: existing.grandTotal > 0 ? existing.grandTotal : mergedTotal
            });
          }
        }
      };

      (allHistoryList || []).forEach(processRecord);
      (bm02OrdersList || []).forEach(processRecord);
      (bm06OrdersList || []).forEach(processRecord);

      this.cachedRawOrders = Array.from(uniqueMap.values());
      this.lastCacheTime = now;
      return this.cachedRawOrders;
    } catch (e) {
      console.error('ReportService.loadAllRawOrders error:', e);
      return this.cachedRawOrders || [];
    }
  }

  /**
   * Fetches Price Change logs from Firebase RTDB `logs/priceChangeLogs`
   */
  static async loadPriceChangeLogs(forceRefresh = false): Promise<any[]> {
    if (!forceRefresh && this.cachedPriceLogs) {
      return this.cachedPriceLogs;
    }

    try {
      const db = getDB();
      if (!db) return [];
      const snap = await get(ref(db, 'logs/priceChangeLogs'));
      if (snap.exists()) {
        const val = snap.val();
        const list = Object.keys(val).map(k => ({ ...val[k], id: k }));
        this.cachedPriceLogs = list;
        return list;
      }
      return [];
    } catch (e) {
      console.error('ReportService.loadPriceChangeLogs error:', e);
      return [];
    }
  }

  /**
   * Fetches OCR mapping logs from Firebase RTDB `logs/ocrMappingLogs`
   */
  static async loadOcrLogs(forceRefresh = false): Promise<any[]> {
    if (!forceRefresh && this.cachedOcrLogs) {
      return this.cachedOcrLogs;
    }

    try {
      const db = getDB();
      if (!db) return [];
      const snap = await get(ref(db, 'logs/ocrMappingLogs'));
      if (snap.exists()) {
        const val = snap.val();
        const list = Object.keys(val).map(k => ({ ...val[k], id: k }));
        this.cachedOcrLogs = list;
        return list;
      }
      return [];
    } catch (e) {
      console.error('ReportService.loadOcrLogs error:', e);
      return [];
    }
  }

  /**
   * Filters raw orders according to user filters
   */
  static filterOrders(orders: any[], filter: ReportFilter): any[] {
    if (!orders || orders.length === 0) return [];

    const maPhieuSearch = (filter.maPhieu || '').trim().toLowerCase();
    const loaiVatTuFilter = (filter.loaiVatTu || 'all').trim();
    const tenVatTuSearch = (filter.tenVatTu || '').trim().toLowerCase();
    const duAnSearch = (filter.duAn || '').trim().toLowerCase();
    const trangThaiFilter = (filter.trangThai || 'all').trim();

    const tuNgayTs = filter.tuNgay ? parseDateToTimestamp(filter.tuNgay) : 0;
    const denNgayTs = filter.denNgay ? parseDateToTimestamp(filter.denNgay) + (86400000 - 1) : 0;

    return orders.filter(ord => {
      // 1. Filter by Mã phiếu
      if (maPhieuSearch) {
        const code = String(ord.maPhieu || ord.id || '').toLowerCase();
        if (!code.includes(maPhieuSearch)) return false;
      }

      // 2. Filter by Loại vật tư
      if (loaiVatTuFilter && loaiVatTuFilter !== 'all') {
        const ordLoai = String(ord.loaiVatTu || '').toLowerCase();
        if (ordLoai !== loaiVatTuFilter.toLowerCase()) return false;
      }

      // 3. Filter by Tên vật tư
      if (tenVatTuSearch) {
        const items = ord.items || [];
        const hasItem = items.some((it: any) => {
          const name = String(it.name || it.tenVatTu || it.description || '').toLowerCase();
          return name.includes(tenVatTuSearch);
        });
        if (!hasItem) return false;
      }

      // 4. Filter by Dự án / Công trình
      if (duAnSearch) {
        const proj = String(ord.duAn || ord.rawDuAn || ord.location || ord.mucDichSuDungDiaDiem || ord.projectId || ord.company || '').toLowerCase();
        if (!proj.includes(duAnSearch)) return false;
      }

      // 5. Filter by Thời gian (từ ngày - đến ngày)
      if (tuNgayTs > 0 || denNgayTs > 0) {
        const ordTs = parseDateToTimestamp(ord.date || ord.orderDate || ord.createdAt);
        if (tuNgayTs > 0 && ordTs < tuNgayTs) return false;
        if (denNgayTs > 0 && ordTs > denNgayTs) return false;
      }

      // 6. Filter by Trạng thái
      if (trangThaiFilter && trangThaiFilter !== 'all') {
        const status = String(ord.trangThai || 'Đã lưu').toLowerCase();
        if (status !== trangThaiFilter.toLowerCase()) return false;
      }

      return true;
    });
  }

  /**
   * REPORT 1: Báo cáo Tổng quan (Summary Cards)
   * QUAN TRỌNG: Lấy trực tiếp grandTotal từ Snapshot BM02
   */
  static getSummaryReport(filteredOrders: any[]): SummaryReport {
    if (!filteredOrders || filteredOrders.length === 0) {
      return {
        tongSoPhieu: 0,
        tongGiaTri: 0,
        tongSoVatTu: 0,
        tongKhoiLuong: 0,
        giaTriTrungBinhPerPhieu: 0
      };
    }

    const tongSoPhieu = filteredOrders.length;
    let tongGiaTri = 0;
    let tongKhoiLuong = 0;
    const distinctMaterialsSet = new Set<string>();

    filteredOrders.forEach(ord => {
      // Lấy trực tiếp grandTotal từ Snapshot BM02
      tongGiaTri += Number(ord.grandTotal) || 0;

      const items = ord.items || [];
      items.forEach((it: any) => {
        const name = (it.name || it.tenVatTu || it.description || '').trim();
        if (name) distinctMaterialsSet.add(name.toLowerCase());
        const qty = Number(it.quantity || it.orderQty || it.acceptedQty || 0);
        tongKhoiLuong += qty;
      });
    });

    const tongSoVatTu = distinctMaterialsSet.size;
    const giaTriTrungBinhPerPhieu = tongSoPhieu > 0 ? Math.round(tongGiaTri / tongSoPhieu) : 0;

    return {
      tongSoPhieu,
      tongGiaTri,
      tongSoVatTu,
      tongKhoiLuong,
      giaTriTrungBinhPerPhieu
    };
  }

  /**
   * REPORT 2: Báo cáo Theo Mã phiếu
   */
  static getOrderReportRows(filteredOrders: any[]): OrderReportRow[] {
    return (filteredOrders || []).map(ord => {
      const items = ord.items || [];
      const vatSnap = ord.vatSnapshot || ord.bm02?.vatSnapshot;
      const showVat = vatSnap ? Boolean(vatSnap.showVAT || vatSnap.showVat) : Boolean(ord.showVat || ord.showVAT);
      const vatPercent = vatSnap?.vatPercent !== undefined ? Number(vatSnap.vatPercent) : Number(ord.taxRate || 10);
      const vatAmount = vatSnap?.vatAmount !== undefined ? Number(vatSnap.vatAmount) : (showVat ? Math.round(((ord.grandTotal || 0) * vatPercent) / (100 + vatPercent)) : 0);

      const rawLocation = ord.rawDuAn || ord.mucDichSuDungDiaDiem || ord.location || ord.duAn || 'Dự án CHƯA TÊN';
      const formattedLocation = formatProjectLocation(rawLocation);

      return {
        id: ord.id,
        maPhieu: ord.maPhieu || ord.id,
        timestamp: parseDateToTimestamp(ord.date || ord.orderDate || ord.createdAt) || 0,
        ngay: formatDateDisplay(ord.date || ord.orderDate || ord.createdAt),
        noiDung: ord.mucDichSuDungNoiDung || ord.bm02RequestContent || (ord.title && !ord.title.toLowerCase().startsWith('tờ trình') && !ord.title.toLowerCase().startsWith('v/v:') ? ord.title : '') || 'Chi phí cung cấp vật tư',
        loaiVatTu: ord.loaiVatTu || 'BeTong',
        soLuongVatTu: items.length,
        tongTien: Number(ord.grandTotal) || 0, // Trực tiếp từ grandTotal Snapshot
        vatAmount,
        vatPercent,
        showVat,
        trangThai: ord.trangThai || 'Đã lưu',
        duAn: formattedLocation,
        rawDuAn: rawLocation,
        bm02Data: ord.bm02 || ord,
        bm032Data: ord.bm032,
        items
      };
    });
  }

  /**
   * REPORT 3: Báo cáo Theo vật tư
   */
  static getMaterialReportRows(filteredOrders: any[]): MaterialReportRow[] {
    const map = new Map<string, {
      tenVatTu: string;
      donVi: string;
      maPhieuSet: Set<string>;
      tongKhoiLuong: number;
      tongTien: number;
      latestPrice: number;
    }>();

    (filteredOrders || []).forEach(ord => {
      const code = ord.maPhieu || ord.id;
      const items = ord.items || [];

      items.forEach((it: any) => {
        const name = (it.name || it.tenVatTu || it.description || '').trim();
        if (!name) return;
        const unit = (it.unit || 'm3').trim();
        const key = `${name.toLowerCase()}_${unit.toLowerCase()}`;

        const qty = Number(it.quantity || it.orderQty || 0);
        const price = Number(it.unitPrice || 0);
        const lineTotal = it.total !== undefined ? Number(it.total) : Math.round(qty * price * 100) / 100;

        if (!map.has(key)) {
          map.set(key, {
            tenVatTu: name,
            donVi: unit,
            maPhieuSet: new Set([code]),
            tongKhoiLuong: qty,
            tongTien: lineTotal,
            latestPrice: price
          });
        } else {
          const ex = map.get(key)!;
          ex.maPhieuSet.add(code);
          ex.tongKhoiLuong += qty;
          ex.tongTien += lineTotal;
          if (price > 0) ex.latestPrice = price;
        }
      });
    });

    return Array.from(map.values()).map(v => ({
      tenVatTu: v.tenVatTu,
      donVi: v.donVi,
      soPhieu: v.maPhieuSet.size,
      tongKhoiLuong: v.tongKhoiLuong,
      donGiaBinhQuan: v.tongKhoiLuong > 0 ? Math.round(v.tongTien / v.tongKhoiLuong) : v.latestPrice,
      donGiaMoiNhat: v.latestPrice,
      tongTien: v.tongTien,
      maPhieuList: Array.from(v.maPhieuSet)
    }));
  }

  /**
   * REPORT 4: Báo cáo Lũy kế vật tư
   */
  static getCumulativeReportRows(filteredOrders: any[]): CumulativeReportRow[] {
    const map = new Map<string, {
      tenVatTu: string;
      donVi: string;
      tongDaTrinh: number;
      luyKe: number;
      maPhieuSet: Set<string>;
      chiTietPhieu: Array<{
        maPhieu: string;
  
        ngay: string;
        duAn: string;
        khoiLuong: number;
        donGia: number;
        thanhTien: number;
      }>;
    }>();

    (filteredOrders || []).forEach(ord => {
      const code = ord.maPhieu || ord.id;
      const dateStr = formatDateDisplay(ord.date || ord.orderDate || ord.createdAt);
      const projStr = ord.duAn || ord.location || 'Dự án CHƯA TÊN';
      const items = ord.items || [];

      items.forEach((it: any) => {
        const name = (it.name || it.tenVatTu || it.description || '').trim();
        if (!name) return;
        const unit = (it.unit || 'm3').trim();
        const key = `${name.toLowerCase()}_${unit.toLowerCase()}`;

        const qty = Number(it.quantity || it.orderQty || 0);
        const luyKeOld = Number(it.luyKeQty || it.cumulativeQtyOld || it.cumulativeQtyBefore || 0);
        const currentLuyKe = luyKeOld + qty;
        const price = Number(it.unitPrice || 0);
        const lineTotal = it.total !== undefined ? Number(it.total) : Math.round(qty * price * 100) / 100;

        if (!map.has(key)) {
          map.set(key, {
            tenVatTu: name,
            donVi: unit,
            tongDaTrinh: qty,
            luyKe: currentLuyKe,
            maPhieuSet: new Set([code]),
            chiTietPhieu: [{
              maPhieu: code,
              ngay: dateStr,
              duAn: projStr,
              khoiLuong: qty,
              donGia: price,
              thanhTien: lineTotal
            }]
          });
        } else {
          const ex = map.get(key)!;
          ex.tongDaTrinh += qty;
          if (currentLuyKe > ex.luyKe) ex.luyKe = currentLuyKe;
          ex.maPhieuSet.add(code);
          ex.chiTietPhieu.push({
            maPhieu: code,
            ngay: dateStr,
            duAn: projStr,
            khoiLuong: qty,
            donGia: price,
            thanhTien: lineTotal
          });
        }
      });
    });

    return Array.from(map.values()).map(v => ({
      tenVatTu: v.tenVatTu,
      donVi: v.donVi,
      tongDaTrinh: v.tongDaTrinh,
      luyKe: Math.max(v.luyKe, v.tongDaTrinh),
      soPhieu: v.maPhieuSet.size,
      chiTietPhieu: v.chiTietPhieu
    }));
  }

  /**
   * REPORT 5: Báo cáo Biến động đơn giá
   */
  static getPriceFluctuationRows(priceLogs: any[], filter: ReportFilter): PriceFluctuationRow[] {
    if (!priceLogs || priceLogs.length === 0) return [];

    const maPhieuSearch = (filter.maPhieu || '').trim().toLowerCase();
    const tenVatTuSearch = (filter.tenVatTu || '').trim().toLowerCase();
    const tuNgayTs = filter.tuNgay ? parseDateToTimestamp(filter.tuNgay) : 0;
    const denNgayTs = filter.denNgay ? parseDateToTimestamp(filter.denNgay) + (86400000 - 1) : 0;

    return priceLogs
      .filter(log => {
        if (!log) return false;
        if (maPhieuSearch && !String(log.maPhieu || '').toLowerCase().includes(maPhieuSearch)) return false;
        if (tenVatTuSearch && !String(log.tenVatTu || '').toLowerCase().includes(tenVatTuSearch)) return false;
        if (tuNgayTs > 0 || denNgayTs > 0) {
          const logTs = log.thoiGian || parseDateToTimestamp(log.ngayCapNhat);
          if (tuNgayTs > 0 && logTs < tuNgayTs) return false;
          if (denNgayTs > 0 && logTs > denNgayTs) return false;
        }
        return true;
      })
      .map(log => {
        const giaCu = Number(log.giaCu || 0);
        const giaMoi = Number(log.giaMoi || 0);
        const chenhLech = giaMoi - giaCu;
        const phanTramChenhLech = giaCu > 0 ? ((giaMoi - giaCu) / giaCu) * 100 : 0;

        return {
          id: log.id || Math.random().toString(),
          thoiGian: log.thoiGian || Date.now(),
          ngay: formatDateDisplay(log.thoiGian || log.ngayCapNhat),
          user: log.user || log.nguoiThucHien || 'Hệ thống',
          duAn: log.duAn || 'Dự án',
          can: log.can || 'Căn/Hạng mục',
          maPhieu: log.maPhieu || 'BM02',
          tenVatTu: log.tenVatTu || 'Vật tư',
          maVatTu: log.maVatTu || '',
          giaCu,
          giaMoi,
          chenhLech,
          phanTramChenhLech,
          nguon: log.nguon || 'BM02'
        };
      })
      .sort((a, b) => b.thoiGian - a.thoiGian);
  }

  /**
   * REPORT 6: Báo cáo Vật tư chưa có đơn giá
   */
  static getMissingPriceRows(filteredOrders: any[]): MissingPriceMaterialRow[] {
    const list: MissingPriceMaterialRow[] = [];

    (filteredOrders || []).forEach(ord => {
      const code = ord.maPhieu || ord.id;
      const dateStr = formatDateDisplay(ord.date || ord.orderDate || ord.createdAt);
      const projStr = ord.duAn || ord.location || 'Dự án';
      const items = ord.items || [];

      items.forEach((it: any) => {
        const price = Number(it.unitPrice || 0);
        if (price <= 0) {
          list.push({
            tenVatTu: it.name || it.tenVatTu || 'Chưa đặt tên',
            donVi: it.unit || 'm3',
            maPhieu: code,
            ngay: dateStr,
            duAn: projStr,
            loaiVatTuId: ord.loaiVatTu || 'BeTong',
            loaiVatTuTen: ord.loaiVatTu || 'Bê tông & Vữa',
            itemId: it.id || it.matchedCatalogId,
            quantity: Number(it.quantity || it.orderQty || 0)
          });
        }
      });
    });

    return list;
  }

  /**
   * REPORT 7: Báo cáo AI/OCR
   */
  static getOcrReportData(filteredOrders: any[], ocrLogs: any[]): OcrReportData {
    let soVatTuKhopDanhMuc = 0;
    let soVatTuChuaKhop = 0;
    let soVatTuDuocChinhSua = 0;
    let soVatTuDuocThemMoi = 0;

    (filteredOrders || []).forEach(ord => {
      const items = ord.items || [];
      items.forEach((it: any) => {
        if (it.isMatchedWithCatalog) {
          soVatTuKhopDanhMuc++;
        } else {
          soVatTuChuaKhop++;
        }
        if (it.isUserEditedPostFill) {
          soVatTuDuocChinhSua++;
        }
        if (it.isNewlyAddedToCatalog) {
          soVatTuDuocThemMoi++;
        }
      });
    });

    const parsedLogs = (ocrLogs || []).map(l => ({
      id: l.id || Math.random().toString(),
      thoiGian: l.thoiGian || Date.now(),
      ngay: formatDateDisplay(l.thoiGian || l.createdAt),
      tenFile: l.tenFile || l.originalFileName || 'File PDF/Ảnh',
      maPhieu: l.maPhieu || 'BM02',
      soVatTuNhanDien: l.soVatTuNhanDien || l.totalItems || 0,
      soVatTuKhop: l.soVatTuKhop || 0,
      soVatTuMoi: l.soVatTuMoi || 0,
      user: l.user || l.nguoiThucHien
    }));

    const tongOcr = Math.max(parsedLogs.length, filteredOrders.filter(o => o.sourceType === 'PDF' || o.originalFileName).length);

    return {
      tongOcr,
      soVatTuKhopDanhMuc,
      soVatTuChuaKhop,
      soVatTuDuocChinhSua,
      soVatTuDuocThemMoi,
      logs: parsedLogs
    };
  }
}

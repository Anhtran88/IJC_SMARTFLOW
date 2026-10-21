import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Filter,
  RefreshCw,
  Download,
  Search,
  Calendar,
  Layers,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Eye,
  CheckCircle2,
  X,
  Database,
  Building2,
  Tag,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

import {
  ReportService,
  ReportFilter,
  SummaryReport,
  OrderReportRow,
  MaterialReportRow,
  CumulativeReportRow,
  PriceFluctuationRow,
  MissingPriceMaterialRow,
  OcrReportData
} from '../services/ReportService';

import { exportReportToExcel } from '../services/reportExcelExport';
import { BM02SnapshotViewerModal } from './BM02SnapshotViewerModal';
import { MaterialMatchingService } from '../services/MaterialMatchingService';

interface ReportModuleProps {
  onSelectOrderRecord?: (record: any) => void;
  setToast?: (toast: { message: string; type: 'success' | 'error' | 'info' }) => void;
  refreshTrigger?: number;
}

export const ReportModule: React.FC<ReportModuleProps> = ({ onSelectOrderRecord, setToast, refreshTrigger }) => {
  // State for active sub-report tab
  const [activeTab, setActiveTab] = useState<
    'summary' | 'order' | 'material' | 'cumulative' | 'price' | 'missing' | 'ocr'
  >('order');

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Filter State
  const [filter, setFilter] = useState<ReportFilter>({
    maPhieu: '',
    loaiVatTu: 'all',
    tenVatTu: '',
    duAn: '',
    tuNgay: '',
    denNgay: '',
    trangThai: 'all'
  });

  // Data States
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [priceLogs, setPriceLogs] = useState<any[]>([]);
  const [ocrLogs, setOcrLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);

  // Snapshot Viewer Modal State
  const [selectedSnapshotOrder, setSelectedSnapshotOrder] = useState<any | null>(null);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState<boolean>(false);

  // Modal for Updating Missing Price
  const [missingPriceModalItem, setMissingPriceModalItem] = useState<MissingPriceMaterialRow | null>(null);
  const [newPriceInput, setNewPriceInput] = useState<string>('');
  const [isUpdatingPrice, setIsUpdatingPrice] = useState<boolean>(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, activeTab]);

  // Load Data Effect - Chỉ tải khi người dùng nhấn nút "Tải Lại"
  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      if (forceRefresh) {
        ReportService.clearCache();
      }
      const [ordersData, logsData, ocrDataList] = await Promise.all([
        ReportService.loadAllRawOrders(forceRefresh),
        ReportService.loadPriceChangeLogs(forceRefresh),
        ReportService.loadOcrLogs(forceRefresh)
      ]);

      setRawOrders(ordersData);
      setPriceLogs(logsData);
      setOcrLogs(ocrDataList);
      setHasLoaded(true);
    } catch (e: any) {
      console.error('Lỗi tải dữ liệu báo cáo:', e);
      if (setToast) setToast({ message: 'Lỗi tải dữ liệu báo cáo: ' + (e.message || e), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Không tự động gọi loadData() khi mount hoặc khi refreshTrigger thay đổi để tiết kiệm tài nguyên
  // Chỉ tải khi người dùng chủ động nhấn nút "Tải Lại"

  // Filtered Orders Computation
  const filteredOrders = useMemo(() => {
    return ReportService.filterOrders(rawOrders, filter);
  }, [rawOrders, filter]);

  // Derived Reports Computation
  const summaryReport: SummaryReport = useMemo(() => {
    return ReportService.getSummaryReport(filteredOrders);
  }, [filteredOrders]);

  const orderReportRows: OrderReportRow[] = useMemo(() => {
    const rows = ReportService.getOrderReportRows(filteredOrders);
    // Sort newest first
    return rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [filteredOrders]);

  const paginatedOrderReportRows = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return orderReportRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [orderReportRows, currentPage]);

  const totalPages = Math.ceil(orderReportRows.length / ITEMS_PER_PAGE);

  const materialReportRows: MaterialReportRow[] = useMemo(() => {
    return ReportService.getMaterialReportRows(filteredOrders);
  }, [filteredOrders]);

  const cumulativeReportRows: CumulativeReportRow[] = useMemo(() => {
    return ReportService.getCumulativeReportRows(filteredOrders);
  }, [filteredOrders]);

  const priceFluctuationRows: PriceFluctuationRow[] = useMemo(() => {
    return ReportService.getPriceFluctuationRows(priceLogs, filter);
  }, [priceLogs, filter]);

  const missingPriceRows: MissingPriceMaterialRow[] = useMemo(() => {
    return ReportService.getMissingPriceRows(filteredOrders);
  }, [filteredOrders]);

  const ocrReportData: OcrReportData = useMemo(() => {
    return ReportService.getOcrReportData(filteredOrders, ocrLogs);
  }, [filteredOrders, ocrLogs]);

  // Excel Export Handler
  const handleExportExcel = async () => {
    if (!hasLoaded || rawOrders.length === 0) {
      if (setToast) setToast({ message: 'Vui lòng nhấn nút "Tải Lại" để nạp dữ liệu trước khi xuất Excel!', type: 'info' });
      return;
    }
    try {
      await exportReportToExcel(
        activeTab,
        filter,
        summaryReport,
        orderReportRows,
        materialReportRows,
        cumulativeReportRows,
        priceFluctuationRows,
        missingPriceRows,
        ocrReportData
      );
      if (setToast) setToast({ message: 'Đã xuất file Excel thành công!', type: 'success' });
    } catch (e: any) {
      console.error('Lỗi xuất Excel:', e);
      if (setToast) setToast({ message: 'Lỗi xuất Excel: ' + (e.message || e), type: 'error' });
    }
  };

  // Open Snapshot Modal
  const handleOpenSnapshot = (orderRecord: any) => {
    setSelectedSnapshotOrder(orderRecord);
    setIsSnapshotModalOpen(true);
  };

  // Submit missing price update to catalog
  const handleSaveMissingPrice = async () => {
    if (!missingPriceModalItem) return;
    const priceNum = Number(newPriceInput);
    if (isNaN(priceNum) || priceNum <= 0) {
      if (setToast) setToast({ message: 'Vui lòng nhập đơn giá hợp lệ lớn hơn 0!', type: 'error' });
      return;
    }

    setIsUpdatingPrice(true);
    try {
      const loaiId = missingPriceModalItem.loaiVatTuId || 'BeTong';
      await MaterialMatchingService.addNewMaterialToCatalog(loaiId, {
        name: missingPriceModalItem.tenVatTu,
        unit: missingPriceModalItem.donVi,
        unitPrice: priceNum
      });

      if (setToast) {
        setToast({
          message: `Đã cập nhật đơn giá ${priceNum.toLocaleString('vi-VN')} đ cho vật tư "${missingPriceModalItem.tenVatTu}"!`,
          type: 'success'
        });
      }

      setMissingPriceModalItem(null);
      setNewPriceInput('');
      await loadData(true);
    } catch (e: any) {
      console.error('Lỗi cập nhật đơn giá:', e);
      if (setToast) setToast({ message: 'Lỗi: ' + (e.message || e), type: 'error' });
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-2.5 pb-4 animate-fade-in text-slate-100">
      {/* 1. HEADER BAR (COMPACT) */}
      <div className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-2.5 px-4 rounded-xl shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-blue-600/30 text-blue-400 rounded-lg border border-blue-500/40 shrink-0">
            <Layers size={18} />
          </div>
          <div className="min-w-0 truncate">
            <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">HỆ THỐNG BÁO CÁO BM02 SMARTFLOW</h1>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block">
              Tổng hợp dữ liệu Snapshot BM02, BM03.2, Lũy kế, Biến động đơn giá & AI OCR
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Tải Lại</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow border border-emerald-400/30 transition-all cursor-pointer active:scale-95"
          >
            <Download size={13} />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* 2. FILTER PANEL (COMPACT 1-2 LINES) */}
      <div className="bg-slate-900/90 border border-slate-800 p-2.5 px-3 rounded-xl shadow-md space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400 uppercase tracking-wider">
            <Filter size={13} />
            <span>Bộ Lọc Dữ Liệu Báo Cáo</span>
          </div>
          {(filter.maPhieu ||
            filter.loaiVatTu !== 'all' ||
            filter.tenVatTu ||
            filter.duAn ||
            filter.tuNgay ||
            filter.denNgay ||
            filter.trangThai !== 'all') && (
            <button
              onClick={() =>
                setFilter({
                  maPhieu: '',
                  loaiVatTu: 'all',
                  tenVatTu: '',
                  duAn: '',
                  tuNgay: '',
                  denNgay: '',
                  trangThai: 'all'
                })
              }
              className="text-[10px] text-rose-400 hover:text-rose-300 underline font-bold cursor-pointer"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {/* Mã phiếu */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Mã Phiếu</label>
            <div className="relative">
              <input
                type="text"
                placeholder="VD: BM02-2603..."
                value={filter.maPhieu}
                onChange={e => setFilter(prev => ({ ...prev, maPhieu: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 pr-6 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 h-7"
              />
              <Search size={11} className="absolute right-2 top-2 text-slate-500" />
            </div>
          </div>

          {/* Loại vật tư */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Loại Vật Tư</label>
            <select
              value={filter.loaiVatTu}
              onChange={e => setFilter(prev => ({ ...prev, loaiVatTu: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer h-7"
            >
              <option value="all">Tất cả loại VT</option>
              <option value="BeTong">Bê tông & Vữa</option>
              <option value="Thep">Thép & Kim loại</option>
              <option value="GachCatDa">Gạch - Cát - Đá</option>
              <option value="Khac">Vật tư khác</option>
            </select>
          </div>

          {/* Tên vật tư */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Tên Vật Tư</label>
            <input
              type="text"
              placeholder="VD: C30, Thép Ø18..."
              value={filter.tenVatTu}
              onChange={e => setFilter(prev => ({ ...prev, tenVatTu: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 h-7"
            />
          </div>

          {/* Dự án / Công trình */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Dự Án / Công Trình</label>
            <input
              type="text"
              placeholder="VD: Biconsi..."
              value={filter.duAn}
              onChange={e => setFilter(prev => ({ ...prev, duAn: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 h-7"
            />
          </div>

          {/* Từ ngày */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Từ Ngày</label>
            <input
              type="date"
              value={filter.tuNgay}
              onChange={e => setFilter(prev => ({ ...prev, tuNgay: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 h-7"
            />
          </div>

          {/* Đến ngày */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Đến Ngày</label>
            <input
              type="date"
              value={filter.denNgay}
              onChange={e => setFilter(prev => ({ ...prev, denNgay: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 h-7"
            />
          </div>

          {/* Trạng thái */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Trạng Thái</label>
            <select
              value={filter.trangThai}
              onChange={e => setFilter(prev => ({ ...prev, trangThai: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer h-7"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="Đã lưu">Đã lưu</option>
              <option value="Đã duyệt">Đã duyệt</option>
              <option value="Hoàn thành">Hoàn thành</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. OVERVIEW SUMMARY CARDS (5 KPI IN 1 ROW - COMPACT) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {/* Card 1: Total Orders */}
        <div className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">Tổng số phiếu</span>
            <FileText size={13} className="text-blue-400" />
          </div>
          <div className="text-base font-black text-white">{hasLoaded ? summaryReport.tongSoPhieu : '-'}</div>
          <div className="text-[9px] text-slate-500 truncate">BM02 Snapshot</div>
        </div>

        {/* Card 2: Total Money */}
        <div className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">Tổng giá trị</span>
            <DollarSign size={13} className="text-emerald-400" />
          </div>
          <div className="text-base font-black text-emerald-400 truncate">
            {hasLoaded ? `${summaryReport.tongGiaTri.toLocaleString('vi-VN')} đ` : '-'}
          </div>
          <div className="text-[9px] text-emerald-500/80 truncate">grandTotal Snapshot</div>
        </div>

        {/* Card 3: Total Materials */}
        <div className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">Số loại vật tư</span>
            <Building2 size={13} className="text-amber-400" />
          </div>
          <div className="text-base font-black text-white">{hasLoaded ? summaryReport.tongSoVatTu : '-'}</div>
          <div className="text-[9px] text-slate-500 truncate">Mã VT phân biệt</div>
        </div>

        {/* Card 4: Total Volume */}
        <div className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">Tổng khối lượng</span>
            <Layers size={13} className="text-indigo-400" />
          </div>
          <div className="text-base font-black text-indigo-300 truncate">
            {hasLoaded ? summaryReport.tongKhoiLuong.toLocaleString('vi-VN') : '-'}
          </div>
          <div className="text-[9px] text-slate-500 truncate">Khối lượng lũy kế</div>
        </div>

        {/* Card 5: Average per Order */}
        <div className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">TB / Phiếu</span>
            <TrendingUp size={13} className="text-sky-400" />
          </div>
          <div className="text-base font-black text-sky-300 truncate">
            {hasLoaded ? `${summaryReport.giaTriTrungBinhPerPhieu.toLocaleString('vi-VN')} đ` : '-'}
          </div>
          <div className="text-[9px] text-slate-500 truncate">TB 1 BM02</div>
        </div>
      </div>

      {/* 4. SUB-REPORT TAB NAVIGATION */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex items-center gap-1 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('order')}
          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'order' || activeTab === 'summary'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <FileText size={13} />
          <span>1. Theo Mã Phiếu ({hasLoaded ? orderReportRows.length : 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('material')}
          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'material'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Tag size={13} />
          <span>2. Theo Vật Tư ({hasLoaded ? materialReportRows.length : 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('cumulative')}
          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'cumulative'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <TrendingUp size={13} />
          <span>3. Lũy Kế Vật Tư ({hasLoaded ? cumulativeReportRows.length : 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('price')}
          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'price'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <DollarSign size={13} />
          <span>4. Biến Động Đơn Giá ({hasLoaded ? priceFluctuationRows.length : 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('missing')}
          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 relative ${
            activeTab === 'missing'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <AlertTriangle size={13} />
          <span>5. VT Chưa Có Đơn Giá ({hasLoaded ? missingPriceRows.length : 0})</span>
          {hasLoaded && missingPriceRows.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping absolute top-1 right-1" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('ocr')}
          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'ocr'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Sparkles size={13} />
          <span>6. AI OCR Report ({hasLoaded ? ocrReportData.tongOcr : 0})</span>
        </button>
      </div>

      {/* 5. REPORT CONTENT TABLES (MAXIMIZED VIEWPORT HEIGHT & SCROLL) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <RefreshCw size={24} className="animate-spin mx-auto text-blue-500" />
            <p className="text-xs font-bold">Đang tổng hợp dữ liệu báo cáo BM02...</p>
          </div>
        ) : !hasLoaded ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-blue-400 border border-slate-700 shadow-inner">
              <RefreshCw size={22} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-200">Danh sách phiếu chưa được tải</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Để tối ưu tốc độ và tránh hao tài nguyên của ứng dụng, danh sách các phiếu không tự động tải. Vui lòng nhấn nút <span className="text-blue-400 font-bold">Tải Lại</span> để nạp dữ liệu.
              </p>
            </div>
            <button
              onClick={() => loadData(true)}
              disabled={loading}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-blue-900/40 transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Tải Lại Dữ Liệu</span>
            </button>
          </div>
        ) : (
          <>
            {/* TAB 1: THEO MÃ PHIẾU */}
            {(activeTab === 'order' || activeTab === 'summary') && (
              <>
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[420px] custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-2 px-2.5 text-center w-10">STT</th>
                      <th className="p-2 px-2.5">Mã Phiếu</th>
                      <th className="p-2 px-2.5">Ngày Lập</th>
                      <th className="p-2 px-2.5">Nội Dung / Mục Đích</th>
                      <th className="p-2 px-2.5">Dự Án / Công Trình</th>
                      <th className="p-2 px-2.5 text-center">Số VT</th>
                      <th className="p-2 px-2.5 text-right">Tổng Tiền (Snapshot)</th>
                      <th className="p-2 px-2.5 text-center">Trạng Thái</th>
                      <th className="p-2 px-2.5 text-center w-20">Xem Phiếu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {paginatedOrderReportRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-500">
                          Không tìm thấy phiếu nào phù hợp với bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      paginatedOrderReportRows.map((row, idx) => (
                        <tr key={row.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-1.5 px-2.5 text-center text-slate-500 font-bold">{(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</td>
                          <td className="p-1.5 px-2.5">
                            <button
                              onClick={() => handleOpenSnapshot(row)}
                              className="font-extrabold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>{row.maPhieu}</span>
                            </button>
                          </td>
                          <td className="p-1.5 px-2.5 text-slate-300">{row.ngay}</td>
                          <td className="p-1.5 px-2.5 text-slate-200 max-w-xs truncate" title={row.noiDung}>
                            {row.noiDung}
                          </td>
                          <td className="p-1.5 px-2.5 text-slate-300 max-w-xs truncate" title={row.rawDuAn || row.duAn}>
                            {row.duAn}
                          </td>
                          <td className="p-1.5 px-2.5 text-center font-bold text-slate-300">{row.soLuongVatTu}</td>
                          <td className="p-1.5 px-2.5 text-right font-black text-emerald-400">
                            {row.tongTien.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="p-1.5 px-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              {row.trangThai}
                            </span>
                          </td>
                          <td className="p-1.5 px-2.5 text-center">
                            <button
                              onClick={() => handleOpenSnapshot(row)}
                              className="p-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-md border border-blue-500/30 transition-all cursor-pointer"
                              title="Click để xem đúng Snapshot BM02 + BM03.2"
                            >
                              <Eye size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-t border-slate-800">
                  <div className="text-xs text-slate-400">
                    Hiển thị <span className="font-bold text-slate-200">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> đến <span className="font-bold text-slate-200">{Math.min(currentPage * ITEMS_PER_PAGE, orderReportRows.length)}</span> trong số <span className="font-bold text-slate-200">{orderReportRows.length}</span> phiếu
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-xs font-bold text-slate-300 bg-slate-800 rounded-md border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
                    >
                      Trước
                    </button>
                    <div className="flex items-center gap-1 px-2">
                      {Array.from({ length: totalPages }).map((_, i) => {
                        const pageNum = i + 1;
                        if (
                          pageNum === 1 ||
                          pageNum === totalPages ||
                          (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-7 h-7 flex items-center justify-center text-xs font-bold rounded-md border transition-colors ${
                                currentPage === pageNum
                                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        } else if (
                          pageNum === currentPage - 2 ||
                          pageNum === currentPage + 2
                        ) {
                          return <span key={pageNum} className="text-slate-500 text-xs">...</span>;
                        }
                        return null;
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-xs font-bold text-slate-300 bg-slate-800 rounded-md border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </>
            )}

            {/* TAB 2: THEO VẬT TƯ */}
            {activeTab === 'material' && (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[420px] custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-2 px-2.5 text-center w-10">STT</th>
                      <th className="p-2 px-2.5">Tên Vật Tư</th>
                      <th className="p-2 px-2.5 text-center">ĐVT</th>
                      <th className="p-2 px-2.5 text-center">Số Phiếu Xuất Hiện</th>
                      <th className="p-2 px-2.5 text-right">Tổng Khối Lượng</th>
                      <th className="p-2 px-2.5 text-right">Đơn Giá Bình Quan</th>
                      <th className="p-2 px-2.5 text-right">Tổng Tiền Line Item</th>
                      <th className="p-2 px-2.5">Mã Phiếu Chi Tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {materialReportRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500">
                          Không tìm thấy vật tư nào.
                        </td>
                      </tr>
                    ) : (
                      materialReportRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-1.5 px-2.5 text-center text-slate-500 font-bold">{idx + 1}</td>
                          <td className="p-1.5 px-2.5 font-extrabold text-white">{row.tenVatTu}</td>
                          <td className="p-1.5 px-2.5 text-center text-slate-400">{row.donVi}</td>
                          <td className="p-1.5 px-2.5 text-center font-bold text-blue-400">{row.soPhieu}</td>
                          <td className="p-1.5 px-2.5 text-right font-extrabold text-indigo-300">
                            {row.tongKhoiLuong.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-1.5 px-2.5 text-right font-bold text-slate-300">
                            {row.donGiaBinhQuan.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="p-1.5 px-2.5 text-right font-black text-emerald-400">
                            {row.tongTien.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="p-1.5 px-2.5 text-slate-400 max-w-xs truncate" title={row.maPhieuList.join(', ')}>
                            {row.maPhieuList.join(', ')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: LỦY KẾ VẬT TƯ */}
            {activeTab === 'cumulative' && (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[420px] custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-2 px-2.5 text-center w-10">STT</th>
                      <th className="p-2 px-2.5">Tên Vật Tư</th>
                      <th className="p-2 px-2.5 text-center">ĐVT</th>
                      <th className="p-2 px-2.5 text-right">Tổng Đã Trình/Đặt</th>
                      <th className="p-2 px-2.5 text-right">Lũy Kế Đặt Vật Tư</th>
                      <th className="p-2 px-2.5 text-center">Số Phiếu</th>
                      <th className="p-2 px-2.5">Chi Tiết Từng Mã Phiếu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {cumulativeReportRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500">
                          Không có dữ liệu lũy kế vật tư.
                        </td>
                      </tr>
                    ) : (
                      cumulativeReportRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-1.5 px-2.5 text-center text-slate-500 font-bold">{idx + 1}</td>
                          <td className="p-1.5 px-2.5 font-extrabold text-white">{row.tenVatTu}</td>
                          <td className="p-1.5 px-2.5 text-center text-slate-400">{row.donVi}</td>
                          <td className="p-1.5 px-2.5 text-right font-bold text-amber-300">
                            {row.tongDaTrinh.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-1.5 px-2.5 text-right font-black text-emerald-400">
                            {row.luyKe.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-1.5 px-2.5 text-center font-bold text-blue-400">{row.soPhieu}</td>
                          <td className="p-1.5 px-2.5 space-y-0.5">
                            {row.chiTietPhieu.map((c, cIdx) => (
                              <div key={cIdx} className="text-[10px] text-slate-300 flex items-center gap-1.5">
                                <span className="font-bold text-blue-400">{c.maPhieu}</span>
                                <span>({c.ngay}):</span>
                                <span className="font-extrabold text-emerald-400">
                                  {c.khoiLuong} {row.donVi}
                                </span>
                                <span className="text-slate-500 text-[9px]">
                                  @ {c.donGia.toLocaleString('vi-VN')} đ
                                </span>
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 4: BIẾN ĐỘNG ĐƠN GIÁ */}
            {activeTab === 'price' && (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[420px] custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-2 px-2.5 text-center w-10">STT</th>
                      <th className="p-2 px-2.5">Thời Gian</th>
                      <th className="p-2 px-2.5">Mã Phiếu</th>
                      <th className="p-2 px-2.5">Tên Vật Tư</th>
                      <th className="p-2 px-2.5 text-right">Giá Cũ</th>
                      <th className="p-2 px-2.5 text-right">Giá Mới</th>
                      <th className="p-2 px-2.5 text-right">Chênh Lệch</th>
                      <th className="p-2 px-2.5 text-center">% Biến Động</th>
                      <th className="p-2 px-2.5">Người Thực Hiện</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {priceFluctuationRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-500">
                          Chưa ghi nhận nhật ký biến động đơn giá nào.
                        </td>
                      </tr>
                    ) : (
                      priceFluctuationRows.map((row, idx) => (
                        <tr key={row.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-1.5 px-2.5 text-center text-slate-500 font-bold">{idx + 1}</td>
                          <td className="p-1.5 px-2.5 text-slate-300">{row.ngay}</td>
                          <td className="p-1.5 px-2.5 font-bold text-blue-400">{row.maPhieu}</td>
                          <td className="p-1.5 px-2.5 font-extrabold text-white">{row.tenVatTu}</td>
                          <td className="p-1.5 px-2.5 text-right text-rose-400 line-through">
                            {row.giaCu.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="p-1.5 px-2.5 text-right font-bold text-emerald-400">
                            {row.giaMoi.toLocaleString('vi-VN')} đ
                          </td>
                          <td
                            className={`p-1.5 px-2.5 text-right font-black ${
                              row.chenhLech > 0 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {row.chenhLech > 0 ? '+' : ''}
                            {row.chenhLech.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="p-1.5 px-2.5 text-center">
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                                row.phanTramChenhLech > 0
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              {row.phanTramChenhLech > 0 ? '+' : ''}
                              {row.phanTramChenhLech.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-1.5 px-2.5 text-slate-400">{row.user}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 5: VẬT TƯ CHƯA CÓ ĐƠN GIÁ */}
            {activeTab === 'missing' && (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[420px] custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-2 px-2.5 text-center w-10">STT</th>
                      <th className="p-2 px-2.5">Tên Vật Tư Chưa Giá</th>
                      <th className="p-2 px-2.5 text-center">ĐVT</th>
                      <th className="p-2 px-2.5">Xuất Hiện Tại Phiếu</th>
                      <th className="p-2 px-2.5">Ngày</th>
                      <th className="p-2 px-2.5">Dự Án / Công Trình</th>
                      <th className="p-2 px-2.5 text-center">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {missingPriceRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-emerald-400 font-bold">
                          🎉 Tuyệt vời! Tất cả các vật tư trong hồ sơ đã có đơn giá đầy đủ.
                        </td>
                      </tr>
                    ) : (
                      missingPriceRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-1.5 px-2.5 text-center text-slate-500 font-bold">{idx + 1}</td>
                          <td className="p-1.5 px-2.5 font-extrabold text-rose-300 flex items-center gap-1.5">
                            <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                            <span>{row.tenVatTu}</span>
                          </td>
                          <td className="p-1.5 px-2.5 text-center text-slate-400">{row.donVi}</td>
                          <td className="p-1.5 px-2.5 font-bold text-blue-400">{row.maPhieu}</td>
                          <td className="p-1.5 px-2.5 text-slate-300">{row.ngay}</td>
                          <td className="p-1.5 px-2.5 text-slate-300 max-w-xs truncate" title={row.duAn}>
                            {row.duAn}
                          </td>
                          <td className="p-1.5 px-2.5 text-center">
                            <button
                              onClick={() => {
                                setMissingPriceModalItem(row);
                                setNewPriceInput('');
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[10px] font-bold shadow transition-all cursor-pointer"
                            >
                              Cập Nhật Danh Mục
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 6: AI OCR REPORT */}
            {activeTab === 'ocr' && (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="bg-slate-950 p-2.5 px-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-bold">Tổng lượt quét OCR</div>
                    <div className="text-xl font-black text-purple-400 mt-0.5">{ocrReportData.tongOcr}</div>
                  </div>
                  <div className="bg-slate-950 p-2.5 px-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-bold">Vật tư khớp Danh mục</div>
                    <div className="text-xl font-black text-emerald-400 mt-0.5">
                      {ocrReportData.soVatTuKhopDanhMuc}
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2.5 px-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-bold">Vật tư được chỉnh sửa</div>
                    <div className="text-xl font-black text-amber-400 mt-0.5">
                      {ocrReportData.soVatTuDuocChinhSua}
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2.5 px-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-bold">Thêm mới vào Danh mục</div>
                    <div className="text-xl font-black text-blue-400 mt-0.5">
                      {ocrReportData.soVatTuDuocThemMoi}
                    </div>
                  </div>
                </div>

                {/* Table of OCR logs */}
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-340px)] min-h-[350px] custom-scrollbar border border-slate-800 rounded-xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="p-2 px-2.5 text-center w-10">STT</th>
                        <th className="p-2 px-2.5">Thời Gian</th>
                        <th className="p-2 px-2.5">Tên File / Tài Liệu</th>
                        <th className="p-2 px-2.5">Mã Phiếu Generated</th>
                        <th className="p-2 px-2.5 text-right">Số VT Nhận Diện</th>
                        <th className="p-2 px-2.5 text-right">Số VT Khớp</th>
                        <th className="p-2 px-2.5 text-right">Số VT Mới</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {ocrReportData.logs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">
                            Chưa có nhật ký OCR.
                          </td>
                        </tr>
                      ) : (
                        ocrReportData.logs.map((log, idx) => (
                          <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="p-1.5 px-2.5 text-center text-slate-500 font-bold">{idx + 1}</td>
                            <td className="p-1.5 px-2.5 text-slate-300">{log.ngay}</td>
                            <td className="p-1.5 px-2.5 font-bold text-white">{log.tenFile}</td>
                            <td className="p-1.5 px-2.5 font-bold text-blue-400">{log.maPhieu}</td>
                            <td className="p-1.5 px-2.5 text-right font-extrabold text-purple-300">
                              {log.soVatTuNhanDien}
                            </td>
                            <td className="p-1.5 px-2.5 text-right font-bold text-emerald-400">{log.soVatTuKhop}</td>
                            <td className="p-1.5 px-2.5 text-right font-bold text-amber-400">{log.soVatTuMoi}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* SNAPSHOT VIEWER MODAL */}
      <BM02SnapshotViewerModal
        isOpen={isSnapshotModalOpen}
        onClose={() => setIsSnapshotModalOpen(false)}
        orderRecord={selectedSnapshotOrder}
      />

      {/* MODAL UPDATE MISSING CATALOG PRICE */}
      {missingPriceModalItem && (
        <div className="fixed inset-0 z-[220] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 text-slate-800">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-scale-up">
            <header className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Cập Nhật Đơn Giá Vào Danh Mục</h3>
              <button
                onClick={() => setMissingPriceModalItem(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <div>
                  <span className="font-bold text-slate-500">Vật tư:</span>{' '}
                  <span className="font-extrabold text-slate-900">{missingPriceModalItem.tenVatTu}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500">Đơn vị tính:</span>{' '}
                  <span className="font-bold text-blue-900">{missingPriceModalItem.donVi}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500">Phân loại:</span>{' '}
                  <span className="font-bold text-slate-700">{missingPriceModalItem.loaiVatTuTen}</span>
                </div>
              </div>

              <div>
                <label className="block font-extrabold text-slate-700 mb-1">Nhập đơn giá mới (VNĐ)</label>
                <input
                  type="number"
                  placeholder="VD: 1250000"
                  value={newPriceInput}
                  onChange={e => setNewPriceInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <footer className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setMissingPriceModalItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveMissingPrice}
                disabled={isUpdatingPrice}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer"
              >
                {isUpdatingPrice ? 'Đang lưu...' : 'Lưu Vào Danh Mục'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

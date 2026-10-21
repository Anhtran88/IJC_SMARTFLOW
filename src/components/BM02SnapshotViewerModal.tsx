import React, { useState } from 'react';
import { X, FileText, CheckCircle2, Download, Printer, Copy, Eye } from 'lucide-react';
import { exportToDocx, exportBBNTToDocx } from '../../services/docxExport';
import { exportToPDF } from '../../services/pdfImageExport';
import { exportToExcel, exportBBNTToExcel } from '../../services/excelExport';
import { extractMaPhieu } from '../utils/extractMaPhieu';
import { formatBM02Currency, normalizeMultilineContent } from '../lib/formatUtils';

interface BM02SnapshotViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderRecord: any; // Raw order record with bm02 & bm032 or snapshots
}

export const BM02SnapshotViewerModal: React.FC<BM02SnapshotViewerModalProps> = ({
  isOpen,
  onClose,
  orderRecord
}) => {
  const [activeTab, setActiveTab] = useState<'BM02' | 'BM032' | 'BM04'>('BM02');

  if (!isOpen || !orderRecord) return null;

  const bm02Data = orderRecord.bm02Data || orderRecord.bm02 || orderRecord;
  const rawBm032 = orderRecord.bm032Data || orderRecord.bm032;
  const rawCategory = orderRecord.category || bm02Data.mucDichSuDungNoiDung || orderRecord.mucDichSuDungNoiDung || orderRecord.purpose || '';
  const bm032Data = {
    docNumber: 'QTMH-BM03.2',
    date: orderRecord.date || 'Hôm nay',
    project: orderRecord.duAn || 'Dự án',
    senderCompany: orderRecord.senderCompany || orderRecord.supplier || orderRecord.bbnt_benA_congTy || '',
    receiverCompany: orderRecord.company || 'Công ty TNHH MTV Xây Dựng IJC',
    category: normalizeMultilineContent(rawCategory),
    items: (bm02Data.items || []).map((it: any, idx: number) => ({
      id: it.id || idx,
      stt: idx + 1,
      description: it.name || it.tenVatTu || 'Vật tư',
      unit: it.unit || 'm3',
      requestedQty: it.quantity || 0,
      acceptedQty: it.quantity || 0,
      note: it.note || ''
    })),
    ...(rawBm032 || {})
  };
  if (!bm032Data.category || (rawBm032 && rawBm032.category)) {
    bm032Data.category = normalizeMultilineContent(rawBm032?.category || rawCategory);
  }

  const bm04Data = orderRecord.bm04Data || orderRecord.bm04 || {
    ...bm032Data,
    formType: 'BM04',
    title: 'BIÊN BẢN GIAO NHẬN VẬT TƯ',
    docNumber: 'QTMH-BM04'
  };

  const maPhieu = extractMaPhieu(orderRecord) || extractMaPhieu(bm02Data) || extractMaPhieu(bm032Data) || orderRecord.maPhieu || orderRecord.id || 'BM02';

  const isGenericTitle = (str?: string) => {
    if (!str || typeof str !== 'string') return true;
    const trimmed = str.trim().toLowerCase();
    if (!trimmed) return true;
    if (trimmed.startsWith('[thay đổi theo')) return true;
    if (trimmed.startsWith('tờ trình về việc phê duyệt dự trù') || trimmed.startsWith('tờ trình phê duyệt dự trù')) return true;
    if (trimmed.startsWith('v/v: phê duyệt dự trù kinh phí') || trimmed === 'v/v: phê duyệt dự trù kinh phí mua vật tư, thiết bị, dịch vụ') return true;
    return false;
  };

  const getCleanPurpose = () => {
    const candidates = [
      bm02Data.mucDichSuDungNoiDung,
      orderRecord.mucDichSuDungNoiDung,
      bm02Data.requestContent,
      orderRecord.requestContent,
      orderRecord.category,
      orderRecord.purpose,
      orderRecord.tieuDe,
      bm02Data.title,
      orderRecord.title
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string' && !isGenericTitle(c)) {
        return normalizeMultilineContent(c);
      }
    }
    return normalizeMultilineContent(bm02Data.mucDichSuDungNoiDung || orderRecord.mucDichSuDungNoiDung || 'Chi phí cung cấp vật tư');
  };

  const purposeContent = getCleanPurpose();

  const docNumberBM02 = (bm02Data.docNumber && bm02Data.docNumber !== 'QTMH-BM02' && !bm02Data.docNumber.startsWith('XDIJC-') && bm02Data.docNumber.trim() !== '')
    ? bm02Data.docNumber
    : 'QTMH-BM02';

  const docNumberBM032 = (bm032Data.docNumber && bm032Data.docNumber !== 'QTMH-BM03.2' && !bm032Data.docNumber.startsWith('XDIJC-') && bm032Data.docNumber.trim() !== '')
    ? bm032Data.docNumber
    : 'QTMH-BM03.2';

  const docNumberBM04 = (bm04Data.docNumber && bm04Data.docNumber !== 'QTMH-BM04' && !bm04Data.docNumber.startsWith('XDIJC-') && bm04Data.docNumber.trim() !== '')
    ? bm04Data.docNumber
    : 'QTMH-BM04';

  const vatSnap = bm02Data.vatSnapshot || orderRecord.vatSnapshot;
  const showVat = vatSnap ? Boolean(vatSnap.showVAT || vatSnap.showVat) : true;
  const vatPercent = vatSnap?.vatPercent !== undefined ? Number(vatSnap.vatPercent) : 10;
  const grandTotal = orderRecord.grandTotal || vatSnap?.grandTotal || bm02Data.totalAmount || 0;

  const getReceiverList = (): any[] => {
    if (Array.isArray(bm032Data.receiverList) && bm032Data.receiverList.length > 0) return bm032Data.receiverList;
    if (Array.isArray(orderRecord.receiverList) && orderRecord.receiverList.length > 0) return orderRecord.receiverList;
    if (orderRecord.bm04 && Array.isArray(orderRecord.bm04.receiverList) && orderRecord.bm04.receiverList.length > 0) return orderRecord.bm04.receiverList;
    if (orderRecord.bm04Data && Array.isArray(orderRecord.bm04Data.receiverList) && orderRecord.bm04Data.receiverList.length > 0) return orderRecord.bm04Data.receiverList;
    if (bm032Data.pkg_benNhan_ds || orderRecord.pkg_benNhan_ds) {
      try {
        const parsed = typeof (bm032Data.pkg_benNhan_ds || orderRecord.pkg_benNhan_ds) === 'string'
          ? JSON.parse(bm032Data.pkg_benNhan_ds || orderRecord.pkg_benNhan_ds)
          : (bm032Data.pkg_benNhan_ds || orderRecord.pkg_benNhan_ds);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    const bn1 = bm032Data.pkg_benNhan1 || orderRecord.pkg_benNhan1;
    const bn2 = bm032Data.pkg_benNhan2 || orderRecord.pkg_benNhan2;
    if (bn1 || bn2) {
      const res: any[] = [];
      if (bn1) res.push({ name: bn1, position: bm032Data.pkg_benNhan1ChucVu || orderRecord.pkg_benNhan1ChucVu || '', salutation: 'Ông' });
      if (bn2) res.push({ name: bn2, position: bm032Data.pkg_benNhan2ChucVu || orderRecord.pkg_benNhan2ChucVu || '', salutation: 'Ông' });
      return res;
    }
    return [
      { name: 'Nguyễn Xuân Nam', position: 'Giám đốc', salutation: 'Ông' },
      { name: 'Nguyễn Thị Thêm', position: 'Kế toán trưởng', salutation: 'Bà' },
      { name: 'Trần Kim Nguyện', position: 'Chỉ huy trưởng', salutation: 'Ông' },
      { name: 'Đỗ Huỳnh Linh Khoa', position: 'Thủ kho', salutation: 'Ông' },
      { name: 'Trần Nam Anh', position: 'NV Thu mua', salutation: 'Ông' }
    ];
  };

  const getSenderList = (): any[] => {
    if (Array.isArray(bm032Data.senderList) && bm032Data.senderList.length > 0) return bm032Data.senderList;
    if (Array.isArray(orderRecord.senderList) && orderRecord.senderList.length > 0) return orderRecord.senderList;
    if (bm032Data.pkg_benGiao_ds || orderRecord.pkg_benGiao_ds) {
      try {
        const parsed = typeof (bm032Data.pkg_benGiao_ds || orderRecord.pkg_benGiao_ds) === 'string'
          ? JSON.parse(bm032Data.pkg_benGiao_ds || orderRecord.pkg_benGiao_ds)
          : (bm032Data.pkg_benGiao_ds || orderRecord.pkg_benGiao_ds);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    const bg = bm032Data.pkg_benGiaoTen || orderRecord.pkg_benGiaoTen;
    if (bg) {
      return [{ name: bg, position: bm032Data.pkg_benGiaoChucVu || orderRecord.pkg_benGiaoChucVu || '', salutation: 'Ông' }];
    }
    return [];
  };

  const handleExportDocx = () => {
    if (activeTab === 'BM02') {
      exportToDocx({ ...bm02Data, maPhieu, docNumber: docNumberBM02 }, null, null);
    } else if (activeTab === 'BM04') {
      exportBBNTToDocx({ ...bm04Data, formType: 'BM04', maPhieu, docNumber: docNumberBM04 }, null);
    } else {
      exportBBNTToDocx({ ...bm032Data, formType: 'BM03.2', maPhieu, docNumber: docNumberBM032 }, null);
    }
  };

  const handleExportExcel = () => {
    if (activeTab === 'BM02') {
      exportToExcel({ ...bm02Data, maPhieu, docNumber: docNumberBM02 }, null, null);
    } else if (activeTab === 'BM04') {
      exportBBNTToExcel({ ...bm04Data, formType: 'BM04', maPhieu, docNumber: docNumberBM04 }, null);
    } else {
      exportBBNTToExcel({ ...bm032Data, formType: 'BM03.2', maPhieu, docNumber: docNumberBM032 }, null);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 animate-fade-in text-slate-800">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-scale-up">
        {/* Header */}
        <header className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/30 text-blue-400 rounded-xl border border-blue-500/40">
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-wide">{maPhieu}</h3>
                <span className="px-2 py-0.5 text-[10px] uppercase font-extrabold bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full">
                  Snapshot Khóa Data
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {orderRecord.duAn || 'Dự án'} • Ngày lập: {orderRecord.ngay || orderRecord.date || 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch inside header */}
            <div className="bg-slate-800 p-1 rounded-xl flex items-center border border-slate-700 mr-2">
              <button
                onClick={() => setActiveTab('BM02')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'BM02' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1. BM02 (Tờ trình)
              </button>
              <button
                onClick={() => setActiveTab('BM032')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'BM032' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2. BM03.2 (BBNT)
              </button>
              <button
                onClick={() => setActiveTab('BM04')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'BM04' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3. BM04 (Giao nhận)
              </button>
            </div>

            <button
              onClick={handleExportDocx}
              title="Xuất Word"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download size={14} /> DOCX
            </button>
            <button
              onClick={handleExportExcel}
              title="Xuất Excel"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download size={14} /> XLSX
            </button>

            <button
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 rounded-lg border border-slate-700 transition-all cursor-pointer ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Content Viewer Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100 scrollbar-thin">
          <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-md border border-slate-200 text-slate-900 space-y-6">
            {activeTab === 'BM02' ? (
              /* VIEW BM02 */
              <div id="snapshot-bm02-view" className="space-y-6 text-sm leading-relaxed">
                <div className="grid grid-cols-2 text-xs border-b pb-4">
                  <div>
                    <p className="font-extrabold uppercase">CÔNG TY TNHH MTV XÂY DỰNG IJC</p>
                    <p className="text-slate-600">Số: <span className="font-bold text-blue-900">{docNumberBM02}</span></p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                    <p className="italic text-slate-600">Độc lập - Tự do - Hạnh phúc</p>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                    TỜ TRÌNH PHÊ DUYỆT DỰ TRÙ KINH PHÍ MUA VẬT TƯ, THIẾT BỊ, DỊCH VỤ
                  </h2>
                  <p className="text-xs font-medium text-slate-600 italic">
                    {bm02Data.location || 'Tp. Hồ Chí Minh'}, {bm02Data.date || orderRecord.date || ''}
                  </p>
                </div>

                <div className="space-y-1 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p><span className="font-bold">Kính gửi:</span> Hội Đồng Thành Viên / Ban Giám Đốc Công ty IJC</p>
                  <p><span className="font-bold">Đơn vị đề xuất:</span> {bm02Data.proposingCompany || 'IJC'}</p>
                  <div className="flex gap-2 items-start">
                    <span className="font-bold whitespace-nowrap">Nội dung / Mục đích:</span>
                    <div className="whitespace-pre-wrap break-words flex-1 text-slate-800">{purposeContent}</div>
                  </div>
                  <p><span className="font-bold">Địa điểm / Công trình:</span> {bm02Data.mucDichSuDungDiaDiem || orderRecord.duAn || 'Khu vực công trường'}</p>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto border border-black rounded-sm">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-200 text-black font-bold border-b border-black text-center">
                        <th className="p-2 border-r border-black w-10">STT</th>
                        <th className="p-2 border-r border-black">Tên vật tư, thiết bị, dịch vụ</th>
                        <th className="p-2 border-r border-black w-16">ĐVT</th>
                        <th className="p-2 border-r border-black w-20">Số lượng</th>
                        <th className="p-2 border-r border-black w-28">Đơn giá (đ)</th>
                        <th className="p-2 border-r border-black w-32">Thành tiền (đ)</th>
                        <th className="p-2">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bm02Data.items || []).map((it: any, idx: number) => {
                        const qty = Number(it.quantity || 0);
                        const price = Number(it.unitPrice || 0);
                        const total = it.total !== undefined ? Number(it.total) : Math.round(qty * price * 100) / 100;
                        return (
                          <tr key={idx} className="border-b border-slate-300 hover:bg-slate-50">
                            <td className="p-2 text-center border-r border-slate-300 font-bold">{idx + 1}</td>
                            <td className="p-2 border-r border-slate-300 font-bold text-slate-900 whitespace-pre-wrap break-words leading-relaxed">{it.name || it.tenVatTu}</td>
                            <td className="p-2 text-center border-r border-slate-300">{it.unit}</td>
                            <td className="p-2 text-right border-r border-slate-300 font-bold">{qty.toLocaleString('vi-VN')}</td>
                            <td className="p-2 text-right border-r border-slate-300">{formatBM02Currency(price)}</td>
                            <td className="p-2 text-right border-r border-slate-300 font-extrabold text-blue-900">{formatBM02Currency(total)}</td>
                            <td className="p-2 text-slate-500 italic">{it.note || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Grand Total Direct from Snapshot */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-1 text-right">
                  <div className="text-xs text-blue-800 font-bold">
                    Tổng giá trị thanh toán Snapshot (BM02):
                  </div>
                  <div className="text-xl font-black text-blue-950">
                    {Math.round(Number(grandTotal || 0)).toLocaleString('vi-VN')} VNĐ
                  </div>
                </div>
              </div>
            ) : (
              /* VIEW BM03.2 OR BM04 */
              <div id={activeTab === 'BM04' ? "snapshot-bm04-view" : "snapshot-bm032-view"} className="space-y-6 text-sm leading-relaxed">
                <div className="text-center space-y-1 border-b pb-4">
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                    {activeTab === 'BM04' 
                      ? (bm04Data.title || 'BIÊN BẢN GIAO NHẬN VẬT TƯ (BM04)') 
                      : (bm032Data.title || 'BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO (BM03.2)')
                    }
                  </h2>
                  <p className="text-xs font-medium text-slate-600 italic">
                    Số: {activeTab === 'BM04' ? docNumberBM04 : docNumberBM032} • Ngày: {(activeTab === 'BM04' ? bm04Data.date : bm032Data.date) || orderRecord.date || 'N/A'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-700">Đơn vị giao:</span> {bm032Data.senderCompany || orderRecord.senderCompany || orderRecord.supplier || ''}
                  </div>
                  <div>
                    <span className="font-bold text-slate-700">Đơn vị nhận:</span> {bm032Data.receiverCompany || 'IJC'}
                  </div>
                  <div className="col-span-2">
                    <span className="font-bold text-slate-700">Địa điểm bàn giao:</span> {bm032Data.address || bm032Data.locationDetail || orderRecord.duAn || 'Công trình'}
                  </div>
                  <div className="col-span-2">
                    <div className="flex gap-1 items-start">
                      <span className="font-bold text-slate-700 whitespace-nowrap">Hạng mục / Nội dung:</span>
                      <div className="whitespace-pre-wrap break-words font-semibold text-slate-900 flex-1">
                        {normalizeMultilineContent(bm032Data.category || orderRecord.category || bm02Data.mucDichSuDungNoiDung || 'Nghiệm thu bàn giao')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Thành phần tham gia nghiệm thu */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
                  <h4 className="font-bold uppercase text-slate-800 border-b border-slate-200 pb-1">
                    2. Thành phần tham gia nghiệm thu:
                  </h4>
                  
                  {/* Bên Giao */}
                  <div className="space-y-1">
                    <p className="font-bold text-slate-900">
                      a) Bên giao: <span className="uppercase text-blue-900">{bm032Data.senderCompany || orderRecord.senderCompany || orderRecord.supplier || 'Đơn vị giao'}</span>
                    </p>
                    {getSenderList().length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 pl-3 border-l-2 border-blue-400">
                        {getSenderList().map((r, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">- {r.salutation || 'Ông'} {r.name}:</span>
                            <span className="text-slate-600">Chức vụ {r.position || 'N/A'}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="pl-3 text-slate-500 italic text-[11px]">- Chưa chọn nhân sự đại diện bên giao</p>
                    )}
                  </div>

                  {/* Bên Nhận */}
                  <div className="space-y-1 pt-1.5 border-t border-slate-200">
                    <p className="font-bold text-slate-900">
                      b) Bên nhận: <span className="uppercase text-blue-900">{bm032Data.receiverCompany || orderRecord.receiverCompany || 'CÔNG TY TNHH MTV XÂY DỰNG IJC'}</span>
                    </p>
                    {getReceiverList().length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 pl-3 border-l-2 border-blue-400">
                        {getReceiverList().map((r, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">- {r.salutation || 'Ông'} {r.name}:</span>
                            <span className="text-slate-600">Chức vụ {r.position || 'N/A'}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="pl-3 text-slate-500 italic text-[11px]">- Chưa chọn nhân sự đại diện bên nhận</p>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto border border-black rounded-sm">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-200 text-black font-bold border-b border-black text-center">
                        <th className="p-2 border-r border-black w-10">STT</th>
                        <th className="p-2 border-r border-black">Tên vật tư, thiết bị, dịch vụ</th>
                        <th className="p-2 border-r border-black w-16">ĐVT</th>
                        <th className="p-2 border-r border-black w-24">Số lượng Y/C</th>
                        <th className="p-2 border-r border-black w-24">Số lượng Thực nhận</th>
                        <th className="p-2">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bm032Data.items || []).map((it: any, idx: number) => {
                        const reqQty = Number(it.requestedQty || it.quantity || 0);
                        const accQty = Number(it.acceptedQty || reqQty);
                        return (
                          <tr key={idx} className="border-b border-slate-300 hover:bg-slate-50">
                            <td className="p-2 text-center border-r border-slate-300 font-bold">{idx + 1}</td>
                            <td className="p-2 border-r border-slate-300 font-bold text-slate-900 whitespace-pre-wrap break-words leading-relaxed">{it.description || it.name || it.tenVatTu}</td>
                            <td className="p-2 text-center border-r border-slate-300">{it.unit}</td>
                            <td className="p-2 text-right border-r border-slate-300 font-bold">{reqQty.toLocaleString('vi-VN')}</td>
                            <td className="p-2 text-right border-r border-slate-300 font-extrabold text-emerald-800">{accQty.toLocaleString('vi-VN')}</td>
                            <td className="p-2 text-slate-500 italic">{it.note || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="p-4 bg-slate-900 text-slate-400 border-t border-slate-800 flex items-center justify-between text-xs">
          <div>
            Hệ thống quản lý dữ liệu Snapshot IJC SmartFlow
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
          >
            Đóng Cửa Sổ
          </button>
        </footer>
      </div>
    </div>
  );
};

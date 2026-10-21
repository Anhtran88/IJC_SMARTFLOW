import React, { useState } from 'react';
import { runFirestoreToRtdbMigration, exportFirestoreToJson, exportRtdbToJson, MigrationSummaryReport } from '../lib/firestoreToRtdbMigration';
import { Database, ShieldCheck, AlertOctagon, AlertTriangle, Info, CheckCircle2, RefreshCw, FileText, Download, Play, Layers, X } from 'lucide-react';

export const FirestoreMigrationTool: React.FC = () => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [report, setReport] = useState<MigrationSummaryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    cause?: string;
    recommendation?: string;
    type: 'warning' | 'info' | 'error';
  } | null>(null);

  const handleExportFirestore = async () => {
    setIsMigrating(true);
    setError(null);
    setNotice(null);
    setProgressMsg('Đang khởi tạo kết nối Cloud Firestore...');
    setProgressPercent(5);
    console.log('[MIGRATION_TOOL] Đang xuất dữ liệu Firestore...');

    try {
      const res = await exportFirestoreToJson((msg, percent) => {
        setProgressMsg(msg);
        setProgressPercent(percent);
      });

      const blob = new Blob([res.jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);

      setNotice({
        title: 'Xuất dữ liệu Firestore thành công!',
        message: `Đã đọc thành công ${res.totalDocs} tài liệu từ ${res.totalCollections} phân hệ Firestore và tự động tải về file "${res.filename}".`,
        recommendation: 'Bạn có thể lưu trữ file JSON này để làm bản sao lưu an toàn hoặc phục vụ đối soát.',
        type: 'info'
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err) || 'Có lỗi xảy ra khi xuất dữ liệu Firestore.';
      console.error('[EXPORT_FIRESTORE_ERROR]', err);
      setError(errMsg);
      setNotice({
        title: 'Lỗi không thể xuất dữ liệu Firestore',
        message: errMsg,
        cause: 'Firestore chưa được kết nối, hoặc tài khoản hiện tại không có quyền truy vấn dữ liệu Firestore.',
        recommendation: 'Vui lòng kiểm tra tab "Cấu hình Firebase" hoặc kết nối mạng của bạn.',
        type: 'error'
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleExportRtdb = async () => {
    setIsMigrating(true);
    setError(null);
    setNotice(null);
    setProgressMsg('Đang khởi tạo kết nối Realtime Database (RTDB)...');
    setProgressPercent(5);
    console.log('[MIGRATION_TOOL] Đang xuất dữ liệu Realtime Database...');

    try {
      const res = await exportRtdbToJson((msg, percent) => {
        setProgressMsg(msg);
        setProgressPercent(percent);
      });

      const blob = new Blob([res.jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);

      setNotice({
        title: 'Xuất dữ liệu Realtime Database thành công!',
        message: `Đã đọc thành công ${res.totalRecords} bản ghi từ ${res.totalNodes} node RTDB và tự động tải về file "${res.filename}".`,
        recommendation: 'Bạn có thể lưu trữ file JSON này để sao lưu hoặc kiểm tra dữ liệu sau Migration.',
        type: 'info'
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err) || 'Có lỗi xảy ra khi xuất dữ liệu Realtime Database.';
      console.error('[EXPORT_RTDB_ERROR]', err);
      setError(errMsg);
      setNotice({
        title: 'Lỗi không thể xuất dữ liệu Realtime Database',
        message: errMsg,
        cause: 'Kết nối Realtime Database chưa được khởi tạo hoặc bị ngắt kết nối.',
        recommendation: 'Vui lòng kiểm tra lại kết nối mạng và tab "Cấu hình Firebase".',
        type: 'error'
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const executeMigration = async () => {

    setShowConfirmModal(false);
    setIsMigrating(true);
    setError(null);
    setReport(null);
    setNotice(null);
    setProgressMsg('[Step 1/6] Khởi tạo Migration: Đang kiểm tra môi trường và hệ thống...');
    setProgressPercent(2);
    console.log('[MIGRATION_TOOL] Bắt đầu kích hoạt Migration Firestore -> RTDB...');

    try {
      const summary = await runFirestoreToRtdbMigration((stage, percent) => {
        console.log(`[MIGRATION_PROGRESS] [${percent}%] ${stage}`);
        setProgressMsg(stage);
        setProgressPercent(percent);
      });

      console.log('[MIGRATION_TOOL] Quy trình Migration đã hoàn tất thành công:', summary);
      setReport(summary);

      if (summary.totalFirestoreRecords === 0) {
        setNotice({
          title: 'Thông tin quy trình Migration',
          message: 'Đã hoàn tất quét dữ liệu: Tìm thấy 0 bản ghi trên Cloud Firestore.',
          cause: 'Ứng dụng của bạn hiện đang lưu trữ và quản lý trực tiếp dữ liệu trên Realtime Database (RTDB). Không có dữ liệu lịch sử cũ tồn đọng trên Firestore.',
          recommendation: 'Dữ liệu ứng dụng của bạn hiện đã nằm 100% trên Realtime Database với tốc độ truy xuất tối ưu. Bạn không cần thao tác thêm.',
          type: 'info'
        });
      } else if (summary.totalErrors > 0) {
        setNotice({
          title: 'Cảnh báo Migration có bản ghi bị lỗi',
          message: `Đã chuyển ${summary.totalMigratedRecords}/${summary.totalFirestoreRecords} bản ghi, nhưng phát hiện ${summary.totalErrors} lỗi đối soát.`,
          cause: 'Một số bản ghi trên Firestore bị thiếu ID hợp lệ hoặc không thể ghi đè lên RTDB.',
          recommendation: 'Vui lòng nhấn nút "Tải file JSON Báo cáo" bên dưới để kiểm tra danh sách chi tiết các bản ghi bị lỗi.',
          type: 'warning'
        });
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err) || 'Có lỗi xảy ra trong quá trình Migration dữ liệu.';
      console.error('[MIGRATION_TOOL_ERROR] Lỗi thực thi Migration:', err);
      setError(errMsg);
      setNotice({
        title: 'Lỗi không thể tiến hành Migration',
        message: errMsg,
        cause: 'Kết nối Firebase Firestore chưa sẵn sàng, hoặc tài khoản hiện tại không có quyền truy vấn dữ liệu Firestore.',
        recommendation: 'Vui lòng kiểm tra lại kết nối mạng và tab "Cấu hình Firebase". Nếu hệ thống đang chạy hoàn toàn trên RTDB, bạn có thể tiếp tục sử dụng mà không cần Migration.',
        type: 'error'
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleStartMigrationClick = () => {
    setNotice(null);
    setError(null);
    setShowConfirmModal(true);
  };

  const handleDownloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Migration_Report_Firestore_To_RTDB_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl text-slate-200">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-black text-rose-450 uppercase tracking-wide flex items-center gap-2">
            <Database className="text-rose-500" size={20} />
            Công cụ Migration Dữ liệu (Cloud Firestore → Realtime Database)
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Công cụ quét toàn bộ 20 phân hệ dữ liệu trên Cloud Firestore, sao lưu RTDB an toàn, chuyển đổi sang Realtime Database và tự động thực hiện đối soát dữ liệu (Verify 100%).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handleExportFirestore}
            disabled={isMigrating}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-blue-300 border border-slate-700 hover:border-blue-500/50 rounded-xl text-xs font-bold transition-all shadow active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            title="Đọc toàn bộ collections Firestore, xuất thành file JSON và tải về máy"
          >
            <Download size={15} /> Export Firestore (JSON)
          </button>

          <button
            onClick={handleExportRtdb}
            disabled={isMigrating}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-amber-300 border border-slate-700 hover:border-amber-500/50 rounded-xl text-xs font-bold transition-all shadow active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            title="Đọc toàn bộ nodes Realtime Database (RTDB), xuất thành file JSON và tải về máy"
          >
            <Download size={15} /> Export Realtime DB (JSON)
          </button>

          <button
            onClick={handleStartMigrationClick}
            disabled={isMigrating}
            className="px-4 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-xl text-xs font-extrabold transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isMigrating ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} fill="currentColor" />}
            {isMigrating ? 'Đang xử lý...' : 'Bắt đầu Migration Dữ liệu'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle size={24} className="shrink-0" />
              <h4 className="text-sm font-black uppercase tracking-wide">Xác nhận thực thi Migration Dữ liệu</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Bạn đang chuẩn bị chuyển toàn bộ dữ liệu từ <strong className="text-rose-400">Cloud Firestore</strong> sang <strong className="text-amber-400">Realtime Database (RTDB)</strong>.
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-[11px] text-slate-400">
              <div className="flex items-start gap-2">
                <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>Hệ thống sẽ <strong>tự động tạo bản sao lưu (Backup)</strong> của Realtime Database trước khi ghi.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-blue-400 shrink-0 mt-0.5" />
                <span>Dữ liệu Firestore gốc được giữ nguyên 100% an toàn.</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={executeMigration}
                className="px-4 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-xl text-xs font-extrabold transition-all shadow-lg active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <Play size={14} fill="currentColor" /> Bắt đầu thực thi ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Structured Notice / Recommendation / Cause Card */}
      {notice && (
        <div className={`p-4 rounded-xl border text-xs space-y-2 ${
          notice.type === 'error'
            ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
            : notice.type === 'warning'
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
            : 'bg-blue-500/10 border-blue-500/40 text-blue-200'
        }`}>
          <div className="flex items-center justify-between font-bold uppercase tracking-wider text-[11px]">
            <span className="flex items-center gap-2">
              {notice.type === 'error' && <AlertOctagon size={16} className="text-rose-400" />}
              {notice.type === 'warning' && <AlertTriangle size={16} className="text-amber-400" />}
              {notice.type === 'info' && <Info size={16} className="text-blue-400" />}
              {notice.title}
            </span>
            <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-200">
              <X size={14} />
            </button>
          </div>
          <p className="text-[12px] font-medium leading-relaxed">{notice.message}</p>
          {notice.cause && (
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1 mt-2">
              <div className="text-[10px] uppercase font-bold text-slate-400">🔍 Nguyên nhân (Root Cause):</div>
              <div className="text-[11px] text-slate-300">{notice.cause}</div>
            </div>
          )}
          {notice.recommendation && (
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
              <div className="text-[10px] uppercase font-bold text-amber-400">💡 Khuyến cáo (Recommendation):</div>
              <div className="text-[11px] text-slate-300">{notice.recommendation}</div>
            </div>
          )}
        </div>
      )}

      {/* Warning & Rules Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="font-bold text-amber-400 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
            <ShieldCheck size={14} /> 1. An toàn & Backup
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Hệ thống tự động sao lưu toàn bộ dữ liệu RTDB trước khi ghi. Firestore vẫn được giữ nguyên 100% để phục vụ Rollback nếu cần.
          </p>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="font-bold text-blue-400 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
            <Layers size={14} /> 2. Bảo toàn Cấu trúc
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Giữ nguyên ID, timestamp, quan hệ dữ liệu. Bỏ qua các bản ghi đã trùng khớp hoàn toàn để tối ưu băng thông.
          </p>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="font-bold text-emerald-400 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
            <CheckCircle2 size={14} /> 3. Đối soát Verify 100%
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Sau khi chuyển, hệ thống quét lại từng ID giữa Firestore và RTDB để đảm bảo tính toàn vẹn 100%.
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {isMigrating && (
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 animate-pulse">
          <div className="flex justify-between items-center text-xs font-bold text-slate-300">
            <span className="flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-rose-500" />
              {progressMsg}
            </span>
            <span className="font-mono text-rose-400 text-sm">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-rose-500 to-amber-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-3">
          <AlertOctagon size={18} className="text-rose-500 shrink-0" />
          <div>
            <strong className="font-bold uppercase tracking-wider block mb-0.5">Lỗi quy trình Migration:</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Final Report Card */}
      {report && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-emerald-500/30">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h4 className="text-sm font-black text-emerald-400 uppercase tracking-wide">
                  BÁO CÁO MIGRATION HOÀN TẤT — KẾT QUẢ VERIFY {report.verificationRate}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Thời gian thực hiện: {report.timestamp} • Dữ liệu Firestore cũ được giữ nguyên
                </p>
              </div>
            </div>
            <button
              onClick={handleDownloadReport}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-700 rounded-lg text-xs font-bold text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={13} /> Tải file JSON Báo cáo
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-500">Tổng bản ghi Firestore</div>
              <div className="text-lg font-black text-slate-200 mt-1">{report.totalFirestoreRecords}</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-500">Bản ghi đã chuyển / cập nhật</div>
              <div className="text-lg font-black text-emerald-400 mt-1">{report.totalMigratedRecords}</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-500">Số bản ghi lỗi</div>
              <div className={`text-lg font-black mt-1 ${report.totalErrors === 0 ? 'text-slate-400' : 'text-rose-400'}`}>
                {report.totalErrors}
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-500">Trạng thái Storage Engine</div>
              <div className="text-xs font-extrabold text-blue-400 mt-2.5">
                RTDB ACTIVE 100%
              </div>
            </div>
          </div>

          {/* Node detail table */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 font-bold text-xs text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText size={14} className="text-slate-400" />
                Chi tiết đối soát từng Node / Collection ({report.nodeReports.length} phân hệ)
              </span>
              <span className="text-[10px] uppercase text-emerald-400 font-extrabold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                {report.verificationPassed ? 'VERIFY 100% THÀNH CÔNG' : 'CÓ CẢNH BÁO'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-950 text-slate-500 font-bold border-b border-slate-800 text-[10px] uppercase">
                    <th className="py-2 px-3">Phân hệ / Node</th>
                    <th className="py-2 px-2 text-center">Firestore Count</th>
                    <th className="py-2 px-2 text-center">RTDB Trước</th>
                    <th className="py-2 px-2 text-center">Đã Chuyển</th>
                    <th className="py-2 px-2 text-center">Bỏ Qua (Trùng)</th>
                    <th className="py-2 px-2 text-center">RTDB Sau</th>
                    <th className="py-2 px-3 text-center">Kết quả Verify</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300 text-[11px]">
                  {report.nodeReports.map((nr) => (
                    <tr key={nr.nodeName} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-200">{nr.nodeName}</td>
                      <td className="py-2 px-2 text-center text-slate-400">{nr.firestoreCount}</td>
                      <td className="py-2 px-2 text-center text-slate-500">{nr.rtdbCountBefore}</td>
                      <td className="py-2 px-2 text-center text-emerald-400 font-bold">{nr.migratedCount}</td>
                      <td className="py-2 px-2 text-center text-slate-500">{nr.skippedCount}</td>
                      <td className="py-2 px-2 text-center text-blue-400 font-bold">{nr.rtdbCountAfter}</td>
                      <td className="py-2 px-3 text-center">
                        {nr.verified ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[10px] bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                            <CheckCircle2 size={11} /> Đã Khớp 100%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-bold text-[10px] bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40">
                            <AlertOctagon size={11} /> {nr.errors.length} lỗi
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import ExcelJS from 'exceljs';
import FileSaver from 'file-saver';
import {
  ReportFilter,
  SummaryReport,
  OrderReportRow,
  MaterialReportRow,
  CumulativeReportRow,
  PriceFluctuationRow,
  MissingPriceMaterialRow,
  OcrReportData
} from './ReportService';

export async function exportReportToExcel(
  activeReportTab: 'summary' | 'order' | 'material' | 'cumulative' | 'price' | 'missing' | 'ocr',
  filter: ReportFilter,
  summary: SummaryReport,
  orders: OrderReportRow[],
  materials: MaterialReportRow[],
  cumulatives: CumulativeReportRow[],
  priceLogs: PriceFluctuationRow[],
  missingPrices: MissingPriceMaterialRow[],
  ocrData: OcrReportData
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IJC SmartFlow';
  workbook.created = new Date();

  // Create sheet
  const sheetNameMap: Record<string, string> = {
    summary: 'Tổng Quan',
    order: 'Báo Cáo Theo Mã Phiếu',
    material: 'Báo Cáo Theo Vật Tư',
    cumulative: 'Báo Cáo Lũy Kế Vật Tư',
    price: 'Biến Động Đơn Giá',
    missing: 'VT Chưa Có Đơn Giá',
    ocr: 'Báo Cáo AI OCR'
  };

  const worksheet = workbook.addWorksheet(sheetNameMap[activeReportTab] || 'Báo Cáo');

  // Title block
  worksheet.mergeCells('A1:H1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `BÁO CÁO QUẢN LÝ VẬT TƯ & HỒ SƠ BM02 - ${sheetNameMap[activeReportTab].toUpperCase()}`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Filter summary row
  worksheet.mergeCells('A2:H2');
  const filterCell = worksheet.getCell('A2');
  const filterParts = [];
  if (filter.maPhieu) filterParts.push(`Mã phiếu: "${filter.maPhieu}"`);
  if (filter.loaiVatTu && filter.loaiVatTu !== 'all') filterParts.push(`Loại VT: "${filter.loaiVatTu}"`);
  if (filter.tenVatTu) filterParts.push(`Tên VT: "${filter.tenVatTu}"`);
  if (filter.duAn) filterParts.push(`Dự án/Công trình: "${filter.duAn}"`);
  if (filter.tuNgay) filterParts.push(`Từ ngày: ${filter.tuNgay}`);
  if (filter.denNgay) filterParts.push(`Đến ngày: ${filter.denNgay}`);
  if (filter.trangThai && filter.trangThai !== 'all') filterParts.push(`Trạng thái: "${filter.trangThai}"`);

  filterCell.value = `Bộ lọc áp dụng: ${filterParts.length > 0 ? filterParts.join(' | ') : 'Tất cả dữ liệu'}`;
  filterCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  filterCell.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.addRow([]); // Blank row A3

  // Styling helpers
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' } // Dark blue
  };

  const headerFont: Partial<ExcelJS.Font> = {
    name: 'Arial',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  };

  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  // Switch according to activeReportTab
  if (activeReportTab === 'summary' || activeReportTab === 'order') {
    // Render Order Table
    const headerRow = worksheet.addRow([
      'STT',
      'Mã Phiếu',
      'Ngày Lập',
      'Nội Dung / Mục Đích',
      'Loại Vật Tư',
      'Số Vật Tư',
      'Tổng Tiền (VNĐ)',
      'Trạng Thái',
      'Dự Án / Công Trình'
    ]);

    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    });

    orders.forEach((row, idx) => {
      const dataRow = worksheet.addRow([
        idx + 1,
        row.maPhieu,
        row.ngay,
        row.noiDung,
        row.loaiVatTu,
        row.soLuongVatTu,
        row.tongTien,
        row.trangThai,
        row.duAn
      ]);

      dataRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = borderStyle;

        if (colNum === 1 || colNum === 3 || colNum === 8) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNum === 6 || colNum === 7) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }

        if (colNum === 7) {
          cell.numFmt = '#,##0';
        }
      });
    });

    // Total summary row
    const totalRow = worksheet.addRow([
      'TỔNG CỘNG',
      '',
      '',
      '',
      '',
      summary.tongSoVatTu,
      summary.tongGiaTri,
      '',
      ''
    ]);

    totalRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1E3A8A' } };
      cell.border = borderStyle;

      if (colNum === 7) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });

  } else if (activeReportTab === 'material') {
    const headerRow = worksheet.addRow([
      'STT',
      'Tên Vật Tư',
      'ĐVT',
      'Số Phiếu Xuất Hiện',
      'Tổng Khối Lượng',
      'Đơn Giá Bình Quân (VNĐ)',
      'Tổng Tiền (VNĐ)',
      'Danh Sách Mã Phiếu'
    ]);

    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    });

    materials.forEach((row, idx) => {
      const dataRow = worksheet.addRow([
        idx + 1,
        row.tenVatTu,
        row.donVi,
        row.soPhieu,
        row.tongKhoiLuong,
        row.donGiaBinhQuan,
        row.tongTien,
        row.maPhieuList.join(', ')
      ]);

      dataRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = borderStyle;

        if (colNum === 1 || colNum === 3 || colNum === 4) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNum === 5 || colNum === 6 || colNum === 7) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }

        if (colNum === 5) cell.numFmt = '#,##0.00';
        if (colNum === 6 || colNum === 7) cell.numFmt = '#,##0';
      });
    });

  } else if (activeReportTab === 'cumulative') {
    const headerRow = worksheet.addRow([
      'STT',
      'Tên Vật Tư',
      'ĐVT',
      'Tổng Đã Trình/Đặt',
      'Lũy Kế Hiện Tại',
      'Số Phiếu',
      'Chi Tiết Mã Phiếu & Khối Lượng'
    ]);

    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    });

    cumulatives.forEach((row, idx) => {
      const detailStr = row.chiTietPhieu.map(c => `${c.maPhieu} (${c.khoiLuong} ${row.donVi})`).join('; ');
      const dataRow = worksheet.addRow([
        idx + 1,
        row.tenVatTu,
        row.donVi,
        row.tongDaTrinh,
        row.luyKe,
        row.soPhieu,
        detailStr
      ]);

      dataRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = borderStyle;

        if (colNum === 1 || colNum === 3 || colNum === 6) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNum === 4 || colNum === 5) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

  } else if (activeReportTab === 'price') {
    const headerRow = worksheet.addRow([
      'STT',
      'Thời Gian',
      'Mã Phiếu',
      'Tên Vật Tư',
      'Đơn Giá Cũ (VNĐ)',
      'Đơn Giá Mới (VNĐ)',
      'Chênh Lệch (VNĐ)',
      '% Biến Động',
      'Người Thực Hiện',
      'Dự Án'
    ]);

    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    });

    priceLogs.forEach((row, idx) => {
      const dataRow = worksheet.addRow([
        idx + 1,
        row.ngay,
        row.maPhieu,
        row.tenVatTu,
        row.giaCu,
        row.giaMoi,
        row.chenhLech,
        `${row.phanTramChenhLech > 0 ? '+' : ''}${row.phanTramChenhLech.toFixed(1)}%`,
        row.user,
        row.duAn
      ]);

      dataRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = borderStyle;

        if (colNum === 1 || colNum === 2 || colNum === 3 || colNum === 8) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNum === 5 || colNum === 6 || colNum === 7) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0';
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

  } else if (activeReportTab === 'missing') {
    const headerRow = worksheet.addRow([
      'STT',
      'Tên Vật Tư Chưa Có Đơn Giá',
      'ĐVT',
      'Mã Phiếu',
      'Ngày Lập',
      'Khối Lượng',
      'Dự Án / Công Trình',
      'Loại Vật Tư'
    ]);

    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    });

    missingPrices.forEach((row, idx) => {
      const dataRow = worksheet.addRow([
        idx + 1,
        row.tenVatTu,
        row.donVi,
        row.maPhieu,
        row.ngay,
        row.quantity,
        row.duAn,
        row.loaiVatTuTen
      ]);

      dataRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = borderStyle;

        if (colNum === 1 || colNum === 3 || colNum === 4 || colNum === 5) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNum === 6) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

  } else if (activeReportTab === 'ocr') {
    const headerRow = worksheet.addRow([
      'STT',
      'Thời Gian',
      'Tên File AI OCR',
      'Mã Phiếu',
      'Số Vật Tư Nhận Diện',
      'Khớp Danh Mục',
      'Thêm Mới',
      'Người Thực Hiện'
    ]);

    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    });

    ocrData.logs.forEach((row, idx) => {
      const dataRow = worksheet.addRow([
        idx + 1,
        row.ngay,
        row.tenFile,
        row.maPhieu,
        row.soVatTuNhanDien,
        row.soVatTuKhop,
        row.soVatTuMoi,
        row.user || 'Hệ thống AI'
      ]);

      dataRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = borderStyle;

        if (colNum === 1 || colNum === 2 || colNum === 4) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNum === 5 || colNum === 6 || colNum === 7) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0';
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });
  }

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      if (cellLength > maxLength) {
        maxLength = cellLength;
      }
    });
    column.width = Math.min(maxLength + 4, 45);
  });

  // Export buffer & download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = `BaoCao_IJC_${activeReportTab}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  FileSaver.saveAs(blob, fileName);
}

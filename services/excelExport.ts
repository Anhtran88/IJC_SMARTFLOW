
import ExcelJS from "exceljs";
import FileSaver from "file-saver";
import { FormData, BBNTData } from "../types";
import { generateCommonFileNamePart } from "../src/utils/exportUtils";
import { formatNumberForExport, formatBM02CurrencyForExport, formatUnitNameForTable, stripAppliedUnitsSuffix, extractCongTrinhFromDiaDiem } from "../src/lib/formatUtils";

export function numberToVietnameseWords(num: number): string {
  if (num === 0) return "Không đồng";
  
  const units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const subgroups = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  
  let result = "";
  
  function readThreeDigits(n: number, isLastGroup: boolean): string {
    let text = "";
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    const tens = Math.floor(remainder / 10);
    const ones = remainder % 10;
    
    if (hundreds > 0) {
      text += units[hundreds] + " trăm ";
    } else if (!isLastGroup) {
      text += "không trăm ";
    }
    
    if (tens > 0) {
      if (tens === 1) {
        text += "mười ";
      } else {
        text += units[tens] + " mươi ";
      }
    } else if (ones > 0 && (hundreds > 0 || !isLastGroup)) {
      text += "lẻ ";
    }
    
    if (ones > 0) {
      if (ones === 1 && tens > 1) {
        text += "mốt ";
      } else if (ones === 5 && tens > 0) {
        text += "lăm ";
      } else {
        text += units[ones] + " ";
      }
    }
    
    return text;
  }
  
  let count = 0;
  let remaining = num;
  while (remaining > 0) {
    const chunk = remaining % 1000;
    remaining = Math.floor(remaining / 1000);
    
    if (chunk > 0) {
      const chunkText = readThreeDigits(chunk, remaining === 0);
      result = chunkText + subgroups[count] + " " + result;
    }
    count++;
  }
  
  let words = result.trim().replace(/\s+/g, " ");
  if (words.length > 0) {
    words = words.charAt(0).toUpperCase() + words.slice(1) + " đồng";
  }
  return words;
}

export function formatToWordDate(val: string | undefined | null): string {
  if (!val) return "ngày ... tháng ... năm ...";
  let str = String(val).trim();

  // 1. If it's exactly YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const p = str.split('-');
    return `ngày ${p[2]} tháng ${p[1]} năm ${p[0]}`;
  }

  // 2. If it's exactly DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const p = str.split('/');
    return `ngày ${p[0].padStart(2, '0')} tháng ${p[1].padStart(2, '0')} năm ${p[2]}`;
  }

  // 3. Replace any occurrences of "ngày DD/MM/YYYY" or "ngày DD-MM-YYYY"
  str = str.replace(/ngày\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/gi, (_, d, m, y) => {
    return `ngày ${d.padStart(2, '0')} tháng ${m.padStart(2, '0')} năm ${y}`;
  });

  // 4. Replace standalone "DD/MM/YYYY" or "DD-MM-YYYY" in text
  str = str.replace(/(ngày\s+)?\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/gi, (match, pref, d, m, y) => {
    return `ngày ${d.padStart(2, '0')} tháng ${m.padStart(2, '0')} năm ${y}`;
  });

  return str;
}

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

export function toRoman(num: number): string {
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
  return roman[num] || String(num + 1);
}

const BORDER_STYLE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' }
};

const FONT_NORMAL = { name: 'Times New Roman', size: 11 };
const FONT_BOLD = { name: 'Times New Roman', size: 11, bold: true };
const FONT_ITALIC = { name: 'Times New Roman', size: 11, italic: true };

export async function exportToExcel(formData: FormData, logoUrl?: string | null, kyTenBM02?: any[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('BM02 - Tờ Trình');

  // Page Setup for A4
  worksheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5, right: 0.5,
      top: 0.5, bottom: 0.5,
      header: 0.3, footer: 0.3
    },
    printTitlesRow: '1:1'
  };

  // Define columns width for A4 (9 columns total for BM02)
  worksheet.columns = [
    { key: 'col1', width: 6 },   // STT
    { key: 'col2', width: 35 },  // Tên vật tư
    { key: 'col3', width: 10 },  // Đvt
    { key: 'col4', width: 15 },  // Dự toán (1)
    { key: 'col5', width: 15 },  // Lũy kế (2)
    { key: 'col6', width: 15 },  // Số lượng (3)
    { key: 'col7', width: 18 },  // Đơn giá (4)
    { key: 'col8', width: 22 },  // Thành tiền (5)
    { key: 'col9', width: 15 },  // Ghi chú (6)
  ];

  // 1. Structured Header (Logo | Title | Code)
  // Box for header
  for(let i=1; i<=3; i++) {
    const row = worksheet.getRow(i);
    row.height = 30; // Increased height
    for(let c=1; c<=9; c++) {
      worksheet.getCell(i, c).border = BORDER_STYLE;
    }
  }

  // Logo Column (A1:B3)
  worksheet.mergeCells('A1:B3');
  const logoCell = worksheet.getCell('A1');
  logoCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Title Column (C1:H1)
  worksheet.mergeCells('C1:H1');
  const hTitle = worksheet.getCell('C1');
  hTitle.value = "TỜ TRÌNH";
  hTitle.font = { name: 'Times New Roman', size: 16, bold: true };
  hTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells('C2:H3');
  const hSubTitle = worksheet.getCell('C2');
  hSubTitle.value = formData.title;
  hSubTitle.font = { name: 'Times New Roman', size: 12, bold: false };
  hSubTitle.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // Code Column (I1:I3)
  worksheet.mergeCells('I1:I3');
  const hCode = worksheet.getCell('I1');
  hCode.value = "QTMH-BM02";
  hCode.font = { name: 'Times New Roman', size: 11, bold: true };
  hCode.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add logo to A1:A3 area
  if (logoUrl && logoUrl.includes("base64,")) {
    try {
      const base64Data = logoUrl.split(",")[1];
      const logoId = workbook.addImage({
        base64: base64Data,
        extension: 'png',
      });
      worksheet.addImage(logoId, {
        tl: { col: 0.1, row: 0.1 },
        ext: { width: 45, height: 45 },
        editAs: 'oneCell'
      });
    } catch (error) {
      console.error("Error adding logo to Excel:", error);
    }
  }

  let rowIndex = 5;

  // Date
  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowDate = worksheet.getCell(`A${rowIndex}`);
  rowDate.value = `${(formData.location && !formData.location.toLowerCase().includes('thuộc') && !formData.location.toLowerCase().includes('lô') && !formData.location.toLowerCase().includes('khu')) ? formData.location : "Tp. Hồ Chí Minh"}, ${formatToWordDate(formData.date)}`;
  rowDate.font = FONT_ITALIC;
  rowDate.alignment = { horizontal: 'right' };
  rowIndex++;

  // Spacing
  rowIndex++;

  // Kính gửi
  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowKG = worksheet.getCell(`A${rowIndex}`);
  rowKG.value = "Kính gửi:";
  rowKG.font = FONT_BOLD;
  rowIndex++;
  
  (formData.recipients || []).forEach(r => {
    worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
    const cell = worksheet.getCell(`A${rowIndex}`);
    cell.value = `- ${r}`;
    cell.font = FONT_NORMAL;
    cell.alignment = { indent: 1 };
    rowIndex++;
  });

  // Grounds
  (formData.grounds || []).forEach(g => {
    worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
    const cell = worksheet.getCell(`A${rowIndex}`);
    cell.value = `- ${g}`;
    cell.font = FONT_NORMAL;
    cell.alignment = { wrapText: true };
    rowIndex++;
  });

  rowIndex++; 

  // Intro text
  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowIntro = worksheet.getCell(`A${rowIndex}`);
  rowIntro.value = `Phòng kỹ thuật kính trình ${formData.recipients.join(" và ")} ${formData.title.replace(/^V\/v:\s*/i, "")}, nội dung sau:`;
  rowIntro.font = FONT_NORMAL;
  rowIntro.alignment = { wrapText: true };
  worksheet.getRow(rowIndex).height = 40;
  rowIndex++;

  rowIndex++;

  // Section 1 - Mục đích sử dụng:
  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowSec1 = worksheet.getCell(`A${rowIndex}`);
  rowSec1.value = "1/ Mục đích sử dụng:";
  rowSec1.font = { ...FONT_BOLD, underline: true };
  rowIndex++;

  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowNoiDung = worksheet.getCell(`A${rowIndex}`);
  const valNoiDung = formData.mucDichSuDungNoiDung || "[Thay đổi theo nội dung file đính kèm]";
  rowNoiDung.value = valNoiDung.startsWith('- Nội dung:') ? valNoiDung : `- Nội dung: ${valNoiDung}`;
  rowNoiDung.font = FONT_NORMAL;
  rowNoiDung.alignment = { wrapText: true, vertical: 'top' };
  const linesNoiDung = String(rowNoiDung.value || '').split('\n').length;
  worksheet.getRow(rowIndex).height = Math.max(22, linesNoiDung * 18);
  rowIndex++;

  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowDiaDiem = worksheet.getCell(`A${rowIndex}`);
  const valDiaDiem = formData.mucDichSuDungDiaDiem || formData.location || "[Thay đổi theo nội dung file đính kèm]";
  rowDiaDiem.value = valDiaDiem.startsWith('- Địa điểm:') ? valDiaDiem : `- Địa điểm: ${valDiaDiem}`;
  rowDiaDiem.font = FONT_NORMAL;
  rowDiaDiem.alignment = { wrapText: true, vertical: 'top' };
  const linesDiaDiem = String(rowDiaDiem.value || '').split('\n').length;
  worksheet.getRow(rowIndex).height = Math.max(22, linesDiaDiem * 18);
  rowIndex++;

  rowIndex++;

  // Section 2 - Mua vật tư
  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowSec2 = worksheet.getCell(`A${rowIndex}`);
  rowSec2.value = "2/ Mua vật tư, thiết bị, dịch vụ:";
  rowSec2.font = { ...FONT_BOLD, underline: true };
  rowIndex++;

  // Table Header (Single-row to match the layout in App.tsx)
  const headerRowIndex = rowIndex;
  const rowH = worksheet.getRow(headerRowIndex);
  rowH.height = 35;

  worksheet.getCell(headerRowIndex, 1).value = "STT";
  worksheet.getCell(headerRowIndex, 2).value = "Tên vật tư/thiết bị/dịch vụ";
  worksheet.getCell(headerRowIndex, 3).value = "Đvt";
  worksheet.getCell(headerRowIndex, 4).value = "Tổng khối lượng/ số lượng... theo dự toán/kế hoạch";
  worksheet.getCell(headerRowIndex, 5).value = "Lũy kế các kỳ trước";
  worksheet.getCell(headerRowIndex, 6).value = "Khối lượng/số lượng cần cung cấp kỳ này";
  worksheet.getCell(headerRowIndex, 7).value = "Đơn giá kỳ này (đồng)";
  worksheet.getCell(headerRowIndex, 8).value = "Thành tiền kỳ này";
  worksheet.getCell(headerRowIndex, 9).value = "Ghi chú";

  // Format all cells in the row
  const fillStyle: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } as any;
  for (let c = 1; c <= 9; c++) {
    const cell = worksheet.getCell(headerRowIndex, c);
    cell.border = BORDER_STYLE;
    cell.fill = fillStyle;
    cell.font = { ...FONT_BOLD, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  rowIndex = headerRowIndex + 1;

  // Items with group/tier support matching template
  const items = formData.items || [];
  const h = getHierarchy(formData.selectedUnits, items);
  const isGrouped = formData.isGroupedDisplay || formData.displayMode === "GROUPED_EQUAL";

  if (isGrouped) {
    // 1. Group Header Row
    const headerRow = worksheet.getRow(rowIndex);
    headerRow.height = 25;
    
    headerRow.getCell(1).value = "★";
    headerRow.getCell(2).value = `DANH SÁCH VẬT TƯ GỘP (${formData.selectedUnits?.length || 0} căn): ${(formData.selectedUnits || []).map((u: any) => u.unitId).join(", ")}`;
    
    const groupFillStyle: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
    for (let c = 1; c <= 9; c++) {
      const cell = headerRow.getCell(c);
      cell.border = BORDER_STYLE;
      cell.fill = groupFillStyle;
      cell.font = FONT_BOLD;
      if (c === 1) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (c === 2) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
    rowIndex++;

    // 2. Group items
    items.forEach((item, idx) => {
      const row = worksheet.getRow(rowIndex);
      
      let nameWithApplied = stripAppliedUnitsSuffix(item.name || "");

      row.values = [
        idx + 1,
        nameWithApplied,
        item.unit,
        formatNumberForExport(item.duToanQty),
        formatNumberForExport(item.luyKeQty),
        formatNumberForExport(item.quantity),
        formatBM02CurrencyForExport(item.unitPrice),
        formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)),
        item.note
      ];
      row.font = FONT_NORMAL;
      row.height = 35;
      
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(9).alignment = { wrapText: true, vertical: 'middle' };

      for(let c=1; c<=9; c++) {
        row.getCell(c).border = BORDER_STYLE;
      }
      rowIndex++;
    });
  } else if (h.list.length === 0) {
    items.forEach((item) => {
      const row = worksheet.getRow(rowIndex);
      row.values = [
        item.stt,
        item.name,
        item.unit,
        formatNumberForExport(item.duToanQty),
        formatNumberForExport(item.luyKeQty),
        formatNumberForExport(item.quantity),
        formatBM02CurrencyForExport(item.unitPrice),
        formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)),
        item.note
      ];
      row.font = FONT_NORMAL;
      row.height = 25;
      
      // Formatting
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(9).alignment = { wrapText: true, vertical: 'middle' };

      for(let c=1; c<=9; c++) {
        row.getCell(c).border = BORDER_STYLE;
      }
      rowIndex++;
    });
  } else {
    h.list.forEach((u, groupIdx) => {
      const projId = u.projectId;
      const unitId = u.unitId;
      const groupItems = items.filter(
        it => !(it as any).isProjectShared && (it.projectId || '').toLowerCase() === projId.toLowerCase() && 
              (it.unitId || '').toLowerCase() === unitId.toLowerCase()
      );

      // 1. Group Header Row
      const headerRow = worksheet.getRow(rowIndex);
      headerRow.height = 25;
      
      // Write Roman numeral and Project + unit text
      headerRow.getCell(1).value = toRoman(groupIdx);
      headerRow.getCell(2).value = formatUnitNameForTable(unitId);
      
      // Format header cells with FONT_BOLD, background color and borders
      const groupFillStyle: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
      for (let c = 1; c <= 9; c++) {
        const cell = headerRow.getCell(c);
        cell.border = BORDER_STYLE;
        cell.fill = groupFillStyle;
        cell.font = FONT_BOLD;
        if (c === 1) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (c === 2) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
      rowIndex++;

      // 2. Group items
      let groupStt = 0;
      groupItems.forEach((item) => {
        groupStt++;
        const row = worksheet.getRow(rowIndex);
        row.values = [
          groupStt,
          item.name,
          item.unit,
          formatNumberForExport(item.duToanQty),
          formatNumberForExport(item.luyKeQty),
          formatNumberForExport(item.quantity),
          formatBM02CurrencyForExport(item.unitPrice),
          formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)),
          item.note
        ];
        row.font = FONT_NORMAL;
        row.height = 25;
        
        // Formatting
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(9).alignment = { wrapText: true, vertical: 'middle' };

        for(let c=1; c<=9; c++) {
          row.getCell(c).border = BORDER_STYLE;
        }
        rowIndex++;
      });
    });

    // 3. Orphan items
    const sharedItems = items.filter(it => (it as any).isProjectShared);
    if (sharedItems.length > 0) {
      const headerRow = worksheet.getRow(rowIndex);
      headerRow.height = 25;
      headerRow.getCell(1).value = "★";
      headerRow.getCell(2).value = `CHI PHÍ CHIA ĐỀU CÁC CĂN (${formData.selectedUnits?.length || 0} căn): ${(formData.selectedUnits || []).map((u: any) => u.unitId).join(", ")}`;
      const groupFillStyle = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
      for (let c = 1; c <= 9; c++) {
        const cell = headerRow.getCell(c);
        cell.border = BORDER_STYLE;
        cell.fill = groupFillStyle;
        cell.font = FONT_BOLD;
        if (c === 1) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        else if (c === 2) cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
      rowIndex++;

      let sharedStt = 0;
      sharedItems.forEach((it) => {
        sharedStt++;
        const originalIdx = items.findIndex(x => x.id === it.id);
        
        const row = worksheet.getRow(rowIndex);
        row.values = [
          sharedStt,
          it.name,
          it.unit,
          formatNumberForExport(it.duToanQty),
          formatNumberForExport(it.luyKeQty),
          formatNumberForExport(it.quantity),
          formatBM02CurrencyForExport(it.unitPrice),
          formatBM02CurrencyForExport(it.total !== undefined ? it.total : (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
          it.note
        ];
        row.font = FONT_NORMAL;
        row.height = 25;
        
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(9).alignment = { wrapText: true, vertical: 'middle' };
        for(let c=1; c<=9; c++) {
          row.getCell(c).border = BORDER_STYLE;
        }
        rowIndex++;
      });
    }

    const orphanItems = items.filter(it => {
      if ((it as any).isProjectShared) return false;
      const proj = it.projectId || '';
      const unit = it.unitId || '';
      return !h.list.some(u => 
        u.projectId.toLowerCase() === proj.toLowerCase() && 
        u.unitId.toLowerCase() === unit.toLowerCase()
      );
    });

    if (orphanItems.length > 0) {
      const headerRow = worksheet.getRow(rowIndex);
      headerRow.height = 25;
      
      // Write Roman numeral and Project + unit text
      headerRow.getCell(1).value = "X";
      headerRow.getCell(2).value = "VẬT TƯ KHÁC / CHƯA PHÂN LOẠI";
      
      const groupFillStyle: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
      for (let c = 1; c <= 9; c++) {
        const cell = headerRow.getCell(c);
        cell.border = BORDER_STYLE;
        cell.fill = groupFillStyle;
        cell.font = FONT_BOLD;
        if (c === 1) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (c === 2) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
      rowIndex++;

      let orphanStt = 0;
      orphanItems.forEach((item) => {
        orphanStt++;
        const row = worksheet.getRow(rowIndex);
        row.values = [
          orphanStt,
          item.name,
          item.unit,
          formatNumberForExport(item.duToanQty),
          formatNumberForExport(item.luyKeQty),
          formatNumberForExport(item.quantity),
          formatBM02CurrencyForExport(item.unitPrice),
          formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)),
          item.note
        ];
        row.font = FONT_NORMAL;
        row.height = 25;
        
        // Formatting
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(9).alignment = { wrapText: true, vertical: 'middle' };

        for(let c=1; c<=9; c++) {
          row.getCell(c).border = BORDER_STYLE;
        }
        rowIndex++;
      });
    }
  }

  // Calculations based on VAT settings
  const taxRateVal = formData.taxRate !== undefined ? Number(formData.taxRate) : (formData.vatSnapshot?.vatPercent !== undefined ? Number(formData.vatSnapshot.vatPercent) : 8);
  const showVatVal = Boolean(formData.showVat ?? formData.showVAT ?? formData.vatSnapshot?.showVAT ?? formData.vatSnapshot?.showVat ?? false);

  const rawLineSum = (formData.items || []).reduce((acc: number, it: any) => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unitPrice) || 0;
    const lTot = it.total !== undefined && it.total !== null && !isNaN(Number(it.total))
      ? Number(it.total)
      : Math.round(q * p * 100) / 100;
    return acc + lTot;
  }, 0);
  const lineSum = Math.round(rawLineSum);

  let totalPreTaxVal = lineSum;
  let vatAmountVal = 0;
  let totalWithVatVal = lineSum;

  if (showVatVal) {
    totalPreTaxVal = lineSum;
    vatAmountVal = Math.round((lineSum * taxRateVal) / 100);
    totalWithVatVal = totalPreTaxVal + vatAmountVal;
  } else {
    totalPreTaxVal = lineSum;
    vatAmountVal = 0;
    totalWithVatVal = lineSum;
  }

  if (showVatVal) {
    // 1. Thành tiền kỳ này (chưa bao gồm thuế)
    const rowThanhTien = worksheet.getRow(rowIndex);
    rowThanhTien.height = 25;
    worksheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
    const labelThanhTien = rowThanhTien.getCell(1);
    labelThanhTien.value = "Thành tiền kỳ này (chưa bao gồm thuế)";
    labelThanhTien.font = FONT_BOLD;
    labelThanhTien.alignment = { horizontal: 'center', vertical: 'middle' };

    const valThanhTien = rowThanhTien.getCell(8);
    valThanhTien.value = formatNumberForExport(totalPreTaxVal);
    valThanhTien.font = FONT_BOLD;
    valThanhTien.alignment = { horizontal: 'right', vertical: 'middle' };

    for(let c=1; c<=9; c++) {
      rowThanhTien.getCell(c).border = BORDER_STYLE;
    }
    rowIndex++;

    // 2. Thuế GTGT
    const rowThue = worksheet.getRow(rowIndex);
    rowThue.height = 25;
    worksheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
    const labelThue = rowThue.getCell(1);
    labelThue.value = `Thuế GTGT: ${taxRateVal}%`;
    labelThue.font = FONT_BOLD;
    labelThue.alignment = { horizontal: 'center', vertical: 'middle' };

    const valThue = rowThue.getCell(8);
    valThue.value = formatNumberForExport(vatAmountVal);
    valThue.font = FONT_BOLD;
    valThue.alignment = { horizontal: 'right', vertical: 'middle' };

    for(let c=1; c<=9; c++) {
      rowThue.getCell(c).border = BORDER_STYLE;
    }
    rowIndex++;

    // 3. Tổng cộng (đã bao gồm thuế GTGT)
    const totalRow = worksheet.getRow(rowIndex);
    totalRow.height = 25;
    worksheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
    const labelTotal = totalRow.getCell(1);
    labelTotal.value = "Tổng cộng (đã bao gồm thuế GTGT)";
    labelTotal.font = FONT_BOLD;
    labelTotal.alignment = { horizontal: 'center', vertical: 'middle' };

    const valTotal = totalRow.getCell(8);
    valTotal.value = formatNumberForExport(totalWithVatVal);
    valTotal.font = FONT_BOLD;
    valTotal.alignment = { horizontal: 'right', vertical: 'middle' };

    for(let c=1; c<=9; c++) {
      totalRow.getCell(c).border = BORDER_STYLE;
    }
    rowIndex++;
  } else {
    // Single row: TỔNG CỘNG (ĐÃ BAO GỒM THUẾ VAT)
    const totalRow = worksheet.getRow(rowIndex);
    totalRow.height = 25;
    worksheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
    const labelTotal = totalRow.getCell(1);
    labelTotal.value = "TỔNG CỘNG (ĐÃ BAO GỒM THUẾ VAT)";
    labelTotal.font = FONT_BOLD;
    labelTotal.alignment = { horizontal: 'center', vertical: 'middle' };

    const valTotal = totalRow.getCell(8);
    valTotal.value = formatNumberForExport(totalWithVatVal);
    valTotal.font = FONT_BOLD;
    valTotal.alignment = { horizontal: 'right', vertical: 'middle' };

    for(let c=1; c<=9; c++) {
      totalRow.getCell(c).border = BORDER_STYLE;
    }
    rowIndex++;
  }

  rowIndex++;

  // Written details
  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowWrittenTotal = worksheet.getCell(`A${rowIndex}`);
  rowWrittenTotal.value = `- Số tiền bằng chữ: ${formData.isCustomSoTienBangChu ? (formData.soTienBangChu || numberToVietnameseWords(totalWithVatVal)) : numberToVietnameseWords(totalWithVatVal)}`;
  rowWrittenTotal.font = FONT_BOLD;
  rowIndex++;

  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowPaymentTerm = worksheet.getCell(`A${rowIndex}`);
  rowPaymentTerm.value = `- Thời hạn thanh toán: ${formData.thoiHanThanhToan || ""}`;
  rowPaymentTerm.font = FONT_BOLD;
  rowIndex++;

  rowIndex++;

  // Section 3
  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowSec3 = worksheet.getCell(`A${rowIndex}`);
  rowSec3.value = `3/ Tổng số tiền dự trù kinh phí mua vật tư, thiết bị, dịch vụ kỳ này: ${formatNumberForExport(totalWithVatVal)} đồng.`;
  rowSec3.font = FONT_BOLD;
  rowIndex++;

  worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
  const rowKinhTrinh = worksheet.getCell(`A${rowIndex}`);
  rowKinhTrinh.value = "Kính trình./.";
  rowKinhTrinh.font = FONT_ITALIC;
  rowIndex++;
  rowIndex++;

  // Signatures BM02
  const kyTenItems = kyTenBM02 ? [...kyTenBM02].sort((a, b) => a.viTri - b.viTri) : [
    { chucDanh: "Phòng Kế toán", hoTen: formData.phongKeToan || "" },
    { chucDanh: "Người lập", hoTen: formData.nguoiLap || "" },
    { chucDanh: "Giám đốc", hoTen: formData.giamDoc || "" },
    { chucDanh: "Duyệt HĐTV", hoTen: formData.duyetHDTV || "" }
  ];

  for (let i = 0; i < kyTenItems.length; i += 3) {
    const chunk = kyTenItems.slice(i, i + 3);
    
    // Titles row
    const titleRow = worksheet.getRow(rowIndex);
    chunk.forEach((item, idx) => {
      let startCol, endCol;
      if (idx === 0) { startCol = 1; endCol = 3; }
      else if (idx === 1) { startCol = 4; endCol = 6; }
      else { startCol = 7; endCol = 9; }
      
      const cell = titleRow.getCell(startCol);
      cell.value = item.chucDanh;
      cell.font = FONT_BOLD;
      cell.alignment = { horizontal: 'center' };
      worksheet.mergeCells(rowIndex, startCol, rowIndex, endCol);
    });
    rowIndex++;
    
    // Space for signing (tăng thêm 2 dòng cho vị trí ký tên)
    rowIndex += 6;
    
    // Names row
    const nameRow = worksheet.getRow(rowIndex);
    chunk.forEach((item, idx) => {
      let startCol, endCol;
      if (idx === 0) { startCol = 1; endCol = 3; }
      else if (idx === 1) { startCol = 4; endCol = 6; }
      else { startCol = 7; endCol = 9; }
      
      const cell = nameRow.getCell(startCol);
      cell.value = String(item.hoTen || '').toUpperCase();
      cell.font = FONT_BOLD;
      cell.alignment = { horizontal: 'center' };
      worksheet.mergeCells(rowIndex, startCol, rowIndex, endCol);
    });
    rowIndex += 2;
  }

  // Add Images if any
  if (formData.images && formData.images.length > 0) {
    rowIndex += 2;
    worksheet.mergeCells(`A${rowIndex}:I${rowIndex}`);
    const imgTitle = worksheet.getCell(`A${rowIndex}`);
    imgTitle.value = "HÌNH ẢNH ĐÍNH KÈM:";
    imgTitle.font = { ...FONT_BOLD, underline: true };
    rowIndex += 2;

    for (const imgData of formData.images) {
      try {
        const base64Data = imgData.split(',')[1];
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png',
        });
        worksheet.addImage(imageId, {
          tl: { col: 1, row: rowIndex - 1 },
          ext: { width: 400, height: 300 }
        });
        rowIndex += 16;
      } catch (e) {
        console.error("Error adding image to Excel", e);
      }
    }
  }

  // Output
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const baseName = formData.originalFileName ? formData.originalFileName : generateCommonFileNamePart(formData);
  const fileName = `${baseName}_BM02.xlsx`;
  FileSaver.saveAs(blob, fileName);
}

export async function exportBBNTToExcel(bbntData: BBNTData, logoUrl?: string | null) {
  const isBM04 = bbntData.formType === 'BM04' || bbntData.docNumber === 'QTMH-BM04';
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(isBM04 ? 'BM04 - BBGN' : 'BM03.2 - BBNT');

  // Page Setup for A4
  worksheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5, right: 0.5,
      top: 0.5, bottom: 0.5,
      header: 0.3, footer: 0.3
    },
    printTitlesRow: '1:1'
  };

  // Columns: A, B, C, D, E, F, G, H
  // STT (A), Dien giai (B), DVT (C), SL YC (D), SL NT (E), Đơn giá (F), Thành tiền (G), Ghi chu (H)
  worksheet.columns = [
    { key: 'col1', width: 6 },   // STT
    { key: 'col2', width: 40 },  // Description (Diễn giải)
    { key: 'col3', width: 10 },  // Unit (Đvt)
    { key: 'col4', width: 12 },  // SL YC
    { key: 'col5', width: 12 },  // SL NT
    { key: 'col6', width: 15 },  // Đơn giá
    { key: 'col7', width: 18 },  // Thành tiền
    { key: 'col8', width: 20 },  // Note (Ghi chú)
  ];

  // 1. Structured Header (Logo | Title | Code)
  for(let i=1; i<=3; i++) {
    const row = worksheet.getRow(i);
    row.height = 30; // Increased
    for(let c=1; c<=8; c++) {
      worksheet.getCell(i, c).border = BORDER_STYLE;
    }
  }

  // Logo Column (A1:B3)
  worksheet.mergeCells('A1:B3');
  const logoCell = worksheet.getCell('A1');
  logoCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Title Column (C1:E3)
  worksheet.mergeCells('C1:G3');
  const hTitle = worksheet.getCell('C1');
  const defaultTitle = isBM04 ? "BIÊN BẢN GIAO NHẬN VẬT TƯ" : "BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO";
  hTitle.value = (bbntData.title || (isBM04 ? (window as any)?._currentMaterialConfig?.bm032?.titleBM04 : (window as any)?._currentMaterialConfig?.bm032?.title) || defaultTitle).toUpperCase();
  hTitle.font = { name: 'Times New Roman', size: 16, bold: true };
  hTitle.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // Code Column (F1:F3)
  worksheet.mergeCells('H1:H3');
  const hCode = worksheet.getCell('H1');
  hCode.value = isBM04 ? "QTMH-BM04" : "QTMH-BM03.2";
  hCode.font = { name: 'Times New Roman', size: 11, bold: true };
  hCode.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add logo to A1:A3 area
  if (logoUrl && logoUrl.includes("base64,")) {
    try {
      const base64Data = logoUrl.split(",")[1];
      const logoId = workbook.addImage({
        base64: base64Data,
        extension: 'png',
      });
      worksheet.addImage(logoId, {
        tl: { col: 0.1, row: 0.1 },
        ext: { width: 45, height: 45 },
        editAs: 'oneCell'
      });
    } catch (error) {
      console.error("Error adding logo to Excel:", error);
    }
  }

  let rowIndex = 5;

  // Date
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const tDate = worksheet.getCell(`A${rowIndex}`);
  tDate.value = `${(bbntData.location && !bbntData.location.toLowerCase().includes('thuộc') && !bbntData.location.toLowerCase().includes('lô') && !bbntData.location.toLowerCase().includes('khu')) ? bbntData.location : "Tp. Hồ Chí Minh"}, ${formatToWordDate(bbntData.date)}`;
  tDate.font = FONT_ITALIC;
  tDate.alignment = { horizontal: 'right', vertical: 'middle' };
  rowIndex++;
  rowIndex++;

  if (!isBM04) {
    // 1. Doi tuong
    worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
    const s1 = worksheet.getCell(`A${rowIndex}`);
    s1.value = "1. ĐỐI TƯỢNG:";
    s1.font = FONT_BOLD;
    rowIndex++;

    const objFields = [
      `- Công trình: ${bbntData.project || extractCongTrinhFromDiaDiem(bbntData.address || "")}`,
      `- Hạng mục: ${bbntData.category}`,
      `- Địa điểm: ${bbntData.address}`
    ];
    objFields.forEach(txt => {
      worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
      const c = worksheet.getCell(`A${rowIndex}`);
      c.value = txt;
      c.font = FONT_NORMAL;
      c.alignment = { wrapText: true, vertical: 'top' };
      const numLines = String(txt || '').split('\n').length;
      worksheet.getRow(rowIndex).height = Math.max(25, numLines * 18, txt.length > 80 ? 40 : 25);
      rowIndex++;
    });
    rowIndex++;

    // 2. Thanh phan
    worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
    const s2 = worksheet.getCell(`A${rowIndex}`);
    s2.value = "2. THÀNH PHẦN THAM GIA NGHIỆM THU:";
    s2.font = FONT_BOLD;
    rowIndex++;
  }

  // Ben Giao
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const bg = worksheet.getCell(`A${rowIndex}`);
  bg.value = isBM04 ? `1. BÊN GIAO: ${bbntData.senderCompany}` : `BÊN GIAO: ${bbntData.senderCompany}`;
  bg.font = { ...FONT_BOLD, underline: true };
  rowIndex++;

  (bbntData.senderList || []).forEach(r => {
    worksheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
    worksheet.getCell(`A${rowIndex}`).value = `- ${r.salutation}: ${r.name}`;
    worksheet.mergeCells(`D${rowIndex}:F${rowIndex}`);
    worksheet.getCell(`D${rowIndex}`).value = `Chức vụ: ${r.position}`;
    worksheet.getRow(rowIndex).height = 25;
    rowIndex++;
  });
  rowIndex++;

  // Ben Nhan
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const bn = worksheet.getCell(`A${rowIndex}`);
  bn.value = isBM04 ? `2. BÊN NHẬN: ${bbntData.receiverCompany}` : `BÊN NHẬN: ${bbntData.receiverCompany}`;
  bn.font = { ...FONT_BOLD, underline: true };
  rowIndex++;

  (bbntData.receiverList || []).forEach(r => {
    worksheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
    worksheet.getCell(`A${rowIndex}`).value = `- ${r.salutation}: ${r.name}`;
    worksheet.mergeCells(`D${rowIndex}:F${rowIndex}`);
    worksheet.getCell(`D${rowIndex}`).value = `Chức vụ: ${r.position}${r.role ? ` (${r.role})` : ''}`;
    worksheet.getRow(rowIndex).height = 25;
    rowIndex++;
  });
  rowIndex++;

  // 3. Thoi gian
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const s3 = worksheet.getCell(`A${rowIndex}`);
  s3.value = "3. THỜI GIAN, ĐỊA ĐIỂM:";
  s3.font = FONT_BOLD;
  rowIndex++;

  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  worksheet.getCell(`A${rowIndex}`).value = `Bắt đầu: lúc ${bbntData.startTime} ${formatToWordDate(bbntData.startDate)}`;
  worksheet.getCell(`A${rowIndex}`).font = FONT_ITALIC;
  rowIndex++;

  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  worksheet.getCell(`A${rowIndex}`).value = `Kết thúc: lúc ${bbntData.endTime} ${formatToWordDate(bbntData.endDate)}`;
  worksheet.getCell(`A${rowIndex}`).font = FONT_ITALIC;
  rowIndex++;

  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  worksheet.getCell(`A${rowIndex}`).value = `Tại công trình: ${String(bbntData.locationDetail || '').replace(/^Tại công trình:\s*/i, '')}`;
  worksheet.getCell(`A${rowIndex}`).font = FONT_ITALIC;
  rowIndex++;
  rowIndex++;

  // 4. Can cu
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const s4 = worksheet.getCell(`A${rowIndex}`);
  s4.value = "4. TÀI LIỆU LÀM CĂN CỨ:";
  s4.font = FONT_BOLD;
  rowIndex++;

  (bbntData.grounds || []).forEach(g => {
    worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
    const c = worksheet.getCell(`A${rowIndex}`);
    c.value = `- ${g}`;
    c.alignment = { wrapText: true, vertical: 'middle' };
    worksheet.getRow(rowIndex).height = g.length > 80 ? 40 : 25;
    rowIndex++;
  });
  rowIndex++;

  // 5. Khoi luong
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const s5 = worksheet.getCell(`A${rowIndex}`);
  s5.value = isBM04 ? "5. NỘI DUNG GIAO NHẬN:" : "5. KHỐI LƯỢNG CÔNG VIỆC:";
  s5.font = FONT_BOLD;
  rowIndex++;

  // Table
  const rowHeader = worksheet.getRow(rowIndex);
  rowHeader.values = isBM04 
    ? ['STT', 'Tên vật tư', 'ĐVT', 'KL Yêu cầu', 'KL Giao nhận', 'Ghi chú']
    : ['STT', 'Diễn giải', 'ĐVT', 'SL Yêu cầu', 'SL Nghiệm thu', 'Ghi chú'];
  rowHeader.font = FONT_BOLD;
  rowHeader.height = 30;
  rowHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for(let c=1; c<=6; c++) {
    rowHeader.getCell(c).border = BORDER_STYLE;
    rowHeader.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } as any;
  }
  rowIndex++;

  const items = bbntData.items || [];
  const h = getHierarchy(bbntData.selectedUnits, items);
  const isGrouped = bbntData.isGroupedDisplay || bbntData.displayMode === "GROUPED_EQUAL";

  if (isGrouped) {
    // 1. Group Header Row
    const headerRow = worksheet.getRow(rowIndex);
    headerRow.height = 25;
    
    headerRow.getCell(1).value = "★";
    headerRow.getCell(2).value = `DANH SÁCH VẬT TƯ GỘP (${bbntData.selectedUnits?.length || 0} căn): ${(bbntData.selectedUnits || []).map((u: any) => u.unitId).join(", ")}`;
    
    const groupFillStyle: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
    for (let c = 1; c <= 6; c++) {
      const cell = headerRow.getCell(c);
      cell.border = BORDER_STYLE;
      cell.fill = groupFillStyle;
      cell.font = FONT_BOLD;
      if (c === 1) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (c === 2) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
    rowIndex++;

    // 2. Group items
    items.forEach((item, idx) => {
      const row = worksheet.getRow(rowIndex);
      row.values = [item.stt, stripAppliedUnitsSuffix(item.description || ""), item.unit, formatNumberForExport(item.requestedQty), formatNumberForExport(item.acceptedQty), item.note || ''];
      row.font = FONT_NORMAL;
      row.height = 25;
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };

      for(let c=1; c<=6; c++) {
        row.getCell(c).border = BORDER_STYLE;
      }
      rowIndex++;
    });
  } else if (h.list.length === 0) {
    items.forEach((item) => {
      const row = worksheet.getRow(rowIndex);
      row.values = [item.stt, item.description, item.unit, formatNumberForExport(item.requestedQty), formatNumberForExport(item.acceptedQty), item.note || ''];
      row.font = FONT_NORMAL;
      row.height = 25;
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };

      for(let c=1; c<=6; c++) {
        row.getCell(c).border = BORDER_STYLE;
      }
      rowIndex++;
    });
  } else {
    h.list.forEach((u, groupIdx) => {
      const projId = u.projectId;
      const unitId = u.unitId;
      const groupItems = items.filter(
        it => !(it as any).isProjectShared && (it.projectId || '').toLowerCase() === projId.toLowerCase() && 
              (it.unitId || '').toLowerCase() === unitId.toLowerCase()
      );

      // Group Header Row
      const headerRow = worksheet.getRow(rowIndex);
      headerRow.height = 25;
      
      headerRow.getCell(1).value = toRoman(groupIdx);
      headerRow.getCell(2).value = formatUnitNameForTable(unitId);
      
      const groupFillStyle: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
      for (let c = 1; c <= 6; c++) {
        const cell = headerRow.getCell(c);
        cell.border = BORDER_STYLE;
        cell.fill = groupFillStyle;
        cell.font = FONT_BOLD;
        if (c === 1) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (c === 2) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
      rowIndex++;

      // Group items
      let groupStt = 0;
      groupItems.forEach((item) => {
        groupStt++;
        const row = worksheet.getRow(rowIndex);
        row.values = [groupStt, item.description, item.unit, formatNumberForExport(item.requestedQty), formatNumberForExport(item.acceptedQty), item.note || ''];
        row.font = FONT_NORMAL;
        row.height = 25;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };

        for(let c=1; c<=6; c++) {
          row.getCell(c).border = BORDER_STYLE;
        }
        rowIndex++;
      });
    });

    // Orphan items
    const sharedItems = items.filter(it => (it as any).isProjectShared);
    if (sharedItems.length > 0) {
      const headerRow = worksheet.getRow(rowIndex);
      headerRow.height = 25;
      headerRow.getCell(1).value = "★";
      headerRow.getCell(2).value = `CHI PHÍ CHIA ĐỀU CÁC CĂN (${bbntData.selectedUnits?.length || 0} căn): ${(bbntData.selectedUnits || []).map((u: any) => u.unitId).join(", ")}`;
      const groupFillStyle = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
      for (let c = 1; c <= 6; c++) {
        const cell = headerRow.getCell(c);
        cell.border = BORDER_STYLE;
        cell.fill = groupFillStyle;
        cell.font = FONT_BOLD;
        if (c === 1) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        else if (c === 2) cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
      rowIndex++;

      let sharedStt = 0;
      sharedItems.forEach((it) => {
        sharedStt++;
        const originalIdx = items.findIndex(x => x.id === it.id);
        
        const row = worksheet.getRow(rowIndex);
        row.values = [
          sharedStt,
          it.name,
          it.unit,
          formatNumberForExport(it.quantity),
          formatNumberForExport(it.quantity),
          it.note
        ];
        row.font = FONT_NORMAL;
        row.height = 25;
        
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };
        for(let c=1; c<=6; c++) {
          row.getCell(c).border = BORDER_STYLE;
        }
        rowIndex++;
      });
    }

    const orphanItems = items.filter(it => {
      if ((it as any).isProjectShared) return false;
      const proj = it.projectId || '';
      const unit = it.unitId || '';
      return !h.list.some(u => 
        u.projectId.toLowerCase() === proj.toLowerCase() && 
        u.unitId.toLowerCase() === unit.toLowerCase()
      );
    });

    if (orphanItems.length > 0) {
      const headerRow = worksheet.getRow(rowIndex);
      headerRow.height = 25;
      
      headerRow.getCell(1).value = "X";
      headerRow.getCell(2).value = "VẬT TƯ KHÁC / CHƯA PHÂN LOẠI";
      
      const groupFillStyle: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
      for (let c = 1; c <= 6; c++) {
        const cell = headerRow.getCell(c);
        cell.border = BORDER_STYLE;
        cell.fill = groupFillStyle;
        cell.font = FONT_BOLD;
        if (c === 1) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (c === 2) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }
      rowIndex++;

      let orphanStt = 0;
      orphanItems.forEach((item) => {
        orphanStt++;
        const row = worksheet.getRow(rowIndex);
        row.values = [orphanStt, item.description, item.unit, formatNumberForExport(item.requestedQty), formatNumberForExport(item.acceptedQty), item.note || ''];
        row.font = FONT_NORMAL;
        row.height = 25;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };

        for(let c=1; c<=6; c++) {
          row.getCell(c).border = BORDER_STYLE;
        }
        rowIndex++;
      });
    }
  }
  rowIndex++;

  // 6. Danh gia
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const s6 = worksheet.getCell(`A${rowIndex}`);
  s6.value = "6. ĐÁNH GIÁ:";
  s6.font = FONT_BOLD;
  rowIndex++;
  
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  worksheet.getCell(`A${rowIndex}`).value = isBM04 
    ? "- Về tình trạng hàng hóa/vật tư: đạt yêu cầu, đúng quy cách chủng loại" 
    : "- Về yêu cầu chất lượng dịch vụ: đạt yêu cầu";
  rowIndex++;
  
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  worksheet.getCell(`A${rowIndex}`).value = "- Về ý kiến khác (nếu có): không có";
  rowIndex++;
  rowIndex++;

  // 7. Ket luan
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const s7 = worksheet.getCell(`A${rowIndex}`);
  s7.value = "7. KẾT LUẬN:";
  s7.font = FONT_BOLD;
  rowIndex++;
  
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  worksheet.getCell(`A${rowIndex}`).value = isBM04 
    ? "- Hai bên thống nhất bàn giao và tiếp nhận số lượng vật tư nêu trên" 
    : "- Đồng ý nghiệm thu theo khối lượng như trên";
  rowIndex++;
  rowIndex++;

  // Signatures
  worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
  const sigTitle = worksheet.getCell(`A${rowIndex}`);
  sigTitle.value = "CHỮ KÝ CÁC BÊN";
  sigTitle.font = { ...FONT_BOLD, underline: true };
  sigTitle.alignment = { horizontal: 'center' };
  rowIndex++;
  rowIndex++;

  // Row 1 titles
  const sigRow1 = worksheet.getRow(rowIndex);
  sigRow1.getCell(1).value = bbntData.bbnt_benA_congTy || (isBM04 ? "ĐẠI DIỆN BÊN GIAO" : "Phòng Kế toán");
  sigRow1.getCell(4).value = bbntData.bbnt_benB_congTy || (isBM04 ? "ĐẠI DIỆN BÊN NHẬN" : "Người lập");
  worksheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
  worksheet.mergeCells(`D${rowIndex}:F${rowIndex}`);
  
  [1, 4].forEach(c => {
    const cell = sigRow1.getCell(c);
    cell.font = FONT_BOLD;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  // Space for signing (tăng thêm 2 dòng cho vị trí ký tên)
  rowIndex += 6; 

  // Row 1 names
  const sigName1 = worksheet.getRow(rowIndex);
  worksheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
  worksheet.mergeCells(`D${rowIndex}:F${rowIndex}`);
  sigName1.getCell(1).value = bbntData.bbnt_benA_daiDien || "";
  sigName1.getCell(4).value = bbntData.bbnt_benB_daiDien || "";
  [1, 4].forEach(c => {
    const cell = sigName1.getCell(c);
    cell.font = FONT_BOLD;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  rowIndex += 2;

  // Add Images if any
  if (bbntData.images && bbntData.images.length > 0) {
    rowIndex += 2;
    worksheet.mergeCells(`A${rowIndex}:H${rowIndex}`);
    const imgTitle = worksheet.getCell(`A${rowIndex}`);
    imgTitle.value = "HÌNH ẢNH ĐÍNH KÈM";
    imgTitle.font = { ...FONT_BOLD, underline: true };
    imgTitle.alignment = { horizontal: 'center' };
    rowIndex += 2;

    for (const imgData of bbntData.images) {
      try {
        const base64Data = imgData.split(',')[1];
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png',
        });
        worksheet.addImage(imageId, {
          tl: { col: 1, row: rowIndex - 1 },
          ext: { width: 400, height: 300 }
        });
        rowIndex += 16;
      } catch (e) {
        console.error("Error adding image to Excel", e);
      }
    }
  }

  // Output
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const rawOriginalName = bbntData.originalFileName || (typeof window !== 'undefined' && ((window as any)._currentOriginalFileName || (window as any)._currentBM02FileName)) || '';
  const baseName = rawOriginalName ? rawOriginalName : generateCommonFileNamePart(bbntData);
  const fileName = `${baseName}_${isBM04 ? 'BM04' : 'BM03.2'}.xlsx`;
  FileSaver.saveAs(blob, fileName);
}

export async function exportMaterialPriceToExcel(headers: string[], data: any[], tuNgay: string, denNgay: string) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bảng Giá Vật Tư');

  // Page Setup for A4
  worksheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape', // Better for price tables
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5, right: 0.5,
      top: 0.5, bottom: 0.5,
      header: 0.3, footer: 0.3
    }
  };

  worksheet.columns = headers.map(h => ({
    header: h === 'id' ? 'ID' : h === 'tenVatTu' ? 'Tên Vật Tư' : h === 'donVi' ? 'ĐVT' : h === 'giaGoc' ? 'Giá Gốc' : h.replace('gia_', ''),
    key: h,
    width: h === 'tenVatTu' ? 40 : 15
  }));

  data.forEach(item => {
    worksheet.addRow(item);
  });

  // Styling
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { horizontal: 'center' };
  
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = BORDER_STYLE;
      if (rowNumber === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } as any;
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = `BangGia_${tuNgay}_den_${denNgay}.xlsx`;
  FileSaver.saveAs(blob, fileName);
}

export async function exportMaterialPriceTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Mẫu Import Giá Vật Tư');

  worksheet.columns = [
    { header: 'Tên Vật Tư', key: 'tenVatTu', width: 40 },
    { header: 'Đơn Vị', key: 'donVi', width: 15 },
    { header: 'Giá Gốc', key: 'giaGoc', width: 20 },
  ];

  // Add sample data
  worksheet.addRow({ tenVatTu: 'Bê tông tươi M250', donVi: 'm3', giaGoc: 1200000 });
  worksheet.addRow({ tenVatTu: 'Sắt phi 10', donVi: 'kg', giaGoc: 18500 });
  worksheet.addRow({ tenVatTu: 'Xi măng Hà Tiên', donVi: 'bao', giaGoc: 85000 });

  // Styling
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 25;
  
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = BORDER_STYLE;
      if (rowNumber === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } as any;
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = `import_GIAVT_Mau.xlsx`;
  FileSaver.saveAs(blob, fileName);
}

/**
 * Parses a number string with Vietnamese conventions:
 * - Thousands separator: . or none
 * - Decimal separator: ,
 */
export function parsePriceVietnamese(value: any): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;

  let str = String(value).trim();
  if (!str) return 0;

  // Remove dots (thousand separators)
  str = str.replace(/\./g, '');
  // Replace comma (decimal separator) with dot
  str = str.replace(/,/g, '.');

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export async function importMaterialPriceFromExcel(file: File): Promise<{ tenVatTu: string; donVi: string; giaGoc: number }[]> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0]; // Assuming first sheet
  const data: { tenVatTu: string; donVi: string; giaGoc: number }[] = [];

  // Skip header row
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const tenVatTu = row.getCell(1).text || row.getCell(1).value?.toString() || '';
    const donVi = row.getCell(2).text || row.getCell(2).value?.toString() || '';
    const giaGocRaw = row.getCell(3).value;
    
    if (tenVatTu) {
      data.push({
        tenVatTu: tenVatTu.trim(),
        donVi: donVi.trim(),
        giaGoc: parsePriceVietnamese(giaGocRaw)
      });
    }
  });

  return data;
}

export async function exportBM06ToExcel(bm06Data: any, logoUrl?: string | null) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('BM06 - Phiếu Đề Nghị');

  // Page Setup for A4 landscape or fit
  worksheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4, right: 0.4,
      top: 0.4, bottom: 0.4,
      header: 0.2, footer: 0.2
    }
  };

  // Define columns width for 11 columns
  worksheet.columns = [
    { key: 'col1', width: 6 },   // STT
    { key: 'col2', width: 35 },  // Tên vật tư
    { key: 'col3', width: 10 },  // Đvt
    { key: 'col4', width: 18 },  // Qui cách
    { key: 'col5', width: 14 },  // Dự toán
    { key: 'col6', width: 14 },  // Lũy kế cũ
    { key: 'col7', width: 14 },  // Tồn cũ
    { key: 'col8', width: 14 },  // Kỳ này
    { key: 'col9', width: 14 },  // Lũy kế mới
    { key: 'col10', width: 14 }, // Tồn mới
    { key: 'col11', width: 18 }, // Ghi chú
  ];

  // Helper Sanitizer
  const s = (val: any) => String(val || "").replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, " ").trim();

  // Draw 1. Structured Header (Logo/Company | Title | Code)
  for (let i = 1; i <= 3; i++) {
    const row = worksheet.getRow(i);
    row.height = 25;
    for (let c = 1; c <= 11; c++) {
      row.getCell(c).border = BORDER_STYLE;
    }
  }

  // Company Box (A1:C3)
  worksheet.mergeCells('A1:C3');
  const logoCell = worksheet.getCell('A1');
  logoCell.value = "CÔNG TY TNHH MTV XÂY DỰNG IJC";
  logoCell.font = { name: 'Times New Roman', size: 10, bold: true };
  logoCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // Title Box (D1:J1)
  worksheet.mergeCells('D1:J1');
  const hTitle = worksheet.getCell('D1');
  hTitle.value = "PHIẾU ĐỀ NGHỊ";
  hTitle.font = { name: 'Times New Roman', size: 15, bold: true };
  hTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtitle Box (D2:J3)
  worksheet.mergeCells('D2:J3');
  const hSubTitle = worksheet.getCell('D2');
  hSubTitle.value = "“V/v: Cung cấp vật tư, thiết bị, dịch vụ”";
  hSubTitle.font = { name: 'Times New Roman', size: 11, bold: true, italic: true };
  hSubTitle.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // Form Code Box (K1:K3)
  worksheet.mergeCells('K1:K3');
  const hCode = worksheet.getCell('K1');
  hCode.value = "QTMH-BM06";
  hCode.font = { name: 'Times New Roman', size: 11, bold: true };
  hCode.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add logo dynamically based on config position
  const logoPos = (window as any)._cauHinh?.logo_position || 'left';
  if (logoUrl && logoUrl.includes("base64,")) {
    try {
      const base64Data = logoUrl.split(",")[1];
      const logoId = workbook.addImage({
        base64: base64Data,
        extension: 'png',
      });
      if (logoPos === 'left') {
        logoCell.value = "";
        worksheet.addImage(logoId, {
          tl: { col: 0.8, row: 0.2 },
          ext: { width: 60, height: 45 },
          editAs: 'oneCell'
        });
      } else if (logoPos === 'center') {
        hTitle.value = "\nPHIẾU ĐỀ NGHỊ";
        worksheet.addImage(logoId, {
          tl: { col: 6.2, row: 0.1 },
          ext: { width: 60, height: 35 },
          editAs: 'oneCell'
        });
      } else if (logoPos === 'right') {
        hCode.value = "";
        worksheet.addImage(logoId, {
          tl: { col: 10.1, row: 0.2 },
          ext: { width: 60, height: 45 },
          editAs: 'oneCell'
        });
      }
    } catch (error) {
      console.error("Error adding logo to Excel BM06:", error);
    }
  }

  // Date formatted line
  const parsedDate = bm06Data.orderDate ? bm06Data.orderDate.split('-') : [];
  const dateFormatted = parsedDate.length === 3 
    ? `TP.HCM, ngày ${parsedDate[2]} tháng ${parsedDate[1]} năm ${parsedDate[0]}` 
    : 'TP.HCM, ngày... tháng... năm...';

  worksheet.mergeCells('A5:K5');
  const dateCell = worksheet.getCell('A5');
  dateCell.value = dateFormatted;
  dateCell.font = { name: 'Times New Roman', size: 11, italic: true };
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' };

  // Kính gửi
  worksheet.mergeCells('A6:K6');
  const kgCell = worksheet.getCell('A6');
  kgCell.value = `Kính gửi: ${s(bm06Data.company)}`;
  kgCell.font = { name: 'Times New Roman', size: 11, bold: true };
  kgCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // Bases
  worksheet.mergeCells('A7:K7');
  worksheet.getCell('A7').value = "- Căn cứ Hợp đồng thi công;";
  worksheet.getCell('A7').font = FONT_NORMAL;

  worksheet.mergeCells('A8:K8');
  worksheet.getCell('A8').value = "- Căn cứ hồ sơ thiết kế, dự toán đã được duyệt;";
  worksheet.getCell('A8').font = FONT_NORMAL;

  // Intro text
  worksheet.mergeCells('A9:K9');
  const introCell = worksheet.getCell('A9');
  introCell.value = `Phòng Kỹ thuật kính trình ${s(bm06Data.receiver)} xét duyệt cung cấp vật tư, thiết bị, dịch vụ để thi công cho công trình của hợp đồng nêu trên, chi tiết như sau:`;
  introCell.font = FONT_NORMAL;
  introCell.alignment = { wrapText: true, vertical: 'middle' };

  // 1/ MỤC ĐÍCH SỬ DỤNG
  worksheet.mergeCells('A11:K11');
  const section1Cell = worksheet.getCell('A11');
  section1Cell.value = "1/ MỤC ĐÍCH SỬ DỤNG:";
  section1Cell.font = { name: 'Times New Roman', size: 12, bold: true };

  let rIdx = 12;

  // Render Purpose (Nội dung) lines dynamically
  const purposeLines = s(bm06Data.purpose).split('\n').map(l => l.trim()).filter(Boolean);
  if (purposeLines.length === 0) {
    purposeLines.push("");
  }
  purposeLines.forEach((line, lineIdx) => {
    worksheet.mergeCells(`A${rIdx}:K${rIdx}`);
    const cell = worksheet.getCell(`A${rIdx}`);
    cell.value = lineIdx === 0 ? `     - Nội dung: ${line}` : `     - ${line}`;
    cell.font = FONT_NORMAL;
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    rIdx++;
  });

  // Render Location (Địa điểm) lines dynamically
  if (bm06Data.showLocation !== false) {
    const locationLines = s(bm06Data.location).split('\n').map(l => l.trim()).filter(Boolean);
    if (locationLines.length === 0) {
      locationLines.push("");
    }
    locationLines.forEach((line, lineIdx) => {
      worksheet.mergeCells(`A${rIdx}:K${rIdx}`);
      const cell = worksheet.getCell(`A${rIdx}`);
      cell.value = lineIdx === 0 ? `     - Địa điểm: ${line}` : `     - ${line}`;
      cell.font = FONT_NORMAL;
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      rIdx++;
    });
  }

  // Spacer
  rIdx++;

  // 2/ MUA VẬT TƯ, THIẾT BỊ, DỊCH VỤ
  worksheet.mergeCells(`A${rIdx}:K${rIdx}`);
  const section2Cell = worksheet.getCell(`A${rIdx}`);
  section2Cell.value = "2/ MUA VẬT TƯ, THIẾT BỊ, DỊCH VỤ:";
  section2Cell.font = { name: 'Times New Roman', size: 12, bold: true };
  rIdx++;

  // Spacer
  rIdx++;

  // Set Table columns header
  const tableHeaderRowIdx = rIdx;
  const headerRow = worksheet.getRow(tableHeaderRowIdx);
  headerRow.height = 25;
  const colTitles = [
    "STT", "Tên vật tư/thiết bị/dịch vụ", "Đvt", "Qui cách", "Dự toán", 
    "Lũy kế cũ", "Tồn cũ", "Kỳ này", "Lũy kế mới", "Tồn mới", "Ghi chú"
  ];
  for (let c = 1; c <= 11; c++) {
    const cell = headerRow.getCell(c);
    cell.value = colTitles[c - 1];
    cell.font = FONT_BOLD;
    cell.border = BORDER_STYLE;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F2F2F2' }
    };
  }

  let tableRowIdx = tableHeaderRowIdx + 1;
  const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
  const selectedUnitsList = bm06Data.selectedUnits || [];
  const rowsList = bm06Data.rows || [];
  const displayMode = bm06Data.displayMode || "TACH";

  if (displayMode === "GOP") {
    const groups: Record<string, any> = {};
    rowsList.forEach((r: any) => {
      const key = `${(r.name || "").trim().toLowerCase()}::${(r.unit || "").trim().toLowerCase()}::${(r.specification || "").trim().toLowerCase()}`;
      if (!groups[key]) {
        groups[key] = {
          name: r.name,
          unit: r.unit,
          specification: r.specification || "",
          estimatedQty: 0,
          cumulativeQtyOld: 0,
          remainingQtyOld: 0,
          orderQty: 0,
          cumulativeQtyNew: 0,
          remainingQtyNew: 0,
          notes: r.notes || "",
          appliedUnits: [],
        };
      }
      const g = groups[key];
      g.estimatedQty += Number(r.estimatedQty) || 0;
      g.cumulativeQtyOld += Number(r.cumulativeQtyOld) || 0;
      g.remainingQtyOld += Number(r.remainingQtyOld) || 0;
      g.orderQty += Number(r.orderQty) || 0;
      g.cumulativeQtyNew += Number(r.cumulativeQtyNew) || 0;
      g.remainingQtyNew += Number(r.remainingQtyNew) || 0;
      if (r.notes && !g.notes.includes(r.notes)) {
        g.notes = g.notes ? `${g.notes}; ${r.notes}` : r.notes;
      }
      g.appliedUnits.push(r.unitId);
    });

    const finalRowsList = Object.values(groups).map((g: any) => {
      const uniqueUnits = Array.from(new Set(g.appliedUnits)).sort();
      return {
        ...g,
        appliedUnitsText: uniqueUnits.map((u: any) => formatUnitNameForTable(u)).join(', ')
      };
    });

    finalRowsList.forEach((r: any, idx: number) => {
      const row = worksheet.getRow(tableRowIdx);
      row.height = 20;
      for (let c = 1; c <= 11; c++) {
        row.getCell(c).border = BORDER_STYLE;
      }

      row.getCell(1).value = idx + 1;
      row.getCell(1).font = FONT_NORMAL;
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

      row.getCell(2).value = `${s(r.name)} (Áp dụng cho căn: ${r.appliedUnitsText})`;
      row.getCell(2).font = FONT_BOLD;
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };

      row.getCell(3).value = s(r.unit);
      row.getCell(3).font = FONT_NORMAL;
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

      row.getCell(4).value = s(r.specification);
      row.getCell(4).font = FONT_NORMAL;
      row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

      row.getCell(5).value = formatNumberForExport(Number(r.estimatedQty || 0));
      row.getCell(5).font = FONT_NORMAL;
      row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(6).value = formatNumberForExport(Number(r.cumulativeQtyOld || 0));
      row.getCell(6).font = FONT_NORMAL;
      row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(7).value = formatNumberForExport(Number(r.remainingQtyOld || 0));
      row.getCell(7).font = FONT_NORMAL;
      row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(8).value = formatNumberForExport(Number(r.orderQty || 0));
      row.getCell(8).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF0000' } };
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(9).value = formatNumberForExport(Number(r.cumulativeQtyNew || 0));
      row.getCell(9).font = FONT_NORMAL;
      row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(10).value = formatNumberForExport(Number(r.remainingQtyNew || 0));
      row.getCell(10).font = FONT_NORMAL;
      row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(11).value = s(r.notes);
      row.getCell(11).font = FONT_NORMAL;
      row.getCell(11).alignment = { horizontal: 'left', vertical: 'middle' };

      tableRowIdx++;
    });
  } else {
    selectedUnitsList.forEach((u: any, groupIdx: number) => {
      // Section Title (Roman STT, full unmerged row cells 3-11 empty)
      const secRow = worksheet.getRow(tableRowIdx);
      secRow.height = 22;
      for (let c = 1; c <= 11; c++) {
        secRow.getCell(c).border = BORDER_STYLE;
      }

      const romanCell = secRow.getCell(1);
      romanCell.value = romanNumerals[groupIdx] || String(groupIdx + 1);
      romanCell.font = FONT_BOLD;
      romanCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const nameHeaderCell = secRow.getCell(2);
      nameHeaderCell.value = formatUnitNameForTable(u.unitId);
      nameHeaderCell.font = { name: 'Times New Roman', size: 11, bold: true };
      nameHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };

      tableRowIdx++;

      // Items
      const groupRows = rowsList.filter((r: any) => r.projectId === u.projectId && r.unitId === u.unitId);
      groupRows.forEach((r: any, idx: number) => {
        const row = worksheet.getRow(tableRowIdx);
        row.height = 20;
        for (let c = 1; c <= 11; c++) {
          row.getCell(c).border = BORDER_STYLE;
        }

        row.getCell(1).value = idx + 1;
        row.getCell(1).font = FONT_NORMAL;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(2).value = s(r.name);
        row.getCell(2).font = FONT_BOLD;
        row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };

        row.getCell(3).value = s(r.unit);
        row.getCell(3).font = FONT_NORMAL;
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(4).value = s(r.specification);
        row.getCell(4).font = FONT_NORMAL;
        row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

        row.getCell(5).value = formatNumberForExport(Number(r.estimatedQty || 0));
        row.getCell(5).font = FONT_NORMAL;
        row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(6).value = formatNumberForExport(Number(r.cumulativeQtyOld || 0));
        row.getCell(6).font = FONT_NORMAL;
        row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(7).value = formatNumberForExport(Number(r.remainingQtyOld || 0));
        row.getCell(7).font = FONT_NORMAL;
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(8).value = formatNumberForExport(Number(r.orderQty || 0));
        row.getCell(8).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF0000' } };
        row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(9).value = formatNumberForExport(Number(r.cumulativeQtyNew || 0));
        row.getCell(9).font = FONT_NORMAL;
        row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(10).value = formatNumberForExport(Number(r.remainingQtyNew || 0));
        row.getCell(10).font = FONT_NORMAL;
        row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };

        row.getCell(11).value = s(r.notes);
        row.getCell(11).font = FONT_NORMAL;
        row.getCell(11).alignment = { horizontal: 'left', vertical: 'middle' };

        tableRowIdx++;
      });
    });
  }

  // Spacer
  tableRowIdx += 2;

  // Signatures Board (3 column modern layout)
  const sigRowIdx = tableRowIdx;
  worksheet.mergeCells(`A${sigRowIdx}:C${sigRowIdx}`);
  const sTitle1 = worksheet.getCell(`A${sigRowIdx}`);
  sTitle1.value = "Trưởng bộ phận";
  sTitle1.font = FONT_BOLD;
  sTitle1.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`E${sigRowIdx}:G${sigRowIdx}`);
  const sTitle2 = worksheet.getCell(`E${sigRowIdx}`);
  sTitle2.value = "Xác nhận của Thủ kho";
  sTitle2.font = FONT_BOLD;
  sTitle2.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`I${sigRowIdx}:K${sigRowIdx}`);
  const sTitle3 = worksheet.getCell(`I${sigRowIdx}`);
  sTitle3.value = "Người đề nghị";
  sTitle3.font = FONT_BOLD;
  sTitle3.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: Signatures sub-notes
  tableRowIdx++;
  const subRowIdx = tableRowIdx;
  worksheet.mergeCells(`A${subRowIdx}:C${subRowIdx}`);
  const sSub1 = worksheet.getCell(`A${subRowIdx}`);
  sSub1.value = "(Ký, ghi rõ họ tên)";
  sSub1.font = FONT_ITALIC;
  sSub1.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`E${subRowIdx}:G${subRowIdx}`);
  const sSub2 = worksheet.getCell(`E${subRowIdx}`);
  sSub2.value = "(Ký, xác nhận tồn kho)";
  sSub2.font = FONT_ITALIC;
  sSub2.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`I${subRowIdx}:K${subRowIdx}`);
  const sSub3 = worksheet.getCell(`I${subRowIdx}`);
  sSub3.value = "(Ký và ghi rõ họ tên)";
  sSub3.font = FONT_ITALIC;
  sSub3.alignment = { horizontal: 'center', vertical: 'middle' };

  // Space for physical ink signature (tăng thêm 2 dòng cho vị trí ký tên)
  tableRowIdx += 7;

  // Row 3: Names (Bold, uppercase)
  const nameRowIdx = tableRowIdx;
  worksheet.mergeCells(`A${nameRowIdx}:C${nameRowIdx}`);
  const sName1 = worksheet.getCell(`A${nameRowIdx}`);
  sName1.value = s(bm06Data.departmentHead || "").toUpperCase();
  sName1.font = FONT_BOLD;
  sName1.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`E${nameRowIdx}:G${nameRowIdx}`);
  const sName2 = worksheet.getCell(`E${nameRowIdx}`);
  sName2.value = s(bm06Data.storekeeper || "").toUpperCase();
  sName2.font = FONT_BOLD;
  sName2.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`I${nameRowIdx}:K${nameRowIdx}`);
  const sName3 = worksheet.getCell(`I${nameRowIdx}`);
  sName3.value = s(bm06Data.proposer || "").toUpperCase();
  sName3.font = FONT_BOLD;
  sName3.alignment = { horizontal: 'center', vertical: 'middle' };

  // Generate buffer & trigger saveAs
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const baseName = bm06Data.originalFileName ? bm06Data.originalFileName : generateCommonFileNamePart(bm06Data);
  const fileName = `${baseName}_BM06.xlsx`;
  FileSaver.saveAs(blob, fileName);
}

export interface MaterialQuotationItem {
  id?: string;
  name: string;
  unit: string;
  specification?: string;
  unitPrice: number;
  supplier?: string;
  note?: string;
}

export interface ExportQuotationOptions {
  categoryName: string;
  categoryId: string;
  supplierName?: string;
  exporterName?: string;
  vatRate?: number;
  items: MaterialQuotationItem[];
  includePreTaxPrice?: boolean;
  includePostTaxPrice?: boolean;
  includeNotes?: boolean;
}

export async function exportMaterialCatalogQuotationToExcel(options: ExportQuotationOptions) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Báo Giá Vật Tư');

  const vatRate = options.vatRate !== undefined ? options.vatRate : 8;
  const includePreTax = options.includePreTaxPrice !== false;
  const includePostTax = options.includePostTaxPrice !== false;
  const includeNotes = options.includeNotes !== false;

  // Page Setup for A4 Landscape
  worksheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5, right: 0.5,
      top: 0.5, bottom: 0.5,
      header: 0.3, footer: 0.3
    }
  };

  // Build Column Definitions dynamically
  const colDefs: { header: string; key: string; width: number; align: 'left' | 'center' | 'right'; numFmt?: string }[] = [
    { header: 'STT', key: 'stt', width: 7, align: 'center' },
    { header: 'Tên vật tư', key: 'name', width: 38, align: 'left' },
    { header: 'Quy cách', key: 'specification', width: 30, align: 'left' },
    { header: 'ĐVT', key: 'unit', width: 10, align: 'center' }
  ];

  if (includePreTax) {
    colDefs.push({ header: 'Đơn giá trước thuế (VNĐ)', key: 'preTaxPrice', width: 22, align: 'right', numFmt: '#,##0' });
  }

  colDefs.push({ header: 'Thuế VAT (%)', key: 'vatRate', width: 14, align: 'center', numFmt: '0"%"' });

  if (includePostTax) {
    colDefs.push({ header: 'Đơn giá sau thuế (VNĐ)', key: 'postTaxPrice', width: 22, align: 'right', numFmt: '#,##0' });
  }

  if (includeNotes) {
    colDefs.push({ header: 'Ghi chú', key: 'note', width: 25, align: 'left' });
  }

  const numCols = colDefs.length;

  // Set worksheet columns width
  worksheet.columns = colDefs.map(c => ({ key: c.key, width: c.width }));

  let rowIndex = 1;

  // Title Row
  worksheet.mergeCells(rowIndex, 1, rowIndex, numCols);
  const titleCell = worksheet.getCell(rowIndex, 1);
  titleCell.value = 'BÁO GIÁ VẬT TƯ / THIẾT BỊ';
  titleCell.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(rowIndex).height = 28;
  rowIndex++;

  // Subtitle Row
  worksheet.mergeCells(rowIndex, 1, rowIndex, numCols);
  const subCell = worksheet.getCell(rowIndex, 1);
  subCell.value = `DANH MỤC: ${options.categoryName.toUpperCase()}`;
  subCell.font = { name: 'Times New Roman', size: 12, bold: true, italic: true, color: { argb: 'FF334155' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(rowIndex).height = 20;
  rowIndex++;

  rowIndex++; // Spacing

  // Metadata block
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportDateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const exportDateTimeFull = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const metaRows = [
    { label: 'Tên danh mục:', val: options.categoryName },
    { label: 'Nhà cung cấp:', val: options.supplierName || 'Theo hệ thống quản lý vật tư' },
    { label: 'Ngày xuất:', val: exportDateStr },
    { label: 'Người xuất:', val: options.exporterName || 'Hệ thống Quản lý' },
    { label: 'Tổng số mặt hàng:', val: `${options.items.length} mặt hàng` }
  ];

  metaRows.forEach(m => {
    const row = worksheet.getRow(rowIndex);
    row.getCell(1).value = m.label;
    row.getCell(1).font = { name: 'Times New Roman', size: 11, bold: true };
    row.getCell(2).value = m.val;
    row.getCell(2).font = { name: 'Times New Roman', size: 11 };
    row.height = 20;
    rowIndex++;
  });

  rowIndex++; // Spacing

  // Table Header Row
  const headerRowIndex = rowIndex;
  const headerRow = worksheet.getRow(headerRowIndex);
  headerRow.height = 32;

  colDefs.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Dark blue theme
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER_STYLE;
  });

  rowIndex++;

  // Data Rows
  options.items.forEach((item, idx) => {
    const row = worksheet.getRow(rowIndex);
    row.height = 24;

    const preTax = Number(item.unitPrice || 0);
    const postTax = Math.round(preTax * (1 + vatRate / 100));

    let cIdx = 1;
    // STT
    const cStt = row.getCell(cIdx++);
    cStt.value = idx + 1;
    cStt.alignment = { horizontal: 'center', vertical: 'middle' };

    // Tên vật tư
    const cName = row.getCell(cIdx++);
    cName.value = item.name;
    cName.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Quy cách
    const cSpec = row.getCell(cIdx++);
    cSpec.value = item.specification || '';
    cSpec.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // ĐVT
    const cUnit = row.getCell(cIdx++);
    cUnit.value = item.unit || '';
    cUnit.alignment = { horizontal: 'center', vertical: 'middle' };

    // Đơn giá trước thuế
    if (includePreTax) {
      const cPre = row.getCell(cIdx++);
      cPre.value = preTax;
      cPre.numFmt = '#,##0';
      cPre.alignment = { horizontal: 'right', vertical: 'middle' };
    }

    // Thuế VAT (%)
    const cVat = row.getCell(cIdx++);
    cVat.value = vatRate / 100;
    cVat.numFmt = '0"% "';
    cVat.alignment = { horizontal: 'center', vertical: 'middle' };

    // Đơn giá sau thuế
    if (includePostTax) {
      const cPost = row.getCell(cIdx++);
      cPost.value = postTax;
      cPost.numFmt = '#,##0';
      cPost.alignment = { horizontal: 'right', vertical: 'middle' };
    }

    // Ghi chú
    if (includeNotes) {
      const cNote = row.getCell(cIdx++);
      cNote.value = item.note || item.supplier || '';
      cNote.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    }

    // Apply font & borders for all data cells in row
    for (let c = 1; c <= numCols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Times New Roman', size: 11 };
      cell.border = BORDER_STYLE;
    }

    rowIndex++;
  });

  rowIndex++; // Spacing

  // Footer / Bottom summary block
  const footerRows = [
    `• Tổng số mặt hàng: ${options.items.length} mặt hàng`,
    `• Thời gian xuất: ${exportDateTimeFull}`,
    `• Phiên bản dữ liệu: 1.0 (Dữ liệu Quản lý Vật tư chính)`
  ];

  footerRows.forEach(ft => {
    const row = worksheet.getRow(rowIndex);
    row.getCell(1).value = ft;
    row.getCell(1).font = { name: 'Times New Roman', size: 10, italic: true, bold: true, color: { argb: 'FF475569' } };
    row.height = 18;
    rowIndex++;
  });

  // Freeze pane & AutoFilter
  worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];
  worksheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: numCols }
  };

  // Generate Filename
  function sanitizeFilenamePart(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase();
  }

  const cleanCat = sanitizeFilenamePart(options.categoryName || options.categoryId || 'DANH_MUC');
  const fileDateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = `BAO_GIA_${cleanCat}_${fileDateStr}.xlsx`;

  // Output File
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  FileSaver.saveAs(blob, fileName);
}



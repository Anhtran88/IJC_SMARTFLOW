import * as XLSX from 'xlsx';
import { EstimateItem } from '../types';
import { parseVNNumber } from '../src/lib/formatUtils';

/**
 * Parses the Excel file from the DUTOAN sheet.
 * Header is at Row 4. Data starts at Row 6.
 * Col A: STT (Skip Roman numerals like I, II, III, IV, etc.)
 * Col B: Mã số (code)
 * Col C: Tên vật tư (name)
 * Col D: Đơn vị (unit)
 * Col E: Khối lượng (estimatedQty)
 * Col F: Giá gốc (basePrice)
 */
export async function parseExcelDutoan(file: File): Promise<EstimateItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('Dữ liệu file trống hoặc không đọc được.');
        }

        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = "DUTOAN";
        let sheet = workbook.Sheets[sheetName];

        // If exact sheet name "DUTOAN" is not found, try common names case-insensitive and normalized
        if (!sheet) {
          const normalizeString = (str: string) => {
            return str
              .normalize('NFD')                     // Normalize to decompose accents
              .replace(/[\u0300-\u036f]/g, '')     // Remove accents
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');          // Keep only alphanumeric chars
          };

          const targetNorm = normalizeString(sheetName);

          let foundSheetName = workbook.SheetNames.find(name => {
            const normName = normalizeString(name);
            return normName === targetNorm || normName.includes(targetNorm);
          });

          if (!foundSheetName) {
            foundSheetName = workbook.SheetNames.find(name => {
              const normName = normalizeString(name);
              return normName.includes("vattu") || normName.includes("khoiluong") || normName.includes("estimate") || normName.includes("dutoan");
            });
          }

          if (!foundSheetName && workbook.SheetNames.length > 0) {
            foundSheetName = workbook.SheetNames[0];
          }

          if (foundSheetName) {
            sheet = workbook.Sheets[foundSheetName];
            console.log(`Fallback to Excel sheet: "${foundSheetName}"`);
          }
        }

        if (!sheet) {
          throw new Error(`Không tìm thấy sheet "DUTOAN" hoặc sheet phù hợp nào khác trong file Excel.`);
        }

        const refVal = sheet['!ref'];
        if (!refVal) {
          throw new Error('Sheet không có dữ liệu (thiếu reference range).');
        }

        const range = XLSX.utils.decode_range(refVal);
        const items: EstimateItem[] = [];

        // 1. Dynamic Header Row & Column detection
        let headerRowIndex = -1;
        let colStt = 0;       // Column A
        let colCode = 1;      // Column B
        let colName = 2;      // Column C
        let colUnit = 3;      // Column D
        let colQty = 4;       // Column E
        let colPrice = -1;    // Column F default is not strictly set unless found

        const maxScanRows = Math.min(25, range.e.r);
        const maxScanCols = Math.min(20, range.e.c);

        for (let r = 0; r <= maxScanRows; r++) {
          let matches = 0;
          let tempStt = -1;
          let tempCode = -1;
          let tempName = -1;
          let tempUnit = -1;
          let tempQty = -1;
          let tempPrice = -1;

          for (let c = 0; c <= maxScanCols; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            if (!cell || cell.v === undefined) continue;
            const val = String(cell.v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            // Check STT
            if (val === 'stt' || val === 'so tt' || val === 'thu tu' || val === 'no' || val === 'no.') {
              tempStt = c;
              matches++;
            }
            // Check Code (Check code before name because code names can contain name keywords like "Mã vật tư")
            else if (val.includes('ma so') || val.includes('ma hieu') || val === 'ma' || val.includes('ma vat tu') || val === 'code' || val.includes('ma hang') || val.includes('ky hieu')) {
              tempCode = c;
              matches++;
            }
            // Check Unit
            else if (val === 'dvt' || val === 'don vi' || val === 'don vi tinh' || val === 'unit' || val.includes('d.v.t') || val === 'tinh' || val === 'donvi') {
              tempUnit = c;
              matches++;
            }
            // Check Price
            else if (val === 'gia' || val === 'don gia' || val.includes('gia goc') || val === 'price' || val.includes('gia ban')) {
              tempPrice = c;
              matches++;
            }
            // Check Qty
            else if ((val.includes('khoi luong') || val.includes('so luong') || val === 'qty' || val.includes('quantity') || val === 'kl' || val === 'sl' || val.includes('hao phi') || val.includes('dinh muc')) && !val.includes('rieng') && !val.includes('don gia')) {
              tempQty = c;
              matches++;
            }
            // Check Name (broadest, so checked last)
            else if (val.includes('ten') || val.includes('vat tu') || val.includes('vat lieu') || val.includes('dien giai') || val.includes('quy cach') || val.includes('noi dung') || val.includes('mo ta') || val.includes('cong viec') || val.includes('hang muc') || val.includes('san pham')) {
              tempName = c;
              matches++;
            }
          }

          // If we find 2 or more matched columns (and definitely must map Name), we found our header!
          if (matches >= 2 && tempName !== -1) {
            headerRowIndex = r;
            if (tempStt !== -1) colStt = tempStt;
            if (tempCode !== -1) colCode = tempCode;
            if (tempName !== -1) colName = tempName;
            if (tempUnit !== -1) colUnit = tempUnit;
            if (tempQty !== -1) colQty = tempQty;
            if (tempPrice !== -1) colPrice = tempPrice;
            break;
          }
        }

        // 2. Compute Start Row
        // If header found, start at headerRowIndex + 1, else fall back to default start r = 5 (Row 6)
        const startRowIndex = headerRowIndex !== -1 ? headerRowIndex + 1 : 5;

        console.log(`Detected columns index - STT: ${colStt}, Code: ${colCode}, Name: ${colName}, Unit: ${colUnit}, Qty: ${colQty}, Price: ${colPrice}. Start row index: ${startRowIndex}`);

        for (let r = startRowIndex; r <= range.e.r; r++) {
          const cellA = colStt !== -1 ? sheet[XLSX.utils.encode_cell({ r, c: colStt })] : null;
          const cellB = colCode !== -1 && colCode !== colStt && colCode !== colName ? sheet[XLSX.utils.encode_cell({ r, c: colCode })] : null;
          const cellC = colName !== -1 ? sheet[XLSX.utils.encode_cell({ r, c: colName })] : null;
          const cellD = colUnit !== -1 && colUnit !== colStt && colUnit !== colName ? sheet[XLSX.utils.encode_cell({ r, c: colUnit })] : null;
          const cellE = colQty !== -1 && colQty !== colStt && colQty !== colName ? sheet[XLSX.utils.encode_cell({ r, c: colQty })] : null;
          const cellF = colPrice !== -1 && colPrice !== colCode && colPrice !== colName && colPrice !== colStt && colPrice !== colQty ? sheet[XLSX.utils.encode_cell({ r, c: colPrice })] : null;

          const valA = cellA && cellA.v !== undefined ? String(cellA.v).trim() : '';
          const valB = cellB && cellB.v !== undefined ? String(cellB.v).trim() : '';
          const valC = cellC && cellC.v !== undefined ? String(cellC.v).trim() : '';
          let valD = cellD && cellD.v !== undefined ? String(cellD.v).trim() : '';
          if (valC && !valD) {
            valD = '-'; // fallback if unit is left blank
          }

          let valE = 0;
          if (cellE && cellE.v !== undefined) {
            const rawFormatted = cellE.w ? String(cellE.w).trim() : String(cellE.v).trim();
            valE = parseVNNumber(cellE.v, 0, { rawStr: rawFormatted, unit: valD, fieldRole: 'quantity' });
          }

          let valF = 0;
          if (cellF && cellF.v !== undefined) {
            const rawFormatted = cellF.w ? String(cellF.w).trim() : String(cellF.v).trim();
            valF = parseVNNumber(cellF.v, 0, { rawStr: rawFormatted, unit: valD, fieldRole: 'unitPrice' });
          }

          // Skip completely empty rows
          if (!valC) {
            continue;
          }

          // Skip section headers where A contains Roman numerals: "I", "II", "III", "IV", "V", "VI", etc.
          const isRomanSymbol = /^[IVXLCDM]+\.?$/i.test(valA);
          if (isRomanSymbol) {
            continue;
          }

          // General section headers / group titles usually have no Code, no Unit, and 0 Quantity
          if (!valB && valD === '-' && valE === 0) {
            continue;
          }

          // Validate required fields: name must not be empty, estimatedQty >= 0
          if (!valC || !valD || valE < 0) {
            continue;
          }

          const item: EstimateItem = {
            projectId: '', // will be set by the caller/UI state
            unitId: '',    // will be set by the caller/UI state
            code: valB,
            name: valC,
            unit: valD,
            estimatedQty: valE,
            basePrice: valF,
            cumulativeQty: 0,
            remainingQty: valE,
            warningStatus: 'NORMAL',
            createdAt: new Date(),
            updatedAt: new Date()
          };

          items.push(item);
        }

        if (items.length === 0) {
          throw new Error('Không phân tích được bất kỳ dòng dữ liệu Dự toán hợp lệ nào từ sheet của bạn (dòng phải có Tên, Đơn vị và Khối lượng >= 0).');
        }

        resolve(items);
      } catch (err: any) {
        reject(new Error(`Lỗi xử lý file Excel: ${err.message || err}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Lỗi FileReader: Không thể đọc file này.'));
    };

    reader.readAsBinaryString(file);
  });
}

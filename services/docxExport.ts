
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, VerticalAlign, HeightRule, ImageRun, ShadingType } from "docx";
import FileSaver from "file-saver";
import { FormData, BBNTData } from "../types";
import { generateCommonFileNamePart } from "../src/utils/exportUtils";
import { formatNumberForExport, formatBM02CurrencyForExport, formatUnitNameForTable, stripAppliedUnitsSuffix, getFirebaseSafeKey, extractCongTrinhFromDiaDiem } from "../src/lib/formatUtils";

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

export async function exportToDocx(formData: FormData, logoUrl?: string | null, kyTenBM02?: any[]) {
  // Enhanced sanitization: Keep newlines (\n) but remove other control characters
  const s = (val: any) => String(val || "").replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, " ").trim();

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
  
  // Helper to handle text with potential line breaks without inserting redundant empty lines
  const processText = (text: string, options: any = {}) => {
    const raw = String(text || "");
    const cleanText = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, " ").trim();
    let lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1 && cleanText.length > 0) {
      if (cleanText.includes(';') && (cleanText.includes('Thi công') || cleanText.includes('tầng') || cleanText.includes('lô') || cleanText.includes('cọc') || cleanText.includes('xây') || cleanText.includes('ép') || cleanText.includes('cột') || cleanText.includes('dầm') || cleanText.includes('công tác'))) {
        lines = cleanText.split(/;\s*/).map(l => l.trim()).filter(l => l.length > 0).map(l => (l.startsWith('-') || l.startsWith('•') ? l : `- ${l}`));
      } else if (cleanText.includes('•')) {
        lines = cleanText.split(/•\s*/).map(l => l.trim()).filter(l => l.length > 0).map(l => `• ${l}`);
      } else if (/(?<=\S)\s+-\s+(?=[A-ZÀ-Ỹa-zà-ỹ0-9])/u.test(cleanText)) {
        lines = cleanText.split(/(?<=\S)\s+-\s+/u).map((l, idx) => (idx === 0 && !cleanText.startsWith('-') ? l.trim() : `- ${l.trim()}`)).filter(l => l.length > 0);
      } else {
        const tc = cleanText.split(/(?<=\S)\s+(?=Thi công\b)/i).map(l => l.trim()).filter(l => l.length > 0);
        if (tc.length > 1) {
          lines = tc.map(l => (l.startsWith('-') || l.startsWith('•') ? l : `- ${l}`));
        }
      }
    }
    if (lines.length === 0) {
      return [new TextRun({ ...options, text: "" })];
    }
    return lines.map((line, i) => new TextRun({ 
      ...options,
      text: line, 
      break: i > 0 ? 1 : 0 
    }));
  };

  // Helper to process logo data
  let logoImageRun: ImageRun | null = null;
  if (logoUrl && logoUrl.includes("base64,")) {
    try {
      const base64Data = logoUrl.split(",")[1];
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      
      logoImageRun = new ImageRun({
        data: bytes,
        type: "png",
        transformation: {
          width: 80,
          height: 40,
        },
      });
    } catch (e) {
      console.error("Invalid logo base64 data", e);
    }
  }

  const doc = new Document({
    title: formData.title || "Tờ Trình",
    creator: "BTI Smart Document",
    description: "Tài liệu được tạo tự động từ hệ thống BTI",
    styles: {
      default: {
        document: {
          run: {
            size: 24, // 12pt (giảm 1 size từ 13pt)
            font: "Times New Roman",
            color: "000000",
          },
          paragraph: {
            spacing: {
              line: 240,
              before: 0,
              after: 0,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          // Header Section with Logo Table
          new Table({
            width: { size: 10466, type: WidthType.DXA },
            columnWidths: [2616, 5756, 2094],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 4 },
              left: { style: BorderStyle.SINGLE, size: 4 },
              right: { style: BorderStyle.SINGLE, size: 4 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
              insideVertical: { style: BorderStyle.SINGLE, size: 4 },
            },
            rows: [
              new TableRow({
                height: { value: 1200, rule: HeightRule.ATLEAST },
                children: [
                  // Logo Cell
                  new TableCell({
                    width: { size: 2616, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      logoImageRun ? 
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [logoImageRun],
                        }) :
                        new Table({
                          alignment: AlignmentType.CENTER,
                          width: { size: 85, type: WidthType.PERCENTAGE },
                          borders: {
                            top: { style: BorderStyle.NONE },
                            bottom: { style: BorderStyle.NONE },
                            left: { style: BorderStyle.NONE },
                            right: { style: BorderStyle.NONE },
                            insideHorizontal: { style: BorderStyle.NONE },
                            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "FFFFFF" },
                          },
                          rows: [
                            new TableRow({
                              children: ["B", "T", "I"].map(letter => 
                                new TableCell({
                                  shading: {
                                    fill: "2B579A",
                                    type: ShadingType.CLEAR,
                                    color: "auto",
                                  },
                                  verticalAlign: VerticalAlign.CENTER,
                                  children: [
                                    new Paragraph({
                                      alignment: AlignmentType.CENTER,
                                      children: [
                                        new TextRun({ 
                                          text: letter, 
                                          bold: true, 
                                          size: 40,
                                          color: "FFFFFF",
                                        })
                                      ]
                                    })
                                  ],
                                })
                              )
                            })
                          ]
                        })
                    ],
                  }),
                  // Title Cell
                  new TableCell({
                    width: { size: 5756, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 40, after: 30 },
                        children: [
                          new TextRun({ text: "TỜ TRÌNH", bold: true, size: 30 }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 20, after: 40 },
                        children: processText(formData.title, { bold: false, size: 24 }),
                      }),
                    ],
                  }),
                  // Document Number Cell
                  new TableCell({
                    width: { size: 2094, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: "QTMH-BM02", bold: true, size: 20 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 80, after: 60 },
            children: [
              new TextRun({ text: `${s((formData.location && !formData.location.toLowerCase().includes('thuộc') && !formData.location.toLowerCase().includes('lô') && !formData.location.toLowerCase().includes('khu')) ? formData.location : "Tp. Hồ Chí Minh")}, ${formatToWordDate(formData.date)}`, italics: true }),
            ],
          }),

          // Kính gửi Section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 15, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Kính gửi:", bold: true })]
                      })
                    ]
                  }),
                  new TableCell({
                    width: { size: 85, type: WidthType.PERCENTAGE },
                    children: (formData.recipients || []).filter((r: any) => s(r).length > 0).length > 0 
                      ? formData.recipients.filter((r: any) => s(r).length > 0).map((r: any) => 
                          new Paragraph({
                            children: [new TextRun({ text: `- ${s(r)}` })]
                          })
                        )
                      : [new Paragraph({ children: [new TextRun("")] })]
                  })
                ]
              })
            ]
          }),

          // Grounds directly
          ...(formData.grounds || []).filter((g: any) => s(g).trim().length > 0).map((g: any, idx: number) => new Paragraph({
            spacing: idx === 0 ? { before: 80, after: 20 } : { before: 20, after: 20 },
            children: processText(g),
          })),

          ...(formData.requestContent && s(formData.requestContent).length > 0 ? [
            new Paragraph({
              spacing: { before: 60, after: 40 },
              children: processText(formData.requestContent),
            })
          ] : []),

          new Paragraph({
            children: [new TextRun({ text: "1/ Mục đích sử dụng:", bold: true, underline: {} })],
            spacing: { before: 80, after: 30 },
          }),
          new Paragraph({
            spacing: { before: 20, after: 20 },
            children: [
              new TextRun({ text: "- Nội dung: ", bold: true }),
              ...processText(formData.mucDichSuDungNoiDung || "[Thay đổi theo nội dung file đính kèm]")
            ]
          }),
          new Paragraph({
            spacing: { before: 20, after: 40 },
            children: [
              new TextRun({ text: "- Địa điểm: ", bold: true }),
              ...processText(formData.mucDichSuDungDiaDiem || formData.location || "[Thay đổi theo nội dung file đính kèm]")
            ]
          }),

          new Paragraph({
            children: [new TextRun({ text: "2/ Mua vật tư, thiết bị, dịch vụ:", bold: true, underline: {} })],
            spacing: { before: 80, after: 40 },
          }),

          // Items Table (9 columns, with two-row merged header to match screen/Excel format)
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 4 },
              left: { style: BorderStyle.SINGLE, size: 4 },
              right: { style: BorderStyle.SINGLE, size: 4 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
              insideVertical: { style: BorderStyle.SINGLE, size: 4 },
            },
            rows: [
              // Header Row
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 5, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "STT", bold: true, size: 16 })] })],
                  }),
                  new TableCell({
                    width: { size: 25, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tên vật tư/thiết bị/dịch vụ", bold: true, size: 16 })] })],
                  }),
                  new TableCell({
                    width: { size: 5, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Đvt", bold: true, size: 16 })] })],
                  }),
                  new TableCell({
                    width: { size: 12, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tổng khối lượng/ số lượng... theo dự toán/kế hoạch", bold: true, size: 16 })] })],
                  }),
                  new TableCell({
                    width: { size: 12, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Lũy kế các kỳ trước", bold: true, size: 16 })] })],
                  }),
                  new TableCell({
                    width: { size: 10, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Khối lượng/số lượng cần cung cấp kỳ này", bold: true, size: 16 })] })],
                  }),
                  new TableCell({
                    width: { size: 11, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Đơn giá kỳ này (đồng)", bold: true, size: 16 })] })],
                  }),
                  new TableCell({
                    width: { size: 11, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Thành tiền kỳ này", bold: true, size: 16 })] })],
                  }),
                  new TableCell({
                    width: { size: 9, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Ghi chú", bold: true, size: 16 })] })],
                  }),
                ],
              }),
              // Item Rows with group/tier support matching template
              ...(() => {
                const items = formData.items || [];
                const h = getHierarchy(formData.selectedUnits, items);
                const isGrouped = formData.isGroupedDisplay || formData.displayMode === "GROUPED_EQUAL";

                if (isGrouped) {
                  const groupedRows: TableRow[] = [];
                  
                  // Add 1 Group Header Row
                  groupedRows.push(
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 5, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "★", bold: true, size: 16 })] })],
                        }),
                        new TableCell({
                          width: { size: 25, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          columnSpan: 8,
                          children: [new Paragraph({ children: [new TextRun({ text: `DANH SÁCH VẬT TƯ GỘP (${formData.selectedUnits?.length || 0} căn): ${(formData.selectedUnits || []).map((u: any) => u.unitId).join(", ")}`, bold: true, size: 16 })] })],
                        }),
                      ],
                    })
                  );

                  // Add items
                  items.forEach((item, idx) => {
                    let nameWithApplied = stripAppliedUnitsSuffix(item.name || "");

                    groupedRows.push(
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 5, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(idx + 1) })] })],
                          }),
                          new TableCell({
                            width: { size: 25, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(nameWithApplied) })],
                          }),
                          new TableCell({
                            width: { size: 5, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.unit) })] })],
                          }),
                          new TableCell({
                            width: { size: 12, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.duToanQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 12, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.luyKeQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.quantity || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 11, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatBM02CurrencyForExport(item.unitPrice || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 11, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                              new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [new TextRun({ text: formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), bold: true })],
                              }),
                            ],
                          }),
                          new TableCell({
                            width: { size: 9, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: processText(item.note) })],
                          }),
                        ],
                      })
                    );
                  });

                  return groupedRows;
                }

                if (h.list.length === 0) {
                  return items.map((item) =>
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 5, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.stt) })] })],
                        }),
                        new TableCell({
                          width: { size: 25, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ children: processText(item.name) })],
                        }),
                        new TableCell({
                          width: { size: 5, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.unit) })] })],
                        }),
                        new TableCell({
                          width: { size: 12, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.duToanQty || 0) })] })],
                        }),
                        new TableCell({
                          width: { size: 12, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.luyKeQty || 0) })] })],
                        }),
                        new TableCell({
                          width: { size: 10, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.quantity || 0) })] })],
                        }),
                        new TableCell({
                          width: { size: 11, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatBM02CurrencyForExport(item.unitPrice || 0) })] })],
                        }),
                        new TableCell({
                          width: { size: 11, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [
                            new Paragraph({
                              alignment: AlignmentType.RIGHT,
                              children: [new TextRun({ text: formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), bold: true })],
                            }),
                          ],
                        }),
                        new TableCell({
                          width: { size: 9, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.note) })] })],
                        }),
                      ],
                    })
                  );
                }

                const renderedRows: TableRow[] = [];
                let sttCounter = 0;

                h.list.forEach((u, groupIdx) => {
                  const projId = u.projectId;
                  const unitId = u.unitId;
                  const groupItems = items.filter(
                    it => !(it as any).isProjectShared && (it.projectId || '').toLowerCase() === projId.toLowerCase() && 
                          (it.unitId || '').toLowerCase() === unitId.toLowerCase()
                  );

                  // Add group header row with light gray background
                  renderedRows.push(
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 5, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: toRoman(groupIdx), bold: true, size: 16 })] })],
                        }),
                        new TableCell({
                          width: { size: 25, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ children: [new TextRun({ text: formatUnitNameForTable(unitId), bold: true, size: 16 })] })],
                        }),
                        new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 11, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 11, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 9, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                      ]
                    })
                  );

                  let groupStt = 0;
                  groupItems.forEach((item) => {
                    groupStt++;
                    renderedRows.push(
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 5, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(groupStt) })] })],
                          }),
                          new TableCell({
                            width: { size: 25, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(item.name) })],
                          }),
                          new TableCell({
                            width: { size: 5, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.unit) })] })],
                          }),
                          new TableCell({
                            width: { size: 12, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.duToanQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 12, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.luyKeQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.quantity || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 11, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatBM02CurrencyForExport(item.unitPrice || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 11, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                              new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [new TextRun({ text: formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), bold: true })],
                              }),
                            ],
                          }),
                          new TableCell({
                            width: { size: 9, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.note) })] })],
                          }),
                        ],
                      })
                    );
                  });
                });

                const sharedItems = items.filter(it => (it as any).isProjectShared);
                if (sharedItems.length > 0) {
                  renderedRows.push(
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 5, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "★", bold: true, size: 16 })] })],
                        }),
                        new TableCell({
                          width: { size: 25, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          columnSpan: 8,
                          children: [new Paragraph({ children: [new TextRun({ text: `CHI PHÍ CHIA ĐỀU CÁC CĂN (${formData.selectedUnits?.length || 0} căn): ${(formData.selectedUnits || []).map((u: any) => u.unitId).join(", ")}`, bold: true, size: 16 })] })],
                        }),
                      ],
                    })
                  );
                  let sharedStt = 0;
                  sharedItems.forEach((item) => {
                    sharedStt++;
                    renderedRows.push(
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 5, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(sharedStt) })] })],
                          }),
                          new TableCell({
                            width: { size: 25, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(item.name) })],
                          }),
                          new TableCell({
                            width: { size: 5, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.unit) })] })],
                          }),
                          new TableCell({
                            width: { size: 12, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.duToanQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 12, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.luyKeQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.quantity || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 11, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatBM02CurrencyForExport(item.unitPrice || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 11, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                              new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [new TextRun({ text: formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), bold: true })],
                              }),
                            ],
                          }),
                          new TableCell({
                            width: { size: 9, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.note) })] })],
                          }),
                        ],
                      })
                    );
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
                  const isShared = orphanItems.some((it: any) => it.isSharedCost);
                  const headerText = isShared && h.list.length > 0 
                    ? `CHI PHÍ CHIA ĐỀU CÁC CĂN (${h.list.length} CĂN): ${h.list.map(u => u.unitId).join(', ')}` 
                    : "VẬT TƯ KHÁC / CHƯA PHÂN LOẠI";
                  const sttText = isShared && h.list.length > 0 ? "★" : "X";

                  renderedRows.push(
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 5, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sttText, bold: true, size: 16 })] })],
                        }),
                        new TableCell({
                          width: { size: 25, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ children: [new TextRun({ text: headerText, bold: true, size: 16 })] })],
                        }),
                        new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 11, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 11, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 9, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                      ]
                    })
                  );

                  let orphanStt = 0;
                  orphanItems.forEach((item) => {
                    orphanStt++;
                    renderedRows.push(
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 5, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(orphanStt) })] })],
                          }),
                          new TableCell({
                            width: { size: 25, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(item.name) })],
                          }),
                          new TableCell({
                            width: { size: 5, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.unit) })] })],
                          }),
                          new TableCell({
                            width: { size: 12, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.duToanQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 12, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.luyKeQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(item.quantity || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 11, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatBM02CurrencyForExport(item.unitPrice || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 11, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [
                              new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [new TextRun({ text: formatBM02CurrencyForExport(item.total !== undefined ? item.total : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), bold: true })],
                              }),
                            ],
                          }),
                          new TableCell({
                            width: { size: 9, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.note) })] })],
                          }),
                        ],
                      })
                    );
                  });
                }

                return renderedRows;
              })(),
              ...(showVatVal ? [
                // Summary Row: Thành tiền
                new TableRow({
                  children: [
                    new TableCell({
                      columnSpan: 7,
                      width: { size: 80, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: "Thành tiền kỳ này (chưa bao gồm thuế)", bold: true })],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 11, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.RIGHT,
                          children: [new TextRun({ text: formatNumberForExport(totalPreTaxVal), bold: true })],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 9, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [new Paragraph({ children: [new TextRun("")] })],
                    }),
                  ],
                }),
                // Summary Row: Thuế
                new TableRow({
                  children: [
                    new TableCell({
                      columnSpan: 7,
                      width: { size: 80, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: `Thuế GTGT ${taxRateVal}%`, bold: true })],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 11, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.RIGHT,
                          children: [
                            new TextRun({
                              text: formatNumberForExport(vatAmountVal),
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 9, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [new Paragraph({ children: [new TextRun("")] })],
                    }),
                  ],
                }),
                // Summary Row: Tổng cộng (VAT)
                new TableRow({
                  children: [
                    new TableCell({
                      columnSpan: 7,
                      width: { size: 80, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: "Tổng cộng (đã bao gồm thuế GTGT)", bold: true })],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 11, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.RIGHT,
                          children: [
                            new TextRun({
                              text: formatNumberForExport(totalWithVatVal),
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 9, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [new Paragraph({ children: [new TextRun("")] })],
                    }),
                  ],
                }),
              ] : [
                // Single Summary Row: TỔNG CỘNG (ĐÃ BAO GỒM THUẾ VAT)
                new TableRow({
                  children: [
                    new TableCell({
                      columnSpan: 7,
                      width: { size: 80, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: "TỔNG CỘNG (ĐÃ BAO GỒM THUẾ VAT)", bold: true })],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 11, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.RIGHT,
                          children: [
                            new TextRun({
                              text: formatNumberForExport(totalWithVatVal),
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                    }),
                    new TableCell({
                      width: { size: 9, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.CENTER,
                      children: [new Paragraph({ children: [new TextRun("")] })],
                    }),
                  ],
                }),
              ]),
            ],
          }),

          new Paragraph({
            spacing: { before: 80, after: 20 },
            children: [
              new TextRun({ text: "- Số tiền bằng chữ: ", bold: true }),
              new TextRun({ text: formData.isCustomSoTienBangChu ? (formData.soTienBangChu || numberToVietnameseWords(totalWithVatVal)) : numberToVietnameseWords(totalWithVatVal) })
            ]
          }),
          new Paragraph({
            spacing: { before: 20, after: 30 },
            children: [
              new TextRun({ text: "- Thời hạn thanh toán: ", bold: true }),
              new TextRun({ text: s(formData.thoiHanThanhToan || "") })
            ]
          }),

          new Paragraph({
            spacing: { before: 60, after: 30 },
            children: [
              new TextRun({ text: "3/ Tổng số tiền dự trù kinh phí mua vật tư, thiết bị, dịch vụ kỳ này: ", bold: true }),
              new TextRun({ text: formatNumberForExport(totalWithVatVal), bold: true, underline: {} }),
              new TextRun({ text: " đồng.", bold: true })
            ]
          }),

          new Paragraph({ 
            alignment: AlignmentType.LEFT, 
            spacing: { before: 60, after: 80 },
            children: [new TextRun({ text: "Kính trình./.", bold: true, italics: true })] 
          }),

          // Signatures Section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: (() => {
              const kyTenItems = kyTenBM02 ? [...kyTenBM02].sort((a, b) => a.viTri - b.viTri) : [
                { chucDanh: "Phòng Kế toán", hoTen: formData.phongKeToan || "" },
                { chucDanh: "Người lập", hoTen: formData.nguoiLap || "" },
                { chucDanh: "Giám đốc", hoTen: formData.giamDoc || "" },
                { chucDanh: "Duyệt HĐTV", hoTen: formData.duyetHDTV || "" }
              ];
              
              const signatureRows: TableRow[] = [];
              for (let i = 0; i < kyTenItems.length; i += 3) {
                const chunk = kyTenItems.slice(i, i + 3);
                
                // Titles row
                signatureRows.push(new TableRow({
                  children: chunk.map(item => new TableCell({
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.chucDanh), bold: true, size: 26 })] })]
                  })).concat(chunk.length < 3 ? Array.from({ length: 3 - chunk.length }, () => new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] })) : [])
                }));
                
                // Space row (tăng thêm 2 dòng cho vị trí ký tên)
                signatureRows.push(new TableRow({
                  height: { value: 1600, rule: HeightRule.ATLEAST },
                  children: Array.from({ length: 3 }, () => new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] })
                    ]
                  }))
                }));
                
                // Names row
                signatureRows.push(new TableRow({
                  children: chunk.map(item => new TableCell({
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(item.hoTen).toUpperCase(), bold: true, size: 26 })] })]
                  })).concat(chunk.length < 3 ? Array.from({ length: 3 - chunk.length }, () => new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] })) : [])
                }));
                
                // Extra space between rows
                signatureRows.push(new TableRow({ height: { value: 400, rule: HeightRule.ATLEAST }, children: Array.from({ length: 3 }, () => new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] })) }));
              }
              return signatureRows;
            })(),
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const baseName = formData.originalFileName ? formData.originalFileName : generateCommonFileNamePart(formData);
  const fileName = `${baseName}_BM02.docx`;
  
  saveFile(blob, fileName);
}

export async function exportBBNTToDocx(bbntData: BBNTData, logoUrl?: string | null) {
  const isBM04 = bbntData.formType === 'BM04' || bbntData.docNumber === 'QTMH-BM04';
  // Enhanced sanitization
  const s = (val: any) => String(val || "").replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, " ").trim();
  
  // Helper to handle text with potential line breaks without inserting redundant empty lines
  const processText = (text: string, options: any = {}) => {
    const raw = String(text || "");
    const cleanText = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, " ").trim();
    let lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1 && cleanText.length > 0) {
      if (cleanText.includes(';') && (cleanText.includes('Thi công') || cleanText.includes('tầng') || cleanText.includes('lô') || cleanText.includes('cọc') || cleanText.includes('xây') || cleanText.includes('ép') || cleanText.includes('cột') || cleanText.includes('dầm') || cleanText.includes('công tác'))) {
        lines = cleanText.split(/;\s*/).map(l => l.trim()).filter(l => l.length > 0).map(l => (l.startsWith('-') || l.startsWith('•') ? l : `- ${l}`));
      } else if (cleanText.includes('•')) {
        lines = cleanText.split(/•\s*/).map(l => l.trim()).filter(l => l.length > 0).map(l => `• ${l}`);
      } else if (/(?<=\S)\s+-\s+(?=[A-ZÀ-Ỹa-zà-ỹ0-9])/u.test(cleanText)) {
        lines = cleanText.split(/(?<=\S)\s+-\s+/u).map((l, idx) => (idx === 0 && !cleanText.startsWith('-') ? l.trim() : `- ${l.trim()}`)).filter(l => l.length > 0);
      } else {
        const tc = cleanText.split(/(?<=\S)\s+(?=Thi công\b)/i).map(l => l.trim()).filter(l => l.length > 0);
        if (tc.length > 1) {
          lines = tc.map(l => (l.startsWith('-') || l.startsWith('•') ? l : `- ${l}`));
        }
      }
    }
    if (lines.length === 0) {
      return [new TextRun({ ...options, text: "" })];
    }
    return lines.map((line, i) => new TextRun({ 
      ...options,
      text: line, 
      break: i > 0 ? 1 : 0 
    }));
  };

  // Helper to process logo data
  let logoImageRun: ImageRun | null = null;
  if (logoUrl && logoUrl.includes("base64,")) {
    try {
      const base64Data = logoUrl.split(",")[1];
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      logoImageRun = new ImageRun({
        data: bytes,
        type: "png",
        transformation: {
          width: 80,
          height: 40,
        },
      });
    } catch (e) {
      console.error("Invalid logo base64 data", e);
    }
  }

  const doc = new Document({
    title: bbntData.project || "Biên Bản Nghiệm Thu",
    creator: "BTI Smart Document",
    description: "Biên bản nghiệm thu và bàn giao tự động",
    styles: {
      default: {
        document: {
          run: {
            size: 24, // 12pt (giảm 1 size từ 13pt)
            font: "Times New Roman",
            color: "000000",
          },
          paragraph: {
            spacing: {
              line: 240,
              before: 0,
              after: 0,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [
          // Header Table
          new Table({
            width: { size: 10466, type: WidthType.DXA },
            columnWidths: [2616, 5756, 2094],
            rows: [
              new TableRow({
                height: { value: 1000, rule: HeightRule.ATLEAST },
                children: [
                  new TableCell({
                    width: { size: 2616, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      logoImageRun ? 
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [logoImageRun],
                        }) :
                        new Paragraph({ 
                          alignment: AlignmentType.CENTER, 
                          children: [new TextRun({ text: "B T I", bold: true, size: 36, color: "2B579A" })] 
                        })
                    ]
                  }),
                  new TableCell({
                    width: { size: 5756, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 40, after: 40 },
                        children: processText(
                          (() => {
                            const isBM04 = bbntData.formType === 'BM04' || bbntData.docNumber === 'QTMH-BM04';
                            const defaultTitle = isBM04 ? "BIÊN BẢN GIAO NHẬN VẬT TƯ" : "BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO";
                            return (bbntData.title || (isBM04 ? (window as any)?._currentMaterialConfig?.bm032?.titleBM04 : (window as any)?._currentMaterialConfig?.bm032?.title) || defaultTitle).toUpperCase();
                          })(),
                          { bold: true, size: 28 }
                        )
                      })
                    ]
                  }),
                  new TableCell({
                    width: { size: 2094, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ 
                        alignment: AlignmentType.CENTER, 
                        children: [new TextRun({ 
                          text: (bbntData.formType === 'BM04' || bbntData.docNumber === 'QTMH-BM04') ? "QTMH-BM04" : "QTMH-BM03.2", 
                          bold: true, 
                          size: 20 
                        })] 
                      })
                    ]
                  })
                ]
              })
            ]
          }),

          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 80, after: 40 },
            children: [new TextRun({ text: `${s((bbntData.location && !bbntData.location.toLowerCase().includes('thuộc') && !bbntData.location.toLowerCase().includes('lô') && !bbntData.location.toLowerCase().includes('khu')) ? bbntData.location : "Tp. Hồ Chí Minh")}, ${formatToWordDate(bbntData.date)}`, italics: true })]
          }),

          ...(isBM04 ? [] : [
            new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "1. ĐỐI TƯỢNG:", bold: true })] }),
            new Paragraph({
              spacing: { before: 15, after: 15 },
              children: [
                new TextRun({ text: "- Công trình: " }),
                ...processText(bbntData.project || extractCongTrinhFromDiaDiem(bbntData.address || ""))
              ]
            }),
            new Paragraph({
              spacing: { before: 15, after: 15 },
              children: [
                new TextRun({ text: "- Hạng mục: " }),
                ...processText(
                  s(bbntData.category || (bbntData as any).doiTuong?.hangMuc || "")
                    .replace(/^[\s\-_*•]*(-?\s*Hạng mục|-?\s*Nội dung|V\/v)\s*[:：]\s*/i, '')
                    .trim()
                )
              ]
            }),
            new Paragraph({
              spacing: { before: 15, after: 20 },
              children: [
                new TextRun({ text: "- Địa điểm: " }),
                ...processText(bbntData.address || "")
              ]
            }),

            new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "2. Thành phần tham gia nghiệm thu:", bold: true })] }),
          ]),
          
          // Use Table for fixed alignment of "Chức vụ" in section
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              // Bên Giao Header
              new TableRow({
                children: [
                  new TableCell({
                    columnSpan: 2,
                    children: [
                      new Paragraph({
                        spacing: { before: isBM04 ? 40 : 20, after: 20 },
                        children: [
                          new TextRun({ text: isBM04 ? "1. BÊN GIAO: " : "BÊN GIAO: ", bold: true, underline: {} }),
                          new TextRun({ text: s(bbntData.senderCompany), bold: true })
                        ]
                      })
                    ]
                  })
                ]
              }),
              // Bên Giao List
              ...bbntData.senderList.map(r => 
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 45, type: WidthType.PERCENTAGE },
                      children: [new Paragraph({ spacing: { before: 15, after: 15 }, children: [new TextRun({ text: `- ${s(r.salutation)}: ${s(r.name)}` })] })]
                    }),
                    new TableCell({
                      width: { size: 55, type: WidthType.PERCENTAGE },
                      children: [new Paragraph({ spacing: { before: 15, after: 15 }, children: [new TextRun({ text: `Chức vụ: ${s(r.position)}` })] })]
                    })
                  ]
                })
              ),
              // Bên Nhận Header
              new TableRow({
                children: [
                  new TableCell({
                    columnSpan: 2,
                    children: [
                      new Paragraph({
                        spacing: { before: 60, after: 20 },
                        children: [
                          new TextRun({ text: isBM04 ? "2. BÊN NHẬN: " : "BÊN NHẬN: ", bold: true, underline: {} }),
                          new TextRun({ text: s(bbntData.receiverCompany), bold: true })
                        ]
                      })
                    ]
                  })
                ]
              }),
              // Bên Nhận List
              ...bbntData.receiverList.map(r => 
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 45, type: WidthType.PERCENTAGE },
                      children: [new Paragraph({ spacing: { before: 15, after: 15 }, children: [new TextRun({ text: `- ${s(r.salutation)}: ${s(r.name)}` })] })]
                    }),
                    new TableCell({
                      width: { size: 55, type: WidthType.PERCENTAGE },
                      children: [new Paragraph({ spacing: { before: 15, after: 15 }, children: [new TextRun({ text: `Chức vụ: ${s(r.position)}${r.role ? ` (${s(r.role)})` : ''}` })] })]
                    })
                  ]
                })
              )
            ]
          }),

          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "3. Thời gian, địa điểm:", bold: true })] }),
          new Paragraph({ spacing: { before: 15, after: 15 }, children: [new TextRun({ text: `Bắt đầu: lúc ${s(bbntData.startTime)} ${formatToWordDate(bbntData.startDate || bbntData.date)}`, italics: true })] }),
          new Paragraph({ spacing: { before: 15, after: 15 }, children: [new TextRun({ text: `Kết thúc: lúc ${s(bbntData.endTime)} ${formatToWordDate(bbntData.endDate || bbntData.date)}`, italics: true })] }),
          new Paragraph({ spacing: { before: 15, after: 20 }, children: [new TextRun({ text: `Tại công trình: ${s(bbntData.locationDetail).replace(/^Tại công trình:\s*/i, '')}`, italics: true })] }),

          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "4. Tài liệu làm căn cứ:", bold: true })] }),
          ...bbntData.grounds.filter(g => s(g).trim().length > 0).map(g => new Paragraph({ spacing: { before: 15, after: 15 }, children: processText(g) })),

          new Paragraph({ spacing: { before: 60, after: 30 }, children: [new TextRun({ text: isBM04 ? "5. Nội dung giao nhận:" : "5. Khối lượng công việc:", bold: true })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: (isBM04 
                  ? ["STT", "Tên vật tư", "ĐVT", "KL yêu cầu", "KL giao nhận", "Ghi chú"]
                  : ["Stt", "Diễn giải", "ĐVT", "SL yêu cầu", "SL nghiệm thu", "Ghi chú"]
                ).map(h => 
                  new TableCell({ children: [new Paragraph({ 
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: s(h), bold: true })]
                  })] })
                )
              }),
              ...(() => {
                const items = bbntData.items || [];
                const h = getHierarchy(bbntData.selectedUnits, items);
                const isGrouped = bbntData.isGroupedDisplay || bbntData.displayMode === "GROUPED_EQUAL";

                if (isGrouped) {
                  const groupedRows: TableRow[] = [];
                  
                  // Add 1 Group Header Row
                  groupedRows.push(
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 6, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "★", bold: true, size: 16 })] })],
                        }),
                        new TableCell({
                          width: { size: 50, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          columnSpan: 5,
                          children: [new Paragraph({ children: [new TextRun({ text: `DANH SÁCH VẬT TƯ GỘP (${bbntData.selectedUnits?.length || 0} căn): ${(bbntData.selectedUnits || []).map((u: any) => u.unitId).join(", ")}`, bold: true, size: 16 })] })],
                        }),
                      ],
                    })
                  );

                  // Add items
                  items.forEach((it, idx) => {
                    groupedRows.push(
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 6, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(idx + 1) })] })],
                          }),
                          new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(stripAppliedUnitsSuffix(it.description || "")) })],
                          }),
                          new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(it.unit || "") })] })],
                          }),
                          new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.requestedQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.acceptedQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 6, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(it.note || "") })],
                          }),
                        ],
                      })
                    );
                  });

                  return groupedRows;
                }

                if (h.list.length === 0) {
                  return items.map((it) =>
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 6, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(it.stt || "") })] })],
                        }),
                        new TableCell({
                          width: { size: 50, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ children: processText(it.description || "") })],
                        }),
                        new TableCell({
                          width: { size: 10, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(it.unit || "") })] })],
                        }),
                        new TableCell({
                          width: { size: 14, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.requestedQty || 0) })] })],
                        }),
                        new TableCell({
                          width: { size: 14, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.acceptedQty || 0) })] })],
                        }),
                        new TableCell({
                          width: { size: 6, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          children: [new Paragraph({ children: processText(it.note || "") })],
                        }),
                      ],
                    })
                  );
                }

                const renderedRows: TableRow[] = [];
                let sttCounter = 0;

                h.list.forEach((u, groupIdx) => {
                  const projId = u.projectId;
                  const unitId = u.unitId;
                  const groupItems = items.filter(
                    it => !(it as any).isProjectShared && (it.projectId || '').toLowerCase() === projId.toLowerCase() && 
                          (it.unitId || '').toLowerCase() === unitId.toLowerCase()
                  );

                  // Add group header row with light gray background
                  renderedRows.push(
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 6, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: toRoman(groupIdx), bold: true, size: 16 })] })],
                        }),
                        new TableCell({
                          width: { size: 50, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ children: [new TextRun({ text: formatUnitNameForTable(unitId), bold: true, size: 16 })] })],
                        }),
                        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                      ]
                    })
                  );

                  let groupStt = 0;
                  groupItems.forEach((it) => {
                    groupStt++;
                    renderedRows.push(
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 6, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(groupStt) })] })],
                          }),
                          new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(it.description || "") })],
                          }),
                          new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(it.unit || "") })] })],
                          }),
                          new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.requestedQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.acceptedQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 6, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(it.note || "") })],
                          }),
                        ],
                      })
                    );
                  });
                });

                const sharedItems = items.filter(it => (it as any).isProjectShared);
                if (sharedItems.length > 0) {
                  renderedRows.push(
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 6, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "★", bold: true, size: 16 })] })],
                        }),
                        new TableCell({
                          width: { size: 50, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          columnSpan: 5,
                          children: [new Paragraph({ children: [new TextRun({ text: `CHI PHÍ CHIA ĐỀU CÁC CĂN (${bbntData.selectedUnits?.length || 0} căn): ${(bbntData.selectedUnits || []).map((u: any) => u.unitId).join(", ")}`, bold: true, size: 16 })] })],
                        }),
                      ],
                    })
                  );
                  let sharedStt = 0;
                  sharedItems.forEach((it) => {
                    sharedStt++;
                    renderedRows.push(
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 6, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(sharedStt) })] })],
                          }),
                          new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(it.description || "") })],
                          }),
                          new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(it.unit || "") })] })],
                          }),
                          new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.requestedQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.acceptedQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 6, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(it.note || "") })],
                          }),
                        ],
                      })
                    );
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
                  const isShared = orphanItems.some((it: any) => it.isSharedCost);
                  const headerText = isShared && h.list.length > 0 
                    ? `CHI PHÍ CHIA ĐỀU CÁC CĂN (${h.list.length} CĂN): ${h.list.map(u => u.unitId).join(', ')}` 
                    : "VẬT TƯ KHÁC / CHƯA PHÂN LOẠI";
                  const sttText = isShared && h.list.length > 0 ? "★" : "X";

                  renderedRows.push(
                    new TableRow({
                      cantSplit: true,
                      children: [
                        new TableCell({
                          width: { size: 6, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sttText, bold: true, size: 16 })] })],
                        }),
                        new TableCell({
                          width: { size: 50, type: WidthType.PERCENTAGE },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" },
                          children: [new Paragraph({ children: [new TextRun({ text: headerText, bold: true, size: 16 })] })],
                        }),
                        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, shading: { fill: "F2F2F2" }, children: [] }),
                      ]
                    })
                  );

                  let orphanStt = 0;
                  orphanItems.forEach((it) => {
                    orphanStt++;
                    renderedRows.push(
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 6, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(orphanStt) })] })],
                          }),
                          new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(it.description || "") })],
                          }),
                          new TableCell({
                            width: { size: 10, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(it.unit || "") })] })],
                          }),
                          new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.requestedQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNumberForExport(it.acceptedQty || 0) })] })],
                          }),
                          new TableCell({
                            width: { size: 6, type: WidthType.PERCENTAGE },
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({ children: processText(it.note || "") })],
                          }),
                        ],
                      })
                    );
                  });
                }

                return renderedRows;
              })(),
            ]
          }),

          // Đánh giá
          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "6. ĐÁNH GIÁ:", bold: true })] }),
          new Paragraph({ spacing: { before: 15, after: 15 }, indent: { left: 425 }, children: [new TextRun({ text: isBM04 ? "- Về tình trạng hàng hóa/vật tư: đạt yêu cầu, đúng quy cách chủng loại." : "- Về yêu cầu chất lượng dịch vụ: đạt yêu cầu." })] }),
          new Paragraph({ spacing: { before: 15, after: 20 }, indent: { left: 425 }, children: [new TextRun({ text: "- Về ý kiến khác (nếu có): không có." })] }),

          // Kết luận
          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "7. KẾT LUẬN:", bold: true })] }),
          new Paragraph({ spacing: { before: 15, after: 0 }, indent: { left: 425 }, children: [new TextRun({ text: isBM04 ? "- Hai bên thống nhất bàn giao và tiếp nhận số lượng vật tư nêu trên." : "- Đồng ý nghiệm thu theo khối lượng như trên." })] }),

          new Paragraph({ 
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: "CHỮ KÝ CÁC BÊN", bold: true, underline: {}, size: 26 })] 
          }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(bbntData.bbnt_benA_congTy || (isBM04 ? "ĐẠI DIỆN BÊN GIAO" : "ĐẠI DIỆN BÊN A")), bold: true, size: 26 })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(bbntData.bbnt_benB_congTy || (isBM04 ? "ĐẠI DIỆN BÊN NHẬN" : "ĐẠI DIỆN BÊN B")), bold: true, size: 26 })] })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên và đóng dấu)", italics: true, size: 22 })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên và đóng dấu)", italics: true, size: 22 })], alignment: AlignmentType.CENTER })] }),
                ]
              }),
              // Space row (tăng thêm 2 dòng cho vị trí ký tên)
              new TableRow({
                height: { value: 1800, rule: HeightRule.ATLEAST },
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] })
                    ]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(bbntData.bbnt_benA_daiDien || ""), bold: true, size: 26 })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(bbntData.bbnt_benB_daiDien || ""), bold: true, size: 26 })] })] }),
                ]
              })
            ]
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const rawOriginalName = bbntData.originalFileName || (typeof window !== 'undefined' && ((window as any)._currentOriginalFileName || (window as any)._currentBM02FileName)) || '';
  const baseName = rawOriginalName ? rawOriginalName : generateCommonFileNamePart(bbntData);
  const fileName = `${baseName}_${isBM04 ? 'BM04' : 'BM03.2'}.docx`;
  saveFile(blob, fileName);
}

const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
function getRomanNumeral(idx: number): string {
  return romanNumerals[idx] || String(idx + 1);
}

export async function exportBM06ToDocx(bm06Data: any, logoUrl?: string | null) {
  const s = (val: any) => String(val || "").replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, " ").trim();
  
  // Helper to handle text with potential line breaks
  const processText = (text: string, options: any = {}) => {
    const lines = s(text).split('\n');
    return lines.map((line, i) => new TextRun({ 
      ...options,
      text: line, 
      break: i > 0 ? 1 : 0 
    }));
  };

  // Helper to process logo data if any
  let logoImageRun: ImageRun | null = null;
  if (logoUrl && logoUrl.includes("base64,")) {
    try {
      const base64Data = logoUrl.split(",")[1];
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      logoImageRun = new ImageRun({
        data: bytes,
        type: "png",
        transformation: {
          width: 80,
          height: 40,
        },
      });
    } catch (e) {
      console.error("Invalid logo base64 data for BM06", e);
    }
  }

  // Construct table columns & header
  const tableRows: TableRow[] = [];
  
  // Table Header Row
  tableRows.push(
    new TableRow({
      height: { value: 600, rule: HeightRule.ATLEAST },
      children: [
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "STT", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tên vật tư/thiết bị/dịch vụ", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Đvt", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Qui cách", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Dự toán", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Lũy kế cũ", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tồn cũ", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kỳ này", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Lũy kế mới", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tồn mới", bold: true, size: 18 })] })] }),
        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Ghi chú", bold: true, size: 18 })] })] }),
      ]
    })
  );

  // Group by selected units (Can Ho)
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
      tableRows.push(
        new TableRow({
          height: { value: 450, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(idx + 1), size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [
              new TextRun({ text: s(r.name), bold: true, size: 18 }),
              new TextRun({ text: ` (Áp dụng cho căn: ${r.appliedUnitsText})`, size: 16, italics: true, color: "555555" })
            ] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(r.unit), size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: s(r.specification), size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.estimatedQty || 0)), size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.cumulativeQtyOld || 0)), size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.remainingQtyOld || 0)), size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.orderQty || 0)), bold: true, size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.cumulativeQtyNew || 0)), size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.remainingQtyNew || 0)), size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: s(r.notes), size: 18 })] })] }),
          ]
        })
      );
    });
  } else {
    selectedUnitsList.forEach((u: any, groupIdx: number) => {
      // 1. Unmerged Section Header row: Roman numerals under name, other empty
      tableRows.push(
        new TableRow({
          height: { value: 500, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: getRomanNumeral(groupIdx), bold: true, size: 18 })] })] }),
            new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: formatUnitNameForTable(u.unitId), bold: true, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun("")] })] }),
          ]
        })
      );

      // 2. Material row entries
      const groupRows = rowsList.filter((r: any) => r.projectId === u.projectId && r.unitId === u.unitId);
      groupRows.forEach((r: any, idx: number) => {
        tableRows.push(
          new TableRow({
            height: { value: 450, rule: HeightRule.ATLEAST },
            children: [
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(idx + 1), size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: s(r.name), bold: true, size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(r.unit), size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: s(r.specification), size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.estimatedQty || 0)), size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.cumulativeQtyOld || 0)), size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.remainingQtyOld || 0)), size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.orderQty || 0)), bold: true, size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.cumulativeQtyNew || 0)), size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatNumberForExport(Number(r.remainingQtyNew || 0)), size: 18 })] })] }),
              new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: s(r.notes), size: 18 })] })] }),
            ]
          })
        );
      });
    });
  }

  const parsedDate = bm06Data.orderDate ? bm06Data.orderDate.split('-') : [];
  const dateFormatted = parsedDate.length === 3 
    ? `ngày ${parsedDate[2]} tháng ${parsedDate[1]} năm ${parsedDate[0]}` 
    : 'ngày... tháng... năm...';

  const doc = new Document({
    title: "PHIẾU ĐỀ NGHỊ BM06",
    creator: "BTI Smart Document",
    description: "Tài liệu được tạo tự động từ hệ thống BTI",
    styles: {
      default: {
        document: {
          run: {
            size: 22, // 11pt
            font: "Times New Roman",
            color: "000000",
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          // Header box (Company / Title / QTMH-BM06)
          new Table({
            width: { size: 10466, type: WidthType.DXA },
            columnWidths: [3140, 5232, 2094],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 4 },
              left: { style: BorderStyle.SINGLE, size: 4 },
              right: { style: BorderStyle.SINGLE, size: 4 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
              insideVertical: { style: BorderStyle.SINGLE, size: 4 },
            },
            rows: [
              new TableRow({
                height: { value: 1200, rule: HeightRule.ATLEAST },
                children: [
                  new TableCell({
                    width: { size: 3140, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      (logoImageRun && ((window as any)._cauHinh?.logo_position || 'left') === 'left') ? 
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [logoImageRun] }) :
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [
                            new TextRun({ text: "CÔNG TY TNHH MTV\n", bold: true, size: 16 }),
                            new TextRun({ text: "XÂY DỰNG IJC", bold: true, size: 18, underline: {} }),
                          ]
                        })
                    ]
                  }),
                  new TableCell({
                    width: { size: 5232, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          (logoImageRun && (window as any)._cauHinh?.logo_position === 'center') ? logoImageRun : new TextRun({ text: "" }),
                          (logoImageRun && (window as any)._cauHinh?.logo_position === 'center') ? new TextRun({ text: "\n", break: 1 }) : new TextRun({ text: "" }),
                          new TextRun({ text: "PHIẾU ĐỀ NGHỊ", bold: true, size: 22 }),
                          new TextRun({ text: "“V/v: Cung cấp vật tư, thiết bị, dịch vụ”", italics: true, size: 20, break: 1 }),
                        ]
                      })
                    ]
                  }),
                  new TableCell({
                    width: { size: 2094, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      (logoImageRun && (window as any)._cauHinh?.logo_position === 'right') ? 
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [logoImageRun] }) :
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [
                            new TextRun({ text: "QTMH-BM06", bold: true, size: 18 })
                          ]
                        })
                    ]
                  })
                ]
              })
            ]
          }),

          // Date Line
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `TP.HCM, ${dateFormatted}`, italics: true })
            ],
            spacing: { before: 240, after: 120 }
          }),

          // Recipients
          new Paragraph({
            children: [
              new TextRun({ text: "Kính gửi: ", bold: true }),
              new TextRun({ text: s(bm06Data.company), bold: true })
            ],
            spacing: { after: 120 }
          }),

          // Bases / Intro - Split paragraphs for correct bullet markings on new lines
          new Paragraph({
            children: [
              new TextRun({ text: "- Căn cứ Hợp đồng thi công;" })
            ],
            spacing: { after: 60 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "- Căn cứ hồ sơ thiết kế, dự toán đã được duyệt;" })
            ],
            spacing: { after: 125 }
          }),

          new Paragraph({
            children: [
              new TextRun({ text: `     Phòng Kỹ thuật kính trình ` }),
              new TextRun({ text: s(bm06Data.receiver) }),
              new TextRun({ text: ` xét duyệt cung cấp vật tư, thiết bị, dịch vụ để thi công cho công trình của hợp đồng nêu trên, chi tiết như sau:` })
            ],
            spacing: { after: 240 }
          }),

          // 1/ MỤC ĐÍCH SỬ DỤNG
          new Paragraph({
            children: [
              new TextRun({ text: "1/ MỤC ĐÍCH SỬ DỤNG:\n", bold: true, size: 22 })
            ],
            spacing: { before: 120, after: 120 }
          }),
          ...(bm06Data.purposeMode === 'RIENG' && bm06Data.unitPurposes && Object.keys(bm06Data.unitPurposes).length > 0 ? (
            [
              new Paragraph({
                children: [
                  new TextRun({ text: "     - Nội dung riêng từng căn: " })
                ],
                spacing: { after: 100 }
              }),
              ...((bm06Data as any).selectedUnits || []).map((u: any) => {
                const key = getFirebaseSafeKey(u.projectId, u.unitId);
                const val = (bm06Data.unitPurposes as any)[key] || `Cung cấp vật tư thi công cho ${u.unitId} (${u.projectId})`;
                return new Paragraph({
                  children: [
                    new TextRun({ text: `       + ${u.unitId} (${u.projectId}): ` }),
                    new TextRun({ text: val })
                  ],
                  spacing: { after: 100 }
                });
              })
            ]
          ) : (
            s(bm06Data.purpose).split('\n').map(l => l.trim()).filter(Boolean).map((line, lineIdx) => {
              return new Paragraph({
                children: [
                  new TextRun({ text: lineIdx === 0 ? "     - Nội dung: " : "     - " }),
                  new TextRun({ text: line })
                ],
                spacing: { after: 100 }
              });
            })
          )),
          ...(bm06Data.showLocation !== false ? s(bm06Data.location).split('\n').map(l => l.trim()).filter(Boolean).map((line, lineIdx) => {
            return new Paragraph({
              children: [
                new TextRun({ text: lineIdx === 0 ? "     - Địa điểm: " : "     - " }),
                new TextRun({ text: line })
              ],
              spacing: { after: 100 }
            });
          }) : []),

          // 2/ MUA VẬT TƯ, THIẾT BỊ, DỊCH VỤ
          new Paragraph({
            children: [
              new TextRun({ text: "2/ MUA VẬT TƯ, THIẾT BỊ, DỊCH VỤ:\n", bold: true, size: 22 })
            ],
            spacing: { before: 120, after: 120 }
          }),

          // Main Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 4 },
              left: { style: BorderStyle.SINGLE, size: 4 },
              right: { style: BorderStyle.SINGLE, size: 4 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
              insideVertical: { style: BorderStyle.SINGLE, size: 4 },
            },
            rows: tableRows
          }),

          // Date & Kính trình
          new Paragraph({
            children: [
              new TextRun({ text: "- Thời gian cung cấp, sử dụng: ngày ……………." })
            ],
            spacing: { before: 240, after: 120 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Kính trình./." })
            ],
            spacing: { after: 240 }
          }),

          // Signatures Section (3 column layout to match the printed template proof)
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Trưởng bộ phận", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Xác nhận của Thủ kho", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Người đề nghị", bold: true })] })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 18 })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Ký, xác nhận tồn kho)", italics: true, size: 18 })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Ký và ghi rõ họ tên)", italics: true, size: 18 })] })] }),
                ]
              }),
              // Space row (tăng thêm 2 dòng cho vị trí ký tên)
              new TableRow({
                height: { value: 1800, rule: HeightRule.ATLEAST },
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] })
                    ]
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] }),
                      new Paragraph({ children: [new TextRun("")] })
                    ]
                  })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(bm06Data.departmentHead || "").toUpperCase(), bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(bm06Data.storekeeper || "").toUpperCase(), bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s(bm06Data.proposer || "").toUpperCase(), bold: true })] })] }),
                ]
              })
            ]
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const baseName = bm06Data.originalFileName ? bm06Data.originalFileName : generateCommonFileNamePart(bm06Data);
  const fileName = `${baseName}_BM06.docx`;
  saveFile(blob, fileName);
}

function saveFile(blob: Blob, fileName: string) {
  if (typeof FileSaver.saveAs === 'function') {
    FileSaver.saveAs(blob, fileName);
  } else {
    (FileSaver as any).saveAs(blob, fileName);
  }
}



import { GoogleGenAI, Type } from "@google/genai";
import { FormData, BBNTData } from "../types";
import { isTemplateCodeOnly, isValidMaPhieu, extractMaPhieuFromFileName, formatStandardMaPhieu } from "../src/utils/extractMaPhieu";
import { cleanProposerName } from "../src/utils/proposerUtils";
import { parseVNNumber, parseSmartNumber, detectDocumentNumberConvention, normalizeMultilineContent } from "../src/lib/formatUtils";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || "";

function repairIncompleteJson(jsonStr: string, fallback: any = {}): any {
  if (!jsonStr || jsonStr.trim() === "{" || jsonStr.trim() === "[]" || jsonStr.trim() === "") {
    return fallback;
  }

  let s = jsonStr.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 1. Try direct parse
  try {
    return JSON.parse(s);
  } catch (e) {}

  // 2. Extract JSON substring if surrounded by text
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx > 0) {
    s = s.substring(startIdx);
  }

  try {
    return JSON.parse(s);
  } catch (e) {}

  // 3. If ends with unclosed quote, close it
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
    }
  }
  if (inString) s += '"';

  // 4. Progressively trim back from the end until valid JSON can be closed
  for (let trimAttempt = 0; trimAttempt < 60; trimAttempt++) {
    let testStr = s.trim().replace(/,\s*$/, "");
    
    const stack: string[] = [];
    let strMode = false;
    for (let i = 0; i < testStr.length; i++) {
      const c = testStr[i];
      if (c === '"' && (i === 0 || testStr[i - 1] !== '\\')) {
        strMode = !strMode;
        continue;
      }
      if (!strMode) {
        if (c === "{" || c === "[") stack.push(c);
        else if (c === "}" && stack[stack.length - 1] === "{") stack.pop();
        else if (c === "]" && stack[stack.length - 1] === "[") stack.pop();
      }
    }

    let candidate = testStr;
    for (let j = stack.length - 1; j >= 0; j--) {
      candidate += stack[j] === "{" ? "}" : "]";
    }

    try {
      const parsed = JSON.parse(candidate);
      return parsed;
    } catch (err) {
      const lastComma = s.lastIndexOf(",");
      if (lastComma > 0) {
        s = s.substring(0, lastComma);
      } else {
        break;
      }
    }
  }

  return fallback;
}

// Utility dùng để parse JSON an toàn, hỗ trợ cả string và object (nếu đã parse rồi)
function safeParse(data: any, fallback: any = {}) {
  if (!data) return fallback;
  if (typeof data === 'object') return data;
  try {
    return repairIncompleteJson(data, fallback);
  } catch (e) {
    console.warn("safeParse failed:", e, data);
    return fallback;
  }
}

// Client-side model cooldown tracker for quota limits (429)
const clientModelCooldowns: Record<string, number> = {};

async function callGeminiWithRetry(
  ai: GoogleGenAI,
  makeParams: (model: string) => any,
  models = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.8-flash'],
  maxRetriesPerModel = 2
) {
  let lastError: any = null;
  const now = Date.now();

  const sortedModels = [...models].sort((a, b) => {
    const coolA = clientModelCooldowns[a] && clientModelCooldowns[a] > now ? 1 : 0;
    const coolB = clientModelCooldowns[b] && clientModelCooldowns[b] > now ? 1 : 0;
    return coolA - coolB;
  });

  for (const model of sortedModels) {
    if (clientModelCooldowns[model] && clientModelCooldowns[model] > now) {
      console.warn(`[Gemini Client] Model ${model} is in cooldown. Skipping to fallback model...`);
      continue;
    }

    for (let attempt = 0; attempt <= maxRetriesPerModel; attempt++) {
      try {
        const result = await ai.models.generateContent(makeParams(model));
        delete clientModelCooldowns[model];
        return result;
      } catch (error: any) {
        lastError = error;
        const errorStr = (error?.message || '') + ' ' + JSON.stringify(error || '');
        
        const isQuota =
          error?.status === 'RESOURCE_EXHAUSTED' ||
          error?.code === 429 ||
          errorStr.includes('RESOURCE_EXHAUSTED') ||
          errorStr.includes('429') ||
          errorStr.includes('Quota exceeded') ||
          errorStr.includes('rate-limits');

        if (isQuota) {
          clientModelCooldowns[model] = Date.now() + 60000;
          console.warn(
            `[Gemini Client] Model ${model} quota exhausted (429). Switching immediately to fallback model...`
          );
          break;
        }

        const isUnavailable =
          error?.status === 'UNAVAILABLE' ||
          error?.code === 503 ||
          errorStr.includes('503') ||
          errorStr.includes('UNAVAILABLE') ||
          errorStr.includes('high demand');

        if (isUnavailable && attempt < maxRetriesPerModel) {
          const baseDelay = 1000;
          const maxDelay = 8000;
          const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt) + Math.random() * 500);
          console.warn(
            `[Gemini Client] Model ${model} transient issue (${error?.status || error?.code || 'busy'}). Retrying in ${Math.round(delay)}ms... (Attempt ${attempt + 1}/${maxRetriesPerModel + 1})`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.warn(
            `[Gemini Client] Model ${model} failed on attempt ${attempt + 1} (${error?.message || error}). Trying next candidate model if available.`
          );
          break;
        }
      }
    }
  }

  const finalErrStr = (lastError?.message || '') + ' ' + JSON.stringify(lastError || '');
  const isQuotaFinal =
    lastError?.status === 'RESOURCE_EXHAUSTED' ||
    lastError?.code === 429 ||
    finalErrStr.includes('RESOURCE_EXHAUSTED') ||
    finalErrStr.includes('429') ||
    finalErrStr.includes('Quota exceeded');

  const isUnavailableFinal =
    lastError?.status === 'UNAVAILABLE' ||
    lastError?.code === 503 ||
    finalErrStr.includes('503') ||
    finalErrStr.includes('UNAVAILABLE') ||
    finalErrStr.includes('high demand');

  if (isQuotaFinal) {
    throw new Error("Hạn mức API Gemini đã cạn kiệt (429 RESOURCE_EXHAUSTED). Vui lòng thử lại sau ít phút.");
  } else if (isUnavailableFinal) {
    throw new Error("Hệ thống AI đang quá tải (503 High Demand). Vui lòng thử lại sau ít phút hoặc thử với tệp tài liệu khác.");
  } else {
    throw new Error(lastError?.message || "Lỗi xử lý AI không xác định.");
  }
}

export interface ExtractionResult {
  bm02: FormData;
  bbnt: BBNTData;
}

function calculateNextDay(dateStr: string): string {
  try {
    // Regex bắt chuỗi định dạng: ngày dd tháng mm năm yyyy
    const match = dateStr.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // Tháng trong JS bắt đầu từ 0
      const year = parseInt(match[3], 10);
      
      const date = new Date(year, month, day);
      // Cộng thêm 1 ngày
      date.setDate(date.getDate() + 1);
      
      const newDay = date.getDate().toString().padStart(2, '0');
      const newMonth = (date.getMonth() + 1).toString().padStart(2, '0');
      const newYear = date.getFullYear();
      
      return `ngày ${newDay} tháng ${newMonth} năm ${newYear}`;
    }
  } catch (e) {
    console.warn("Không thể tính toán ngày tiếp theo từ:", dateStr);
  }
  // Trả về chuỗi gốc nếu không parse được
  return dateStr;
}

export async function extractDataFromFile(fileBase64: string, mimeType: string): Promise<ExtractionResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || GEMINI_API_KEY });
  
  const prompt = `Bạn là một chuyên gia trích xuất dữ liệu hành chính từ tài liệu xây dựng Việt Nam.
  Tài liệu đính kèm có thể là tệp PDF văn bản gốc hoặc tệp PDF quét (scanned) từ bản in giấy.
  
  CHIẾN LƯỢC XỬ LÝ:
  1. Nếu là PDF văn bản gốc: Trích xuất trực tiếp các trường dữ liệu từ lớp văn bản.
  2. Nếu là PDF quét (scanned): Thực hiện OCR (nhận diện ký tự quang học) để đọc nội dung. Chú ý các chữ viết tay, con dấu hoặc chữ ký có thể che khuất thông tin.
  3. Xử lý cấu trúc đa dạng: Dữ liệu có thể nằm trong bảng, danh sách hoặc đoạn văn. Hãy tìm kiếm các từ khóa liên quan (ví dụ: "Tờ trình", "Báo giá", "Khối lượng", "Đơn giá") để định vị thông tin.
  
  Hãy phân tích kỹ tệp tin đính kèm và thực hiện trích xuất dữ liệu cho HAI biểu mẫu:

  1. BIỂU MẪU BM02 (TỜ TRÌNH PHÊ DUYỆT KINH PHÍ):
     - maPhieu: Tìm MÃ PHIẾU / SỐ CHỨNG TỪ DUY NHẤT. Dãy mã phiếu đầy đủ chuẩn công ty có dạng: "XDIJC-QTMH-BM01-XXXXXXXX" (ví dụ: "XDIJC-QTMH-BM01-26090074"). Nếu trong tài liệu hoặc tên file chỉ ghi số hiệu 8 chữ số như "26090074", hãy chuẩn hóa thành "XDIJC-QTMH-BM01-26090074". Tuyệt đối không trích xuất mã biểu mẫu chung như "QTMH-BM06", "QTMH-BM02". Nếu không có số cụ thể thì để chuỗi rỗng "".
     - Title: Trích xuất ĐẦY ĐỦ VÀ CHÍNH XÁC NỘI DUNG CÔNG VIỆC CỤ THỂ từ file upload (ví dụ: "Thi công cọc ép", "Thi công xây tường tầng 1 căn 42", "Thi công dầm sàn cột tầng 1").
       YÊU CẦU CỰC KỲ QUAN TRỌNG VỀ XUỐNG DÒNG:
       1. Phần NỘI DUNG phải tự động xuống dòng (\n), hiển thị thành nhiều dòng như nội dung trong file gốc, TUYỆT ĐỐI KHÔNG dồn toàn bộ nội dung trên một dòng.
       2. Giữ nguyên toàn bộ các dấu câu (dấu gạch đầu dòng -, •, dấu hai chấm :, chấm phẩy ;, phẩy ,, ngoặc...), khoảng trắng cần thiết, thứ tự nội dung và các đoạn xuống dòng (\n) có sẵn trong file gốc.
       3. TUYỆT ĐỐI KHÔNG ĐƯỢC CHỨA thông tin địa chỉ, địa điểm chi tiết, ô số, lô số, phường, quận, thành phố ở phía sau.
       4. KHÔNG bao gồm các cụm từ hành chính như "V/v", "Phê duyệt", "Tờ trình", "Cung cấp vật tư", "Kính gửi", "Nội dung:" ở đầu câu.
     - ProposingCompany: Trích xuất tên công ty gửi đề nghị (Ví dụ: TIẾN ĐOÀN).
     - Date: Trả về định dạng "ngày [dd] tháng [mm] năm [yyyy]". Nếu chỉ thấy tháng/năm, hãy để ngày là "..." (Ví dụ: ngày ... tháng 11 năm 2025).
     - Location: "Tp. Hồ Chí Minh".
     - mucDichSuDungDiaDiem: Trích xuất ĐẦY ĐỦ VÀ CHÍNH XÁC nội dung ĐỊA ĐIỂM từ mục 'Mục đích sử dụng -> Địa điểm' của file upload (ví dụ: "Căn 86 Lô N7 – N8 thuộc dự án Khu nhà ở độc lập biệt thự Sunflower Phường Bình Dương, TP. Hồ Chí Minh" hoặc các cấu trúc như "ô..., căn..., lô...., khu...., phường...., Tp. Hồ Chí Minh" từ tài liệu). Đảm bảo không rút gọn, cắt bớt hay làm mất bất kỳ chi tiết ô số, căn số, lô số, tên dự án, phường, quận, Tp. nào.
     - Grounds:
        1. "Căn cứ Phiếu đề nghị về việc cung cấp vật tư của Công ty [Tên Công ty]"
        2. "Căn cứ Báo giá của Công ty CP KD và PT Bình Dương - Xí Nghiệp Bê Tông Trộn Sẵn Mỹ Phước"
     - Items: Danh sách vật tư/thiết bị/dịch vụ. Với mỗi hàng cần trích xuất:
         + Tên vật tư/thiết bị/dịch vụ (name, chuỗi)
         + Đvt (unit, chuỗi)
         + Tổng khối lượng/ số lượng... theo dự toán/kế hoạch (duToanQty, số)
         + Lũy kế các kỳ trước (luyKeQty, số)
         + Khối lượng/ số lượng... cần cung cấp kỳ này (quantity, số)
         + Đơn giá kỳ này (unitPrice, số)
         + Ghi chú (note, chuỗi)
     - SoTienBangChu: Trích xuất chính xác chuỗi chữ đọc số tiền trong dòng "Số tiền bằng chữ" của biểu mẫu gốc (Ví dụ: "Mười triệu không trăm chín mươi nghìn ba trăm đồng").
     - ThoiHanThanhToan: Trích xuất thông tin điều khoản/thời hạn thanh toán nếu có (Ví dụ: "Thanh toán trực tiếp kỳ này..." hoặc mô tả chính xác nội dung đó).
     - nguoiDeNghi: Trích xuất họ và tên người ký ở ô "Người đề nghị" (cuối phiếu đề nghị BM06 hoặc tờ trình, ví dụ: "Đỗ Thế Viễn").
     - truongBoPhan: Họ tên người ở ô "Trưởng bộ phận" nếu có.
     - thuKho: Họ tên người ở ô "Xác nhận của Thủ kho" (ví dụ: "Đỗ Huỳnh Linh Khoa").

  2. BIỂU MẪU BM03.2 (BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO):
     - Date: Trích xuất ngày văn bản nếu có, định dạng "ngày [dd] tháng [mm] năm [yyyy]".
     - Location: "Tp. Hồ Chí Minh".
     - doiTuong: Phải tách bạch rõ ràng 3 thông tin sau (KHÔNG ĐƯỢC BỎ TRỐNG):
        + congTrinh: Tên dự án hoặc tên công trình xây dựng (ví dụ: Khu nhà ở Sunflower).
        + hangMuc: Nội dung công việc cụ thể, chỉ lấy phần công tác xây dựng/thi công, tuyệt đối KHÔNG chứa thông tin địa điểm chi tiết. BẮT BUỘC TRÍCH XUẤT NGUYÊN VĂN (chính xác từng chữ) phần "Nội dung" trong tài liệu, tự động xuống dòng (\n) thành nhiều dòng như trong file gốc, giữ nguyên các dấu gạch đầu dòng (-), dấu chấm phẩy, khoảng trắng và các dấu xuống dòng (\n). TUYỆT ĐỐI KHÔNG dồn toàn bộ nội dung trên một dòng. LƯU Ý QUAN TRỌNG: TUYỆT ĐỐI KHÔNG BẮT ĐẦU BẰNG CỤM TỪ "Nội dung:" hoặc "- Nội dung:" (nếu tài liệu gốc có ghi chữ Nội dung ở đầu phần nội dung thì phải cắt bỏ cụm từ đó đi, chỉ lấy phần văn bản phía sau nó).
        + diaDiem: Địa chỉ cụ thể nơi thực hiện công trình từ file upload, bao gồm chi tiết ô số, căn số, lô số, phường, quận, thành phố (ví dụ: "Căn 86 Lô N7 – N8 thuộc dự án Khu nhà ở độc lập biệt thự Sunflower Phường Bình Dương, TP. Hồ Chí Minh" hoặc "Ô 42, thuộc Lô N6, Khu liên hợp Công nghiệp - Dịch vụ Đô thị Bình Dương, P. Bình Dương, TP. Hồ Chí Minh"). Hãy đảm bảo giữ nguyên toàn bộ các chi tiết địa chỉ này không được lược bớt bất kỳ từ ngữ nào.
     - Bên Giao: Mặc định là "Công ty CP KD và PT Bình Dương - Xí Nghiệp Bê Tông Trộn Sẵn Mỹ Phước". 
     - Người đại diện Bên Giao: Nếu không thấy trong tài liệu, hãy để là "Trần Thành Tài", chức vụ "Giám đốc chi nhánh".
     - Bên Nhận: "Công ty TNHH MTV Xây Dựng IJC".
     - Thành phần Bên Nhận: Cố định danh sách gồm: Đỗ Thế Viễn (Phó phòng KT), Lê Minh Chánh (NV), Trần Nam Anh (NV).
     - Thời gian (Mặc định): Bắt đầu lúc: 15h. Kết thúc lúc: 16h.
     - Tài liệu làm căn cứ (Cố định): 
        1. "Hợp đồng nguyên tắc số 02BTI/HĐNT2025 ký ngày 02/01/2026 và các phụ lục kèm theo;"
        2. "Tờ trình phê duyệt dự trù kinh phí mua vật tư XDIJC-QTMH-BM01-25090014;"
        3. "Biên bản giao nhận hàng;"
     - Items: Bảng khối lượng (Diễn giải, ĐVT, SL yêu cầu, SL nghiệm thu).

  Yêu cầu định dạng ngày tháng: Mọi ngày tháng trích xuất được phải chuyển thành định dạng "ngày [dd] tháng [mm] năm [yyyy]". Ví dụ: 26/11/2025 -> "ngày 26 tháng 11 năm 2025".
  Trả về JSON theo cấu trúc quy định.`;

  const response = await callGeminiWithRetry(ai, (model) => ({
    model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  }));

  const text = typeof (response as any).text === 'function' ? (response as any).text() : (response as any).text;
  const rawData = safeParse(text, {}) || {};
  const rawBM02 = rawData?.bm02 || {};
  const rawBBNT = rawData?.bbnt || {};

  const proposingCo = rawBM02?.proposingCompany || '...';
  
  // Xử lý logic ngày tháng: BBNT = BM02 + 1 ngày
  const bm02Date = rawBM02?.date || 'ngày ... tháng ... năm 2025';
  const bbntDate = calculateNextDay(bm02Date);

  // Xử lý tiêu đề BM02
  let extractedContent = normalizeMultilineContent(rawBM02?.title || '');
  // Làm sạch chuỗi nếu AI lỡ đưa cả tiền tố vào (phòng hờ)
  // Xóa các tiền tố hành chính phổ biến
  extractedContent = extractedContent.replace(/^(V\/v|Phê duyệt|Tờ trình|Cung cấp vật tư|Dự trù kinh phí).*?[:]\s*/i, "").trim();
  // Xóa cụm "Cung cấp vật tư" nếu nó vẫn còn ở đầu (trường hợp không có dấu hai chấm)
  extractedContent = extractedContent.replace(/^Cung cấp vật tư\s*(bê tông)?\s*(cho việc)?\s*/i, "").trim();
  // Xóa dấu chấm cuối câu nếu có
  extractedContent = extractedContent.replace(/\.+$/, "");
  
  // Trả về phần nội dung đã trích xuất (không kèm tiền tố)
  let finalTitle = normalizeMultilineContent(extractedContent || '');

  const defaultConcreteCompany = "Công ty CP KD và PT Bình Dương - Xí Nghiệp Bê Tông Trộn Sẵn Mỹ Phước";

  const bm02Items = (rawBM02?.items || []).map((it: any, idx: number) => {
    const q = parseVNNumber(it.quantity, 0);
    const p = parseVNNumber(it.unitPrice, 0);
    const tot = (it.total !== undefined && it.total !== null && !isNaN(Number(it.total)) && Number(it.total) > 0)
      ? parseVNNumber(it.total, Math.round(q * p * 100) / 100)
      : (Math.round(q * p * 100) / 100);
    const duToan = it.duToanQty !== undefined && it.duToanQty !== null ? parseVNNumber(it.duToanQty, q) : q;
    const luyKe = it.luyKeQty !== undefined && it.luyKeQty !== null ? parseVNNumber(it.luyKeQty, 0) : 0;
    return {
      id: Math.random().toString(36).substr(2, 9),
      stt: idx + 1,
      name: it.name || '',
      unit: it.unit || 'm3',
      quantity: q,
      unitPrice: p,
      total: tot,
      note: it.note || '',
      duToanQty: duToan,
      luyKeQty: luyKe
    };
  });

  const bm02: FormData = {
    docNumber: 'QTMH-BM02',
    title: finalTitle,
    date: bm02Date,
    location: rawBM02?.location || 'Tp. Hồ Chí Minh',
    recipients: ['Hội Đồng Thành Viên', 'BGĐ Công ty TNHH MTV Xây Dựng IJC'],
    grounds: rawBM02?.grounds && rawBM02.grounds.length > 0 ? rawBM02.grounds : [
      `Căn cứ Phiếu đề nghị về việc cung cấp vật tư của Công ty ${proposingCo}`,
      `Căn cứ Báo giá của ${defaultConcreteCompany}`
    ],
    items: bm02Items,
    totalAmount: bm02Items.reduce((s: number, it: any) => s + it.total, 0),
    proposingCompany: proposingCo,
    soTienBangChu: rawBM02?.soTienBangChu || '',
    thoiHanThanhToan: rawBM02?.thoiHanThanhToan || '',
    mucDichSuDungDiaDiem: rawBM02?.mucDichSuDungDiaDiem || rawBBNT?.doiTuong?.diaDiem || ''
  };

  // Xử lý Hạng mục BBNT
  const doiTuong = rawBBNT?.doiTuong || {};
  
  // Hạng mục: Ưu tiên từ doiTuong.hangMuc, nếu không có lấy từ bm02.title
  let extractedCategory = doiTuong.hangMuc || '';
  if (!extractedCategory && rawBM02?.title) {
    extractedCategory = rawBM02.title;
  }
  
  const cleanText = (text: string) => {
    if (!text) return '';
    return text
      .replace(/^(V\/v|Phê duyệt|Tờ trình|Cung cấp vật tư|Dự trù kinh phí|Công trình|Hạng mục|Địa điểm).*?[:]\s*/i, "")
      .replace(/^Cung cấp vật tư\s*(bê tông)?\s*(cho việc)?\s*/i, "")
      .replace(/\.+$/, "")
      .trim();
  };

  let finalProject = cleanText(doiTuong.congTrinh || '');
  let finalCategory = normalizeMultilineContent(extractedCategory || '');
  let finalAddress = cleanText(doiTuong.diaDiem || rawBM02?.mucDichSuDungDiaDiem || '');

  // Smart splitting logic to ensure separation and non-empty values (chỉ áp dụng nếu chuỗi đơn dòng)
  if (!finalCategory.includes('\n')) {
    finalCategory = cleanText(finalCategory);
    // 1. Split Category if it contains Project info ("thuộc dự án" or "dự án")
    if (finalCategory.toLowerCase().includes('thuộc dự án')) {
      const parts = finalCategory.split(/thuộc dự án/i);
      finalCategory = parts[0].trim();
      if (!finalProject) finalProject = parts[1].trim();
    } else if (finalCategory.toLowerCase().includes('dự án')) {
      const parts = finalCategory.split(/dự án/i);
      if (parts[0].trim().length > 5) {
        finalCategory = parts[0].trim();
        if (!finalProject) finalProject = parts[1].trim();
      }
    }

    // 2. Split Category if it contains Address info ("tại")
    if (finalCategory.toLowerCase().includes('tại')) {
      const parts = finalCategory.split(/tại/i);
      if (parts[0].trim().length > 5) {
        finalCategory = parts[0].trim();
        if (!finalAddress) finalAddress = parts[1].trim();
      }
    }
  }

  // 3. Split Project if it contains Address info ("tại")
  if (finalProject.toLowerCase().includes('tại')) {
    const parts = finalProject.split(/tại/i);
    if (parts[0].trim().length > 5) {
      finalProject = parts[0].trim();
      if (!finalAddress) finalAddress = parts[1].trim();
    }
  }

  // 4. Ensure non-empty values and smart redistribution
  if (!finalProject && finalCategory) {
    // Try to find project in category
    const projectKeywords = ['khu nhà ở', 'dự án', 'biệt thự', 'chung cư'];
    for (const kw of projectKeywords) {
      if (finalCategory.toLowerCase().includes(kw)) {
        const idx = finalCategory.toLowerCase().indexOf(kw);
        finalProject = finalCategory.substring(idx).trim();
        break;
      }
    }
  }

  if (!finalAddress) {
    // Construct address from bm02 or project + location
    finalAddress = rawBM02?.mucDichSuDungDiaDiem || `${finalProject ? finalProject + ' ' : ''}${rawBBNT?.location || 'Tp. Hồ Chí Minh'}`;
  }

  // 5. Clean up trailing commas/dashes/dots
  const finalCleanup = (text: string) => {
    return text.replace(/[,-\s\.]+$/, "").trim();
  };

  finalCategory = finalCleanup(finalCategory);
  finalProject = finalCleanup(finalProject);
  finalAddress = finalCleanup(finalAddress);

  // Safeguard: If finalTitle or finalCategory contains the address, remove it!
  const cleanPrepositions = (text) => {
    return text.replace(/\s+(tai|tại|ở|vị trí|địa điểm|bàn giao)\s*$/i, "").replace(/[,-\s\.]+$/, "").trim();
  };

  if (finalAddress) {
    const addrLower = finalAddress.toLowerCase();
    if (finalTitle.toLowerCase().includes(addrLower)) {
      const idx = finalTitle.toLowerCase().indexOf(addrLower);
      finalTitle = finalTitle.substring(0, idx).trim();
      finalTitle = cleanPrepositions(finalTitle);
    }
    if (finalCategory.toLowerCase().includes(addrLower)) {
      const idx = finalCategory.toLowerCase().indexOf(addrLower);
      finalCategory = finalCategory.substring(0, idx).trim();
      finalCategory = cleanPrepositions(finalCategory);
    }
  }

  if (!finalTitle && finalCategory) {
    finalTitle = finalCategory;
  }
  if (!finalCategory && finalTitle) {
    finalCategory = finalTitle;
  }

  finalTitle = finalCleanup(finalTitle);
  finalCategory = finalCleanup(finalCategory);

  const bbnt: BBNTData = {
    docNumber: 'QTMH-BM03.2',
    location: rawData.bbnt?.location || 'Tp. Hồ Chí Minh',
    date: bbntDate,
    project: finalProject,
    category: finalCategory,
    address: finalAddress,
    senderCompany: 'Công ty CP KD và PT Bình Dương - Xí Nghiệp Bê Tông Trộn Sẵn Mỹ Phước',
    senderList: [
      { name: 'Trần Thành Tài', position: 'Giám đốc chi nhánh', salutation: 'Ông' }
    ],
    receiverCompany: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    receiverList: [
      { name: 'Nguyễn Xuân Nam', position: 'Giám đốc', salutation: 'Ông' },
      { name: 'Nguyễn Thị Thêm', position: 'Kế toán trưởng', salutation: 'Bà' },
      { name: 'Trần Kim Nguyện', position: 'Chỉ huy trưởng', salutation: 'Ông' },
      { name: 'Đỗ Huỳnh Linh Khoa', position: 'Thủ kho', salutation: 'Ông' },
      { name: 'Trần Nam Anh', position: 'NV Thu mua', salutation: 'Ông' }
    ],
    startTime: rawData.bbnt?.startTime || '15h',
    startDate: bbntDate,
    endTime: rawData.bbnt?.endTime || '16h',
    endDate: bbntDate,
    locationDetail: 'Tại: Công trình',
    grounds: [
      "Hợp đồng nguyên tắc số 02BTI/HĐNT2025 ký ngày 02/01/2026 và các phụ lục kèm theo;",
      "Tờ trình phê duyệt dự trù kinh phí mua vật tư XDIJC-QTMH-BM01-25090014;",
      "Biên bản giao nhận hàng;"
    ],
    items: bm02Items.map((it: any) => ({
      id: it.id,
      stt: it.stt,
      description: it.name,
      unit: it.unit,
      requestedQty: it.quantity,
      acceptedQty: it.quantity,
      note: it.note
    }))
  };

  return { bm02, bbnt };
}

export async function extractMaterialPrice(fileBase64: string, mimeType: string): Promise<{ danhSach: { tenVatTu: string; donVi: string; giaGoc: number }[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || GEMINI_API_KEY });
  const prompt = `Đây là file PDF chứa bảng giá vật tư xây dựng. Tài liệu có thể là văn bản gốc hoặc bản quét (scanned).
  
  CHIẾN LƯỢC XỬ LÝ:
  1. Nếu là văn bản gốc: Trích xuất trực tiếp từ các bảng hoặc danh sách.
  2. Nếu là bản quét: Thực hiện OCR để nhận diện văn bản. Chú ý các bảng giá có thể có nhiều trang hoặc cột phức tạp.
  3. PDF có thể ở 3 dạng:
     - Dạng bảng: có cột STT, tên vật tư, đơn vị, đơn giá
     - Dạng danh sách: tên vật tư và giá liệt kê theo dòng
     - Dạng văn bản: mô tả giá vật tư trong đoạn văn
  
  Hãy phân tích và trích xuất toàn bộ thông tin ra JSON:
  { "danhSach": [ { "tenVatTu": "...", "donVi": "...", "giaGoc": 0 } ] }
  Nếu không có đơn vị thì donVi = "". Giá là số nguyên (bỏ dấu chấm/phẩy).
  Trả về JSON thuần túy, không giải thích thêm.`;

  const response = await callGeminiWithRetry(ai, (model) => ({
    model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  }));

  const text = typeof (response as any).text === 'function' ? (response as any).text() : (response as any).text;
  return safeParse(text);
}

export async function extractPriceUpdate(fileBase64: string, mimeType: string, currentPrices: any[]): Promise<{ danhSachGia: { tenVatTu: string; giaCu: number; giaMoi: number; phanTramThay: number; ghiChu: string }[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || GEMINI_API_KEY });
  const prompt = `Đây là file PDF cập nhật giá vật tư. Tài liệu có thể là văn bản gốc hoặc bản quét (scanned).
  
  CHIẾN LƯỢC XỬ LÝ:
  1. Nếu là văn bản gốc: Trích xuất các thay đổi giá từ văn bản.
  2. Nếu là bản quét: Thực hiện OCR để nhận diện các con số và tên vật tư.
  3. Có thể ở 3 dạng:
     - Bảng giá mới hoàn chỉnh
     - Danh sách vật tư tăng/giảm giá
     - Văn bản thông báo điều chỉnh giá (cần tự tính từ % tăng hoặc số tiền tăng)
  
  Danh sách giá hiện tại: ${JSON.stringify(currentPrices)}
  Trích xuất và tính ra giá MỚI theo JSON:
  { "danhSachGia": [ { "tenVatTu":"...", "giaCu":0, "giaMoi":0, "phanTramThay":0, "ghiChu":"..." } ] }
  Trả về JSON thuần túy.`;

  const response = await callGeminiWithRetry(ai, (model) => ({
    model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  }));

  const text = typeof (response as any).text === 'function' ? (response as any).text() : (response as any).text;
  return safeParse(text);
}

export interface OcrItem {
  id: string;
  stt: number;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  note: string;
  duToanQty?: number;
  luyKeQty?: number;
  needsCheck?: boolean;
  checkReason?: string;
  rawQuantity?: string;
  rawUnitPrice?: string;
  rawTotal?: string;
}

export interface OcrPreviewData {
  fileName: string;
  fileType: string;
  maPhieu?: string;
  congTrinh: string;
  hangMuc: string;
  nhaCungCap: string;
  ngayBaoGia: string;
  diaDiem: string;
  proposingCompany: string;
  soTienBangChu: string;
  thoiHanThanhToan: string;
  nguoiDeNghi?: string;
  truongBoPhan?: string;
  thuKho?: string;
  documentNumberFormat?: string;
  items: OcrItem[];
  hasUncertainties?: boolean;
  summaryNotes?: string;
}

export async function extractBm02Ocr(fileBase64: string, mimeType: string, fileName: string): Promise<OcrPreviewData> {
  let rawData: any = null;

  try {
    const res = await fetch('/api/gemini/extract-bm02', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileData: fileBase64, mimeType, fileName })
    });
    if (res.ok) {
      const body = await res.json();
      if (body.success && body.data) {
        rawData = body.data;
      }
    }
  } catch (e) {
    console.warn('Server OCR endpoint call failed, falling back to client extraction:', e);
  }

  // Fallback if server call returned null
  if (!rawData) {
    const result = await extractDataFromFile(fileBase64, mimeType);
    const rBM02 = result?.bm02 || ({} as any);
    const rBBNT = result?.bbnt || ({} as any);
    rawData = {
      maPhieu: (rBM02 as any).maPhieu || '',
      congTrinh: (rBBNT as any)?.doiTuong?.congTrinh || '',
      hangMuc: rBM02.title || rBBNT.category || '',
      nhaCungCap: rBM02.proposingCompany || '',
      proposingCompany: rBM02.proposingCompany || '',
      ngayBaoGia: rBM02.date || '',
      diaDiem: rBM02.mucDichSuDungDiaDiem || rBBNT.address || '',
      soTienBangChu: rBM02.soTienBangChu || '',
      thoiHanThanhToan: rBM02.thoiHanThanhToan || '',
      nguoiDeNghi: (rBM02 as any).nguoiDeNghi || (rawData as any)?.nguoiDeNghi || '',
      truongBoPhan: (rBM02 as any).truongBoPhan || (rawData as any)?.truongBoPhan || '',
      thuKho: (rBM02 as any).thuKho || (rawData as any)?.thuKho || '',
      items: (rBM02.items || []).map((it: any, idx: number) => ({
        stt: idx + 1,
        name: it.name || '',
        unit: it.unit || 'm3',
        rawQuantity: it.rawQuantity || String(it.quantity || ''),
        rawUnitPrice: it.rawUnitPrice || String(it.unitPrice || ''),
        rawTotal: it.rawTotal || String(it.total || ''),
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        total: (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
        note: it.note || '',
        needsCheck: !it.unitPrice || Number(it.unitPrice) <= 0 || !it.quantity || Number(it.quantity) <= 0
      }))
    };
  }
  if (rawData.hangMuc) {
    rawData.hangMuc = normalizeMultilineContent(rawData.hangMuc);
  }

  const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
  const rawItems = rawData.items || [];

  const docSamples: (string | number)[] = [];
  rawItems.forEach((it: any) => {
    if (it.rawQuantity) docSamples.push(String(it.rawQuantity));
    if (it.rawUnitPrice) docSamples.push(String(it.rawUnitPrice));
    if (it.rawTotal) docSamples.push(String(it.rawTotal));
    if (it.quantity) docSamples.push(String(it.quantity));
    if (it.unitPrice) docSamples.push(String(it.unitPrice));
    if (it.total) docSamples.push(String(it.total));
  });
  const docConvention = rawData.documentNumberFormat || detectDocumentNumberConvention(docSamples);
  
  const items: OcrItem[] = rawItems.map((it: any, idx: number) => {
    const rawQ = it.rawQuantity !== undefined && it.rawQuantity !== null ? String(it.rawQuantity).trim() : (it.quantity !== undefined ? String(it.quantity) : '');
    const rawP = it.rawUnitPrice !== undefined && it.rawUnitPrice !== null ? String(it.rawUnitPrice).trim() : (it.unitPrice !== undefined ? String(it.unitPrice) : '');
    const rawT = it.rawTotal !== undefined && it.rawTotal !== null ? String(it.rawTotal).trim() : (it.total !== undefined ? String(it.total) : '');
    const unit = String(it.unit || 'm3').trim();

    const pRes = parseSmartNumber(it.unitPrice, {
      rawStr: rawP || undefined,
      unit,
      convention: docConvention,
      fieldRole: 'unitPrice',
      documentSamples: docSamples
    });

    const tRes = parseSmartNumber(it.total, {
      rawStr: rawT || undefined,
      unit,
      convention: docConvention,
      fieldRole: 'total',
      documentSamples: docSamples
    });

    const qRes = parseSmartNumber(it.quantity, {
      rawStr: rawQ || undefined,
      unit,
      unitPrice: pRes.value,
      total: tRes.value,
      convention: docConvention,
      fieldRole: 'quantity',
      documentSamples: docSamples
    });

    const q = qRes.value;
    const p = pRes.value;
    let tot = tRes.value;
    if (tot <= 0 && q > 0 && p > 0) {
      tot = Math.round(q * p * 100) / 100;
    }

    const nameMissing = !it.name || !it.name.trim();
    const unitMissing = !it.unit || !it.unit.trim();
    const priceZero = p <= 0;
    const qtyZero = q <= 0;

    let needsCheck = Boolean(it.needsCheck) || qRes.isAmbiguous || pRes.isAmbiguous || nameMissing || unitMissing || priceZero || qtyZero;
    let reasons: string[] = [];
    if (it.checkReason) reasons.push(it.checkReason);
    if (qRes.isAmbiguous && qRes.explanation) reasons.push(qRes.explanation);
    if (pRes.isAmbiguous && pRes.explanation) reasons.push(pRes.explanation);
    if (nameMissing) reasons.push('Thiếu tên vật tư');
    if (unitMissing) reasons.push('Thiếu ĐVT');
    if (qtyZero) reasons.push('Số lượng bằng 0');
    if (priceZero) reasons.push('Chưa có đơn giá');

    const duToan = it.duToanQty !== undefined && it.duToanQty !== null
      ? parseVNNumber(it.duToanQty, q, { unit, convention: docConvention })
      : q;
    const luyKe = it.luyKeQty !== undefined && it.luyKeQty !== null
      ? parseVNNumber(it.luyKeQty, 0, { unit, convention: docConvention })
      : 0;

    return {
      id: it.id || `ocr-item-${idx}-${Date.now()}`,
      stt: Number(it.stt) || idx + 1,
      name: it.name || '',
      unit: unit,
      rawQuantity: rawQ || undefined,
      rawUnitPrice: rawP || undefined,
      rawTotal: rawT || undefined,
      quantity: q,
      unitPrice: p,
      total: tot,
      note: it.note || '',
      duToanQty: duToan,
      luyKeQty: luyKe,
      needsCheck,
      checkReason: Array.from(new Set(reasons)).join('; ') || undefined
    };
  });

  const hasUncertainties = Boolean(rawData.hasUncertainties) || items.some(it => it.needsCheck);

  let finalMaPhieu = '';
  if (fileName) {
    finalMaPhieu = extractMaPhieuFromFileName(fileName);
  }
  if ((!finalMaPhieu || isTemplateCodeOnly(finalMaPhieu)) && rawData.maPhieu) {
    finalMaPhieu = formatStandardMaPhieu(String(rawData.maPhieu).trim());
  }
  if (!finalMaPhieu) {
    finalMaPhieu = 'XDIJC-QTMH-BM01-';
  }

  return {
    fileName,
    fileType: ext,
    maPhieu: finalMaPhieu,
    congTrinh: rawData.congTrinh || '',
    hangMuc: rawData.hangMuc || '',
    nhaCungCap: rawData.nhaCungCap || rawData.proposingCompany || '',
    ngayBaoGia: rawData.ngayBaoGia || rawData.date || 'ngày ... tháng ... năm 2025',
    diaDiem: rawData.diaDiem || 'Tp. Hồ Chí Minh',
    proposingCompany: rawData.proposingCompany || rawData.nhaCungCap || '',
    soTienBangChu: rawData.soTienBangChu || '',
    thoiHanThanhToan: rawData.thoiHanThanhToan || '',
    nguoiDeNghi: cleanProposerName(rawData.nguoiDeNghi || rawData.proposer || rawData.nguoiLap || ''),
    truongBoPhan: rawData.truongBoPhan || rawData.departmentHead || '',
    thuKho: rawData.thuKho || rawData.storekeeper || '',
    items,
    hasUncertainties,
    summaryNotes: rawData.summaryNotes || ''
  };
}


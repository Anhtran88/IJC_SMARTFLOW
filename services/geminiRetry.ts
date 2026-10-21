export const DEFAULT_GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

export class DocumentExtractionError extends Error {
  constructor(message: string, public status = 503) {
    super(message);
  }
}

export function geminiStatus(error: any): number {
  const text = `${error?.status || ''} ${error?.message || ''}`;
  const code = Number(error?.status) || Number(error?.code);
  if (code) return code;
  if (/RESOURCE_EXHAUSTED|\b429\b/i.test(text)) return 429;
  if (/UNAVAILABLE|high demand|overloaded|\b503\b/i.test(text)) return 503;
  if (/NOT_FOUND|\b404\b/i.test(text)) return 404;
  return 500;
}

// Try another model before waiting; retry only transient failures, with a bounded budget.
export function createGeminiRunner(options: {
  models?: string[];
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
} = {}) {
  const models = [...new Set((options.models || DEFAULT_GEMINI_MODELS).map(m => m.trim()).filter(Boolean))];
  const cooldowns = new Map<string, number>();
  const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  return async function run<T>(generate: (model: string) => Promise<T>): Promise<T> {
    const unavailable = new Set<string>();
    let lastStatus = 503;
    for (let round = 0; round < 3; round++) {
      let transient = false;
      for (const model of models) {
        if (unavailable.has(model) || (cooldowns.get(model) || 0) > now()) continue;
        try {
          return await generate(model);
        } catch (error) {
          const status = geminiStatus(error);
          lastStatus = status;
          if (status === 401 || status === 403) {
            throw new DocumentExtractionError('API Key AI không hợp lệ hoặc không có quyền truy cập. Vui lòng kiểm tra cấu hình server.', 502);
          }
          if (status === 429) {
            cooldowns.set(model, now() + 60000);
          } else if (status === 404) {
            unavailable.add(model);
          } else if ([500, 502, 503, 504, 408].includes(status)) {
            transient = true;
          } else {
            throw new DocumentExtractionError('AI không thể xử lý tệp này. Vui lòng kiểm tra định dạng và nội dung tệp.', 422);
          }
        }
      }
      if (!transient || round === 2) break;
      await wait(2000 * 2 ** round + Math.floor(random() * 500));
    }
    if (lastStatus === 404) throw new DocumentExtractionError('Không tìm thấy model AI đã cấu hình. Vui lòng kiểm tra GEMINI_MODELS trên server.', 502);
    if (lastStatus === 429 || models.every(m => (cooldowns.get(m) || 0) > now())) {
      throw new DocumentExtractionError('Bạn đã vượt hạn mức AI (429). Vui lòng thử lại sau khoảng một phút.', 429);
    }
    throw new DocumentExtractionError('Dịch vụ AI đang quá tải hoặc tạm thời không khả dụng (503). Vui lòng thử lại sau ít giây.', 503);
  };
}

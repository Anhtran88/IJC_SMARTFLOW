const mimeTypes: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};

export async function requestBm02Extraction(fileData: string, mimeType: string, fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (extension === 'doc') throw new Error('Vui lòng chuyển tệp .doc sang .docx hoặc PDF trước khi tải lên.');
  let response: Response;
  try {
    response = await fetch('/api/gemini/extract-bm02', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileData, mimeType: mimeTypes[extension] || mimeType, fileName }),
    });
  } catch {
    throw new Error('Không kết nối được server trích xuất. Vui lòng kiểm tra kết nối và thử lại.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `Server trích xuất trả lỗi HTTP ${response.status}. Vui lòng thử lại.`);
  }
  if (!body?.success || !body?.data || !Array.isArray(body.data.items) || body.data.items.length === 0) {
    throw new Error('Không nhận được dữ liệu vật tư hợp lệ từ server. Vui lòng kiểm tra tài liệu và thử lại.');
  }
  return body.data;
}

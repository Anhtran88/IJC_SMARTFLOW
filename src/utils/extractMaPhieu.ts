/**
 * Checks whether a code is strictly a form template identifier (ISO quality standard code)
 * rather than a unique ticket / document serial number.
 * Examples of template-only codes: "QTMH-BM06", "QTMH-BM02", "BM02", "BM06", "XDIJC-QTMH-BM01-", "XDIJC-QTMH-BM01", etc.
 */
export const isTemplateCodeOnly = (code: string): boolean => {
  if (!code || typeof code !== 'string') return true;
  const trimmed = code.trim().toUpperCase().replace(/_/g, '-');
  if (
    !trimmed ||
    trimmed === '-' ||
    trimmed === 'QTMH' ||
    trimmed === 'XDIJC' ||
    trimmed === 'BM' ||
    trimmed === 'XDIJC-QTMH-BM01-' ||
    trimmed === 'XDIJC-QTMH-BM01' ||
    trimmed === 'XDIJC-QTMH-BM06-' ||
    trimmed === 'XDIJC-QTMH-BM06'
  ) {
    return true;
  }
  // Matches pure template codes like "QTMH-BM06", "BM02", "XDIJC-QTMH-BM06", "BM03.2", "QTMH-BM03.2", "XDIJC-QTMH-BM01" without a trailing serial number
  return /^(?:XDIJC[-_]?)?(?:QTMH[-_]?)?BM\d+(?:\.\d+)?[-_]?$/i.test(trimmed);
};

/**
 * Checks whether a code is a valid unique ticket / order code.
 * Must not be empty, must not be a template-only code, and must contain serial digits or a valid ticket structure.
 */
export const isValidMaPhieu = (code: string): boolean => {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim().replace(/_/g, '-');
  if (trimmed.length < 3) return false;
  if (isTemplateCodeOnly(trimmed)) return false;
  // If it's just the default prefix without a suffix
  if (trimmed.toUpperCase() === 'XDIJC-QTMH-BM01-' || trimmed.toUpperCase() === 'XDIJC-QTMH-BM01') {
    return false;
  }
  return /\d/.test(trimmed) || (trimmed.includes('-') && !isTemplateCodeOnly(trimmed));
};

/**
 * Extracts only the ticket/order serial number [số phiếu] from any string (file name, raw code, etc.).
 * Examples:
 *  - "XDIJC-QTMH-BM06-26100073" -> "26100073"
 *  - "XDIJC_QTMH_BM06_26100073" -> "26100073"
 *  - "BM06-26100073" -> "26100073"
 *  - "Phiếu đề nghị mua bê tông 26100073.pdf" -> "26100073"
 *  - "XDIJC-QTMH-BM01-26090074" -> "26090074"
 *  - "26100073" -> "26100073"
 */
export const extractSoPhieu = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  // Clean string: remove file extension if any
  const clean = input.replace(/\.[^/.]+$/, "").trim();
  if (!clean || isTemplateCodeOnly(clean)) return '';

  // 1. Matches full format like (XDIJC|BTI)-QTMH-BMxx-XXXX
  const fullMatch = clean.match(/(?:XDIJC|BTI)[-_]QTMH[-_]BM\d+(?:\.\d+)?[-_]([A-Za-z0-9]+)/i);
  if (fullMatch && fullMatch[1] && !isTemplateCodeOnly(fullMatch[1])) {
    return fullMatch[1].trim();
  }

  // 2. Matches partial prefix like (QTMH-)BMxx-XXXX (e.g. BM06-26100073, QTMH-BM01-26090074)
  const bmMatch = clean.match(/(?:QTMH[-_])?BM\d+(?:\.\d+)?[-_]([A-Za-z0-9]+)/i);
  if (bmMatch && bmMatch[1] && !isTemplateCodeOnly(bmMatch[1])) {
    return bmMatch[1].trim();
  }

  // 3. Matches MP-XXXX
  const mpMatch = clean.match(/MP[-_]([A-Za-z0-9]+)/i);
  if (mpMatch && mpMatch[1]) {
    return mpMatch[1].trim();
  }

  // 4. 8-digit IJC/BTI serial number (YYMMXXXX, e.g. 26100073, 26090074, 25090014)
  const serialMatch = clean.match(/\b(2[4-9]\d{6})\b/);
  if (serialMatch && serialMatch[1]) {
    return serialMatch[1].trim();
  }

  // 5. Any standalone number with 4 to 10 digits
  const anyNumMatch = clean.match(/\b(\d{4,10})\b/);
  if (anyNumMatch && anyNumMatch[1]) {
    return anyNumMatch[1].trim();
  }

  // 6. Trailing code segment after '-' or '_'
  const trailingMatch = clean.match(/[-_\s]([A-Za-z0-9]+)$/);
  if (trailingMatch && trailingMatch[1] && !isTemplateCodeOnly(trailingMatch[1]) && /\d/.test(trailingMatch[1])) {
    return trailingMatch[1].trim();
  }

  return '';
};

/**
 * Normalizes and formats a ticket code into the full standard company format:
 * Cú pháp chuẩn: XDIJC-QTMH-BM01-[số phiếu]
 * Mặc định: XDIJC-QTMH-BM01-
 * số phiếu : trích từ tên của file upload
 */
export const formatStandardMaPhieu = (code: string): string => {
  if (!code || typeof code !== 'string') return 'XDIJC-QTMH-BM01-';
  const trimmed = code.trim().replace(/_/g, '-');
  if (isTemplateCodeOnly(trimmed)) return 'XDIJC-QTMH-BM01-';

  // Extract the [số phiếu]
  const soPhieu = extractSoPhieu(trimmed);
  if (soPhieu) {
    return `XDIJC-QTMH-BM01-${soPhieu.toUpperCase()}`;
  }

  // If already starts with XDIJC-QTMH-BM01- and has suffix
  if (trimmed.toUpperCase().startsWith('XDIJC-QTMH-BM01-')) {
    const after = trimmed.substring('XDIJC-QTMH-BM01-'.length).trim();
    if (after) {
      return `XDIJC-QTMH-BM01-${after.toUpperCase()}`;
    }
  }

  // If it's a non-empty code that has digits, append to standard prefix
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `XDIJC-QTMH-BM01-${digits}`;
  }

  return 'XDIJC-QTMH-BM01-';
};

/**
 * Extracts ticket code from uploaded file name with syntax: XDIJC-QTMH-BM01-[số phiếu]
 * Default: XDIJC-QTMH-BM01-
 * số phiếu : trích từ tên của file upload
 */
export const extractMaPhieuFromFileName = (fileName: string): string => {
  if (!fileName || typeof fileName !== 'string') return 'XDIJC-QTMH-BM01-';
  const soPhieu = extractSoPhieu(fileName);
  if (soPhieu) {
    return `XDIJC-QTMH-BM01-${soPhieu.toUpperCase()}`;
  }
  return 'XDIJC-QTMH-BM01-';
};

export const extractMaPhieu = (record: any): string => {
  if (!record) return '';

  const candidates = [
    record.maPhieu,
    record.maPhieuNguon,
    record.bm02?.maPhieu,
    record.bm02?.maPhieuNguon,
    record.bm032?.maPhieu,
    record.bbntData?.maPhieu,
    record.docNumber
  ];

  for (const c of candidates) {
    if (c && typeof c === 'string') {
      const trimmed = c.trim();
      if (isValidMaPhieu(trimmed)) {
        return formatStandardMaPhieu(trimmed);
      }
    }
  }

  const fileNameCandidate = extractMaPhieuFromFileName(
    record.originalFileName || record.fileName || record.bm02Data?.originalFileName || record.bm02?.originalFileName
  );
  if (fileNameCandidate && isValidMaPhieu(fileNameCandidate)) {
    return fileNameCandidate;
  }

  const idStr = String(record.id || record.snapshotId || '').trim();
  if (idStr) {
    const raw = idStr.replace(/^BM02-/i, '').replace(/^BM03\.2-/i, '').replace(/^BM06-/i, '').trim();
    if (raw && !raw.startsWith('new-') && !/^\d{13}$/.test(raw) && raw !== '-' && isValidMaPhieu(raw)) {
      return formatStandardMaPhieu(raw);
    }
  }

  return '';
};

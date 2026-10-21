function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function taoBangRong(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(sheetName)) return; // đã có rồi

  const sheet = ss.insertSheet(sheetName);

  // Tạo header tương ứng theo tên sheet
  if (sheetName.startsWith('GiaVatTu')) {
    sheet.getRange(1,1,1,4).setValues([['id','tenVatTu','donVi','giaGoc']]);
  } else if (sheetName.startsWith('DonDeNghi')) {
    sheet.getRange(1,1,1,9).setValues([['id','tieuDe','ngayLap','nguoiLap','diaDiem','tongTien','trangThai','danhSachVatTu','ngayTao']]);
  } else if (sheetName.startsWith('CauHinh')) {
    sheet.getRange(1,1,1,4).setValues([['key','value','nhom','ghiChu']]);
  } else if (sheetName.startsWith('NguoiDung')) {
    sheet.getRange(1,1,1,8).setValues([['id','hoTen','chucVu','donVi','soDienThoai','email','ngayTao','ghiChu']]);
  } else if (sheetName.startsWith('LichSuGia')) {
    sheet.getRange(1,1,1,7).setValues([['id','ngayCapNhat','tenFile','soLuongVatTu','soVatTuTang','soVatTuGiam','ghiChu']]);
  } else if (sheetName.startsWith('HoSoTaiLieu')) {
    sheet.getRange(1,1,1,9).setValues([['id','tieuDe','loaiTaiLieu','thoiGian','diaDiem','nguoiTao','trangThai','ghiChu','ngayTao']]);
  }

  sheet.setFrozenRows(1);
}

function importGiaGoc(data, sheetGia, sheetLichSu) {
  try {
    console.log('importGiaGoc called');
    console.log('sheetGia:', sheetGia);
    console.log('data keys:', JSON.stringify(Object.keys(data || {})));

    const danhSach = data.danhSach || [];
    const ngay     = data.ngay     || new Date().toISOString().split('T')[0];

    if (!danhSach.length) {
      return jsonResponse({ success: false, error: 'Danh sách rỗng' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Tự tạo sheet nếu chưa có
    let sheet = ss.getSheetByName(sheetGia);
    if (!sheet) {
      sheet = ss.insertSheet(sheetGia);
      console.log('Tạo sheet mới:', sheetGia);
    }

    // Xóa data cũ, giữ header
    sheet.clearContents();

    // Tạo header: id | tenVatTu | donVi | giaGoc_YYYY-MM-DD
    const tenCotGia = 'giaGoc_' + ngay;
    sheet.getRange(1, 1, 1, 4).setValues([[
      'id', 'tenVatTu', 'donVi', tenCotGia
    ]]);

    // Ghi data
    const rows = danhSach.map((item, i) => [
      'VT' + String(i + 1).padStart(4, '0'),
      item.tenVatTu || '',
      item.donVi    || '',
      item.giaGoc   || 0
    ]);

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    }

    // Ghi log lịch sử
    ghiLichSuGia(sheetLichSu, ngay, danhSach.length, 'Import giá gốc');

    console.log('importGiaGoc success:', rows.length, 'vật tư');
    return jsonResponse({
      success: true,
      data: { soLuong: rows.length },
      message: `Đã import ${rows.length} vật tư thành công`
    });

  } catch(err) {
    console.error('importGiaGoc error:', err.message);
    return jsonResponse({ success: false, error: 'importGiaGoc: ' + err.message });
  }
}

function ghiLichSuGia(sheetName, ngay, soLuong, ghiChu) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1,1,1,5).setValues([['id','ngayCapNhat','soLuongVatTu','ghiChu','thoiGianTao']]);
    }
    sheet.appendRow([
      'LS' + Date.now(),
      ngay,
      soLuong,
      ghiChu,
      new Date().toLocaleString('vi-VN')
    ]);
  } catch(e) {
    console.error('ghiLichSuGia error:', e.message);
  }
}

function layDanhSachIdHopLe() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhSachVatTu');
    if (!sheet) return ['BeTong','Gach','XiMang','SatThep','CatDa','XeCoGioi'];
    const data = sheet.getDataRange().getValues();
    return data.slice(1).map(r => r[0]).filter(Boolean);
  } catch(e) {
    return ['BeTong','Gach','XiMang','SatThep','CatDa','XeCoGioi'];
  }
}

function doPost(e) {
  try {
    const raw = e.postData ? e.postData.contents : '{}';
    console.log('doPost raw:', raw.substring(0, 300));

    let req = {};
    try { req = JSON.parse(raw); }
    catch(err) { return jsonResponse({ success: false, error: 'Parse error: ' + err.message }); }

    const action    = req.action    || '';
    const loaiVatTu = req.loaiVatTu || '';
    const data      = req.data      || {};

    console.log('action:', action, '| loai:', loaiVatTu);

    // Xử lý các action KHÔNG cần loaiVatTu trước
    switch(action) {
      case 'getDanhSachVatTu_all':
        return getDanhSachVatTuAll();
      case 'themVatTuMoi':
        return themVatTuMoi(data);
      case 'anVatTu':
        return anVatTu(data.id);
      case 'hienVatTu':
        return hienVatTu(data.id);
      case 'capNhatVatTu':
        return capNhatVatTu(data);
    }

    // Validate loại cho các action còn lại
    const loaiHopLe = layDanhSachIdHopLe();
    const loai = loaiHopLe.includes(loaiVatTu) ? loaiVatTu : (loaiHopLe[0] || 'BeTong');

    function s(ten) { return ten + '_' + loai; }

    switch(action) {
      case 'importGiaGoc':
        console.log('Calling importGiaGoc, sheet:', s('GiaVatTu'));
        return importGiaGoc(data, s('GiaVatTu'), s('LichSuGia'));

      case 'capNhatGia':
        return capNhatGia(data, s('GiaVatTu'), s('LichSuGia'));

      case 'getDanhSachNgay':
        return getDanhSachNgay(s('GiaVatTu'));

      case 'getGiaTheoNgay':
        return getGiaTheoNgay(data.ngay, s('GiaVatTu'));

      case 'getDanhSachVatTu':
        return getDanhSachVatTu(s('GiaVatTu'));

      case 'deleteVatTu':
        return xoaTheoId(s('GiaVatTu'), data.id);

      case 'updateVatTuPrice':
        return updateVatTuPrice(data, s('GiaVatTu'));

      case 'getUsers':         return getUsers(s('NguoiDung'));
      case 'addUser':          return addUser(data, s('NguoiDung'));
      case 'updateUser':       return updateUser(data, s('NguoiDung'));
      case 'deleteUser':       return xoaTheoId(s('NguoiDung'), data.id);

      case 'getTaiLieu':       return getTaiLieu(s('HoSoTaiLieu'));
      case 'addTaiLieu':       return addTaiLieu(data, s('HoSoTaiLieu'));
      case 'updateTaiLieu':    return updateTaiLieu(data, s('HoSoTaiLieu'));
      case 'deleteTaiLieu':    return xoaTheoId(s('HoSoTaiLieu'), data.id);

      case 'getDonDeNghi':     return getDonDeNghi(s('DonDeNghi'));
      case 'saveDonDeNghi':    return saveDonDeNghi(data, s('DonDeNghi'));
      case 'deleteDonDeNghi':  return xoaTheoId(s('DonDeNghi'), data.id);

      case 'getCauHinh':       return getCauHinh(s('CauHinh'));
      case 'saveCauHinh':      return saveCauHinh(data, s('CauHinh'));

      default:
        console.log('UNKNOWN ACTION:', action);
        return jsonResponse({
          success: false,
          error: `Hành động không hợp lệ: "${action}" | loai: "${loai}"`
        });
    }
  } catch(err) {
    console.error('doPost crash:', err.message);
    return jsonResponse({ success: false, error: 'Server error: ' + err.message });
  }
}

// --- CÁC HÀM XỬ LÝ NGHIỆP VỤ ---

function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    taoBangRong(sheetName);
    return [];
  }
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function xoaTheoId(sheetName, id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return jsonResponse({ success: false, error: 'Sheet không tồn tại' });
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true, data: true });
    }
  }
  return jsonResponse({ success: false, error: 'Không tìm thấy ID' });
}

// NGƯỜI DÙNG
function getUsers(sheetName) { return jsonResponse({ success: true, data: getSheetData(sheetName) }); }
function addUser(data, sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) taoBangRong(sheetName);
  const targetSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const id = "U" + new Date().getTime();
  targetSheet.appendRow([id, data.hoTen, data.chucVu, data.donVi, data.soDienThoai, data.email, new Date(), data.ghiChu]);
  return jsonResponse({ success: true, data: { id } });
}
function updateUser(data, sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return jsonResponse({ success: false, error: 'Sheet không tồn tại' });
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      sheet.getRange(i + 1, 2, 1, 7).setValues([[data.hoTen, data.chucVu, data.donVi, data.soDienThoai, data.email, values[i][6], data.ghiChu]]);
      return jsonResponse({ success: true, data: true });
    }
  }
  return jsonResponse({ success: false, error: 'Không tìm thấy người dùng' });
}

// HỒ SƠ TÀI LIỆU
function getTaiLieu(sheetName) { return jsonResponse({ success: true, data: getSheetData(sheetName) }); }
function addTaiLieu(data, sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) taoBangRong(sheetName);
  const targetSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const id = "DOC" + new Date().getTime();
  targetSheet.appendRow([id, data.tieuDe, data.loaiTaiLieu, data.thoiGian, data.diaDiem, data.nguoiTao, data.trangThai || "Mới", data.ghiChu, new Date()]);
  return jsonResponse({ success: true, data: { id } });
}
function updateTaiLieu(data, sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return jsonResponse({ success: false, error: 'Sheet không tồn tại' });
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      sheet.getRange(i + 1, 2, 1, 7).setValues([[data.tieuDe, data.loaiTaiLieu, data.thoiGian, data.diaDiem, data.nguoiTao, data.trangThai, data.ghiChu]]);
      return jsonResponse({ success: true, data: true });
    }
  }
  return jsonResponse({ success: false, error: 'Không tìm thấy tài liệu' });
}

// GIÁ VẬT TƯ
function capNhatGia(data, sheetName, historySheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return jsonResponse({ success: false, error: 'Sheet không tồn tại' });
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const ngay = data.ngay;
  const danhSachGia = data.danhSachGia || [];
  const tenFile = data.tenFile || 'N/A';
  
  const colName = "gia_" + ngay;
  let colIdx = headers.indexOf(colName);
  if (colIdx === -1) {
    colIdx = headers.length;
    sheet.getRange(1, colIdx + 1).setValue(colName);
  }
  
  let tang = 0, giam = 0, count = 0;
  danhSachGia.forEach(item => {
    for (let i = 1; i < values.length; i++) {
      if (normalizeString(values[i][1]) === normalizeString(item.tenVatTu)) {
        const oldPrice = values[i][colIdx === headers.length ? colIdx - 1 : colIdx] || values[i][3];
        if (item.giaMoi > oldPrice) tang++;
        else if (item.giaMoi < oldPrice) giam++;
        sheet.getRange(i + 1, colIdx + 1).setValue(item.giaMoi);
        count++;
        break;
      }
    }
  });
  
  const historySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(historySheetName);
  if (!historySheet) taoBangRong(historySheetName);
  const targetHistory = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(historySheetName);
  targetHistory.appendRow(["LOG" + new Date().getTime(), ngay, tenFile, count, tang, giam, "Cập nhật định kỳ"]);
  
  return jsonResponse({ success: true, data: { updatedCount: count, tang, giam } });
}

function getDanhSachNgay(sheetName) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) return jsonResponse({ success: true, data: [] });

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    console.log('getDanhSachNgay headers:', JSON.stringify(headers));

    const result = [];
    headers.forEach((h, i) => {
      const ten = String(h).trim();
      if (!ten.startsWith('gia') || i < 3) return;

      let label = '';
      if (ten === 'giaGoc') {
        label = 'Giá gốc';
      } else if (ten.startsWith('giaGoc_')) {
        // dạng giaGoc_2026-03-27
        const datePart = ten.replace('giaGoc_', '');
        label = 'Giá gốc (' + formatDateLabel(datePart) + ')';
      } else if (ten.startsWith('gia_')) {
        // dạng gia_2026-03-27
        const datePart = ten.replace('gia_', '');
        label = formatDateLabel(datePart);
      } else {
        // tên khác, dùng nguyên
        label = ten;
      }

      result.push({ value: ten, label, colIndex: i });
    });

    // Sắp xếp: giá gốc đầu, còn lại mới nhất lên đầu
    result.sort((a, b) => {
      if (a.value.startsWith('giaGoc')) return -1;
      if (b.value.startsWith('giaGoc')) return 1;
      return b.value.localeCompare(a.value);
    });

    console.log('getDanhSachNgay result:', JSON.stringify(result));
    return jsonResponse({ success: true, data: result });

  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function formatDateLabel(dateStr) {
  const parts = String(dateStr).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function getGiaTheoNgay(ngay, sheetName) {
  const data = getSheetData(sheetName);
  const result = data.map(d => ({
    tenVatTu: d.tenVatTu || d["Tên vật tư"] || d["Tên"],
    donVi: d.donVi || d["Đơn vị"] || d["ĐVT"],
    donGia: Number(d[ngay]) || Number(d.giaGoc) || 0
  }));
  return jsonResponse({ success: true, data: result });
}

function getDanhSachVatTu(sheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet || sheet.getLastRow() <= 1) {
      return jsonResponse({ success: true, data: { vatTu: [], cotNgay: [] } });
    }

    const data    = sheet.getDataRange().getValues();
    const headers = data[0];

    console.log('Headers:', JSON.stringify(headers));

    // Tìm tất cả cột giá (bắt đầu bằng 'gia' hoặc 'giaGoc')
    const cotNgay = [];
    headers.forEach((h, i) => {
      const ten = String(h).trim();
      if (ten.startsWith('gia') && i >= 3) {
        cotNgay.push({ colIndex: i, tenCot: ten });
      }
    });

    console.log('Cot ngay:', JSON.stringify(cotNgay));

    // Tìm index các cột cơ bản
    const idCol  = headers.findIndex(h => String(h).toLowerCase() === 'id');
    const tenCol = headers.findIndex(h => String(h).toLowerCase() === 'tenvattu');
    const dvtCol = headers.findIndex(h => String(h).toLowerCase() === 'donvi');

    const vatTu = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[tenCol]) continue;

      const item = {
        id:     row[idCol]  || '',
        tenVatTu: row[tenCol] || '',
        donVi:  row[dvtCol] || '',
        gia:    {}
      };

      // Lấy tất cả giá theo từng cột ngày
      cotNgay.forEach(({ colIndex, tenCot }) => {
        const giaVal = parseFloat(String(row[colIndex]).replace(/[^0-9.]/g, '')) || 0;
        item.gia[tenCot] = giaVal;
      });

      vatTu.push(item);
    }

    return jsonResponse({
      success: true,
      data: {
        vatTu,
        cotNgay: cotNgay.map(c => c.tenCot),
        headers: headers.map(h => String(h))
      }
    });

  } catch(err) {
    console.error('getDanhSachVatTu error:', err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}

function updateVatTuPrice(data, sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return jsonResponse({ success: false, error: 'Sheet không tồn tại' });
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.id) {
      sheet.getRange(i + 1, 2, 1, 3).setValues([[data.tenVatTu, data.donVi, data.giaGoc]]);
      return jsonResponse({ success: true, data: true });
    }
  }
  return jsonResponse({ success: false, error: 'Không tìm thấy vật tư' });
}

// ĐƠN ĐỀ NGHỊ
function getDonDeNghi(sheetName) { return jsonResponse({ success: true, data: getSheetData(sheetName) }); }
function saveDonDeNghi(data, sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) taoBangRong(sheetName);
  const targetSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const id = data.id || "REQ" + new Date().getTime();
  const rowData = [id, data.tieuDe, data.ngayLap, data.nguoiLap, data.diaDiem, data.tongTien, data.trangThai || "Chờ duyệt", JSON.stringify(data.danhSachVatTu), new Date()];
  
  if (data.id) {
    const values = targetSheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        targetSheet.getRange(i + 1, 1, 1, 9).setValues([rowData]);
        return jsonResponse({ success: true, data: { id } });
      }
    }
  }
  targetSheet.appendRow(rowData);
  return jsonResponse({ success: true, data: { id } });
}

// CẤU HÌNH
function getCauHinh(sheetName) {
  const data = getSheetData(sheetName);
  const result = {};
  data.forEach(row => {
    const key = String(row.key).trim();
    if (key) result[key] = row.value;
  });
  return jsonResponse({ success: true, data: result });
}

function saveCauHinh(data, sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) taoBangRong(sheetName);
  const targetSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const sheetData = targetSheet.getDataRange().getValues();
  const headers = sheetData[0];
  const keyCol = headers.indexOf('key');
  const valCol = headers.indexOf('value');
  
  const noTrimKeys = [
    'canCu_coDinh',
    'logo_base64',
    'bm02_kyTen_config',
    'pkg_benGiao_ds',
    'pkg_benNhan_ds'
  ];
  
  Object.entries(data).forEach(([key, value]) => {
    let found = false;
    let finalValue = value;
    if (typeof value === 'string' && noTrimKeys.indexOf(key) === -1) {
      finalValue = value.trim();
    }

    for (let i = 1; i < sheetData.length; i++) {
      if (String(sheetData[i][keyCol]).trim() === key) {
        targetSheet.getRange(i + 1, valCol + 1).setValue(finalValue);
        found = true;
        break;
      }
    }
    if (!found) {
      targetSheet.appendRow([key, finalValue, 'CHUNG', '']);
    }
  });
  return jsonResponse({ success: true, data: true });
}

function normalizeString(str) {
  if (!str) return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

// --- QUẢN LÝ DANH SÁCH VẬT TƯ ĐỘNG ---

function getDanhSachVatTuAll() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('DanhSachVatTu');
    if (!sheet) {
      // Tự tạo sheet và điền 6 vật tư mặc định nếu chưa có
      sheet = ss.insertSheet('DanhSachVatTu');
      const headers = ['id','ten','tenVietTat','icon','mauNen','tieuDeBM02','ngayTao','trangThai'];
      sheet.getRange(1,1,1,8).setValues([headers]);
      const defaults = [
        ['BeTong','Bê Tông','BeTong','🏗️','#1e88e5','Phê duyệt dự trù kinh phí mua vật tư BÊ TÔNG',new Date().toISOString(),'active'],
        ['Gach','Gạch','Gach','🧱','#e53935','Phê duyệt dự trù kinh phí mua vật tư GẠCH',new Date().toISOString(),'active'],
        ['XiMang','Xi Măng','XiMang','🏭','#757575','Phê duyệt dự trù kinh phí mua vật tư XI MĂNG',new Date().toISOString(),'active'],
        ['SatThep','Sắt Thép','SatThep','⚙️','#546e7a','Phê duyệt dự trù kinh phí mua vật tư SẮT THÉP',new Date().toISOString(),'active'],
        ['CatDa','Cát - Đá','CatDa','🪨','#f9a825','Phê duyệt dự trù kinh phí mua vật tư CÁT, ĐÁ',new Date().toISOString(),'active'],
        ['XeCoGioi','Xe Cơ Giới','XeCoGioi','🚜','#2e7d32','Phê duyệt dự trù kinh phí thuê XE CƠ GIỚI',new Date().toISOString(),'active'],
      ];
      sheet.getRange(2,1,defaults.length,8).setValues(defaults);
    }
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h,i) => obj[h] = row[i]);
      return obj;
    }).filter(r => r.id); // Trả về tất cả vật tư có id
    return jsonResponse({ success: true, data: rows });
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function themVatTuMoi(data) {
  try {
    if (!data.ten || !data.id) throw new Error('Thiếu tên hoặc id vật tư');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('DanhSachVatTu');
    if (!sheet) {
      getDanhSachVatTuAll(); // Tự tạo nếu chưa có
      sheet = ss.getSheetByName('DanhSachVatTu');
    }

    // Kiểm tra id đã tồn tại chưa
    const existing = sheet.getDataRange().getValues();
    const ids = existing.slice(1).map(r => r[0]);
    if (ids.includes(data.id)) throw new Error(`ID "${data.id}" đã tồn tại`);

    // Thêm dòng mới
    sheet.appendRow([
      data.id,
      data.ten,
      data.id, // tenVietTat = id
      data.icon    || '📦',
      data.mauNen  || '#455a64',
      data.tieuDeBM02 || `Phê duyệt dự trù kinh phí mua vật tư ${data.ten.toUpperCase()}`,
      new Date().toISOString(),
      'active'
    ]);

    // Tự động tạo các sheet cần thiết cho vật tư mới
    const sheetsCanTao = ['GiaVatTu','DonDeNghi','LichSuGia','CauHinh','NguoiDung','HoSoTaiLieu'];
    sheetsCanTao.forEach(tenSheet => {
      const tenDay = tenSheet + '_' + data.id;
      if (!ss.getSheetByName(tenDay)) {
        taoBangRong(tenDay);
        console.log('Tạo sheet:', tenDay);
      }
    });

    return jsonResponse({ success: true, message: `Đã thêm vật tư "${data.ten}" thành công` });
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function capNhatVatTu(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('DanhSachVatTu');
    if (!sheet) throw new Error('Chưa có sheet DanhSachVatTu');
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idIdx = headers.indexOf('id');
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][idIdx] === data.id) {
        // Cập nhật các trường được gửi lên
        headers.forEach((h, colIdx) => {
          if (data[h] !== undefined) {
            sheet.getRange(i + 1, colIdx + 1).setValue(data[h]);
          }
        });
        return jsonResponse({ success: true, message: 'Cập nhật thành công' });
      }
    }
    throw new Error('Không tìm thấy vật tư id: ' + data.id);
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function anVatTu(id) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('DanhSachVatTu');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        sheet.getRange(i+1, 8).setValue('hidden');
        return jsonResponse({ success: true, message: 'Đã ẩn vật tư' });
      }
    }
    throw new Error('Không tìm thấy id: ' + id);
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function hienVatTu(id) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('DanhSachVatTu');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        sheet.getRange(i+1, 8).setValue('active');
        return jsonResponse({ success: true, message: 'Đã hiện vật tư' });
      }
    }
    throw new Error('Không tìm thấy id: ' + id);
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

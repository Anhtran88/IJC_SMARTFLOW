import { BM032Representative, Personnel } from '../../types';
import { DEFAULT_PERSONNEL_LIST, getLocalPersonnelList } from '../lib/personnelService';

/**
 * Standardize and clean a proposer/requester name extracted from OCR or user input.
 * Strips prefixes like "Người đề nghị", "P.Ban đề nghị", "Chỉ huy trưởng", "Kỹ sư", "Ông", "Bà", etc.
 */
export function cleanProposerName(rawName: string | undefined | null): string {
  if (!rawName) return '';
  let name = String(rawName).trim();

  // Strip leading punctuation/symbols
  name = name.replace(/^[\s\-_*#•:：]+/g, '');

  // Strip common prefix titles / roles (case-insensitive)
  const prefixRegex = /^(Người\s*đề\s*nghị|P\.?\s*Ban\s*đề\s*nghị|Phòng\s*ban\s*đề\s*nghị|Ban\s*đề\s*nghị|Bộ\s*phận\s*đề\s*nghị|Chỉ\s*huy\s*trưởng|Kỹ\s*sư|Ông|Bà|Đại\s*diện|Đ\/c|Đồng\s*chí)\s*[:：\-–—\.]*\s*/i;
  
  // Repeat in case of nested prefixes like "Người đề nghị (Chỉ huy trưởng): Đỗ Thế Viễn"
  for (let i = 0; i < 3; i++) {
    name = name.replace(prefixRegex, '').trim();
    name = name.replace(/^\([^)]*(người\s*đề\s*nghị|chỉ\s*huy\s*trưởng|cht)[^)]*\)\s*[:：\-–—\.]*\s*/i, '').trim();
  }

  // Strip trailing notes like "(Ký tên)", "(Ký, ghi rõ họ tên)"
  name = name.replace(/\s*\([^)]*(ký|họ\s*tên|kèm|chức\s*vụ|đóng\s*dấu)[^)]*\)/gi, '');

  return name.trim();
}

/**
 * Check if a signature title belongs to "P.BAN ĐỀ NGHỊ"
 */
export function isPBanDeNghiTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  const t = title.toUpperCase().replace(/\s+/g, ' ').trim();
  return (
    t.includes('P.BAN ĐỀ NGHỊ') ||
    t.includes('P. BAN ĐỀ NGHỊ') ||
    t.includes('PBAN ĐỀ NGHỊ') ||
    t.includes('BAN ĐỀ NGHỊ') ||
    t.includes('PHÒNG BAN ĐỀ NGHỊ') ||
    t.includes('BỘ PHẬN ĐỀ NGHỊ') ||
    (t.includes('ĐỀ NGHỊ') && !t.includes('PHIẾU') && !t.includes('NỘI DUNG'))
  );
}

/**
 * Check if a representative position is "Chỉ huy trưởng" (Site Manager)
 */
export function isChiHuyTruongPosition(position: string | undefined | null): boolean {
  if (!position) return false;
  const p = position.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    p.includes('chỉ huy trưởng') ||
    p.includes('chi huy truong') ||
    p === 'cht' ||
    p.includes('chỉ huy trường')
  );
}

/**
 * Synchronize the proposer's name into a receiverList for BM03.2 and BM04
 * Updates the representative with position "Chỉ huy trưởng"
 */
export function updateReceiverListWithChiHuyTruong(
  currentList: BM032Representative[] | undefined,
  proposerName: string,
  personnelDirectory?: Personnel[]
): BM032Representative[] {
  const cleanName = cleanProposerName(proposerName);
  if (!cleanName) {
    return currentList && currentList.length > 0 ? currentList : [];
  }

  const list = currentList && currentList.length > 0 ? [...currentList] : [];
  
  // Try to find directory record for this person to match gender/ID
  const directory = personnelDirectory && personnelDirectory.length > 0 
    ? personnelDirectory 
    : (typeof window !== 'undefined' ? getLocalPersonnelList() : DEFAULT_PERSONNEL_LIST);
    
  const matchedPerson = directory.find(
    p => p.fullName && p.fullName.toLowerCase().trim() === cleanName.toLowerCase().trim()
  ) || DEFAULT_PERSONNEL_LIST.find(
    p => p.fullName && p.fullName.toLowerCase().trim() === cleanName.toLowerCase().trim()
  );

  let updated = false;
  const result = list.map(rep => {
    if (isChiHuyTruongPosition(rep.position)) {
      updated = true;
      return {
        ...rep,
        name: cleanName,
        position: rep.position || 'Chỉ huy trưởng',
        salutation: matchedPerson?.gender || rep.salutation || 'Ông',
        personnelId: matchedPerson?.id || rep.personnelId,
        isExternal: !matchedPerson
      };
    }
    return rep;
  });

  if (!updated) {
    // If not found in current list, check if slot 2 (index 2) is suitable or append
    const newRep: BM032Representative = {
      name: cleanName,
      position: 'Chỉ huy trưởng',
      salutation: matchedPerson?.gender || 'Ông',
      personnelId: matchedPerson?.id,
      isExternal: !matchedPerson
    };

    if (result.length >= 3 && (!result[2].position || isChiHuyTruongPosition(result[2].position))) {
      result[2] = newRep;
    } else {
      result.push(newRep);
    }
  }

  return result;
}

/**
 * Synchronize the proposer's name into kyTenBM02 for BM02
 * Updates the signature item where chucDanh is "P.BAN ĐỀ NGHỊ"
 */
export function updateKyTenWithPBanDeNghi(
  kyTenList: any[] | undefined,
  proposerName: string
): any[] {
  const cleanName = cleanProposerName(proposerName);
  if (!cleanName) {
    return kyTenList && kyTenList.length > 0 ? kyTenList : [];
  }

  const upperName = cleanName.toUpperCase();
  const list = kyTenList && kyTenList.length > 0 ? [...kyTenList] : [];

  let updated = false;
  const result = list.map(item => {
    if (isPBanDeNghiTitle(item.chucDanh) || item.id === 'kt_4') {
      updated = true;
      return {
        ...item,
        chucDanh: item.chucDanh && isPBanDeNghiTitle(item.chucDanh) ? item.chucDanh : 'P.BAN ĐỀ NGHỊ',
        hoTen: upperName
      };
    }
    return item;
  });

  if (!updated) {
    // If not found, insert or replace item #2
    const pBanItem = {
      id: 'kt_pban',
      chucDanh: 'P.BAN ĐỀ NGHỊ',
      hoTen: upperName,
      viTri: 20
    };

    if (result.length >= 2 && (!result[1].chucDanh || result[1].chucDanh.includes('kỹ thuật'))) {
      result[1] = pBanItem;
    } else if (result.length > 0) {
      result.splice(1, 0, pBanItem);
    } else {
      result.push(pBanItem);
    }
  }

  return result;
}

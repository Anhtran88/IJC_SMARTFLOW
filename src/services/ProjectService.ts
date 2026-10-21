import { collection, getDocs } from 'firebase/firestore';
import { getFirestoreDB } from '../lib/firebaseService';
import { getDB, updateProjectTotalUnitsCache, loadProjectTotalUnitsAll } from '../lib/firebaseService';
import { ref, get } from 'firebase/database';
import { normalizeProjectName } from '../lib/formatUtils';

export interface ProjectRecord {
  id: string;          // RTDB key (e.g., 'AAA', 'Dự án A')
  key: string;         // RTDB key
  name: string;        // Resolved project name (name property || key)
  totalUnits?: number | null;
  [key: string]: any;
}

export class ProjectServiceClass {
  private keyToNameMap: Map<string, string> = new Map();
  private nameToKeyMap: Map<string, string> = new Map();

  async loadProjectTotalUnitsAll(): Promise<void> {
    try {
      await loadProjectTotalUnitsAll();
    } catch (err) {
      console.warn('[ProjectService] loadProjectTotalUnitsAll failed:', err);
    }
  }

  /**
   * Đọc danh sách dự án từ RTDB node 'projects' (hoặc lớp tương thích).
   * - Nếu node có `name` (hoặc `info.name`, `projectName`), dùng name.
   * - Nếu node chỉ có key (ví dụ AAA, BBB), dùng chính key làm tên dự án.
   */
    async getProjectsFromDB(): Promise<ProjectRecord[]> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return [];
    try {
      const snap = await getDocs(collection(fsDb, 'projects'));
      const records: ProjectRecord[] = [];
      snap.forEach(docSnap => {
        const key = docSnap.id;
        const node = docSnap.data();
        let rawName = '';
        if (typeof node === 'object' && node !== null) {
          rawName = node.name || node.info?.name || node.projectName || node.ten || '';
        }
        const resolvedName = (rawName && String(rawName).trim()) ? String(rawName).trim() : key;
        const normalizedName = normalizeProjectName(resolvedName) || resolvedName;
        const totalUnitsVal = (typeof node === 'object' && node !== null) ? (node.totalUnits ?? null) : null;
        
        if (totalUnitsVal !== null && !isNaN(Number(totalUnitsVal))) {
          const num = Number(totalUnitsVal);
          updateProjectTotalUnitsCache(key, num);
          updateProjectTotalUnitsCache(resolvedName, num);
          updateProjectTotalUnitsCache(normalizedName, num);
        }
        const record: ProjectRecord = {
          id: key,
          key: key,
          name: normalizedName,
          totalUnits: totalUnitsVal !== null ? Number(totalUnitsVal) : null,
          ...(typeof node === 'object' && node !== null ? node : {})
        };
        this.keyToNameMap.set(key, normalizedName);
        this.nameToKeyMap.set(normalizedName.toLowerCase(), key);
        records.push(record);
      });
      return records;
    } catch (err) {
      console.warn('[ProjectService] Lỗi khi đọc danh sách projects từ DB:', err);
      return [];
    }
  }

  /**
   * Chuyển đổi bất kỳ identifier (key hoặc name) sang Tên dự án chuẩn hóa.
   * Ưu tiên đối chiếu tên dự án cho tất cả các mối quan hệ join (estimateGroups, estimateItems, BM06).
   */
  resolveProjectName(projectIdOrKey?: string | null): string {
    if (!projectIdOrKey) return '';
    const raw = String(projectIdOrKey).trim();
    if (!raw) return '';

    // Check mapping key -> name
    if (this.keyToNameMap.has(raw)) {
      return this.keyToNameMap.get(raw)!;
    }

    // Try normalization
    const norm = normalizeProjectName(raw);
    return norm || raw;
  }

  /**
   * Build danh sách Project: gộp (merge) hai nguồn dữ liệu (DB projects node + estimateGroups/estimateItems/BM06)
   * và loại bỏ trùng lặp theo tên dự án.
   */
  mergeAndDeduplicateProjects(
    dbProjects: ProjectRecord[],
    estimateItems: any[] = [],
    bm06Orders: any[] = [],
    estimateGroups: any[] = []
  ): string[] {
    const nameSet = new Set<string>();

    // Nguồn 1: Dự án đọc từ node 'projects' trong DB
    dbProjects.forEach((p) => {
      const pName = p.name || p.key;
      const norm = normalizeProjectName(pName) || pName;
      if (norm) {
        nameSet.add(norm);
      }
    });

    // Nguồn 2: Dự án từ estimateGroups
    estimateGroups.forEach((g) => {
      if (!g || g.isArchived) return;
      const rawP = g.projectId || g.project_name;
      const norm = this.resolveProjectName(rawP);
      if (norm) nameSet.add(norm);
    });

    // Nguồn 2 (tiếp): Dự án từ estimateItems
    estimateItems.forEach((it) => {
      if (!it || it.isArchived) return;
      const rawP = it.projectId || it.project_name;
      const norm = this.resolveProjectName(rawP);
      if (norm) nameSet.add(norm);
    });

    // Nguồn 2 (tiếp): Dự án từ BM06 orders
    bm06Orders.forEach((ord) => {
      if (!ord) return;
      const rawP = ord.projectId || ord.project_name;
      const norm = this.resolveProjectName(rawP);
      if (norm) nameSet.add(norm);

      if (Array.isArray(ord.selectedUnits)) {
        ord.selectedUnits.forEach((u: any) => {
          if (u?.projectId) {
            const uNorm = this.resolveProjectName(u.projectId);
            if (uNorm) nameSet.add(uNorm);
          }
        });
      }
    });

    return Array.from(nameSet).sort((a, b) => a.localeCompare(b, 'vi'));
  }

  /**
   * Đọc và gộp danh sách dự án đầy đủ từ tất cả các nguồn dữ liệu.
   */
  async getUnifiedProjectsList(
    estimateItems: any[] = [],
    bm06Orders: any[] = [],
    estimateGroups: any[] = []
  ): Promise<string[]> {
    const dbProjects = await this.getProjectsFromDB();
    return this.mergeAndDeduplicateProjects(dbProjects, estimateItems, bm06Orders, estimateGroups);
  }
}

export const ProjectService = new ProjectServiceClass();

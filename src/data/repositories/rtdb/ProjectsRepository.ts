import { RTBaseRepository } from './RTBaseRepository';
import { rtDbProvider } from '../../providers/RealtimeDatabaseProvider';
import { ProjectService, ProjectRecord } from '../../../services/ProjectService';

export class ProjectsRepository extends RTBaseRepository<any> {
  constructor() {
    super('projects');
  }

  /**
   * Compatibility layer: Lấy danh sách dự án với tên chuẩn hóa.
   * - Nếu node có name thì dùng name.
   * - Nếu node chỉ có key (ví dụ AAA, BBB) thì dùng chính key làm tên dự án.
   */
  async getAllProjectsNormalized(): Promise<ProjectRecord[]> {
    return ProjectService.getProjectsFromDB();
  }

  // Helper to build project specific paths
  private getProjectPath(projectId: string, subPath: string = ''): string {
    return subPath ? `${projectId}/${subPath}` : projectId;
  }

  // --- info ---
  async getInfo(projectId: string) { return this.get(this.getProjectPath(projectId, 'info')); }
  async setInfo(projectId: string, data: any) { return this.set(data, this.getProjectPath(projectId, 'info')); }
  async updateInfo(projectId: string, updates: any) { return this.update(updates, this.getProjectPath(projectId, 'info')); }
  onInfo(projectId: string, callback: (data: any) => void) { return this.onValue(callback, this.getProjectPath(projectId, 'info')); }

  // --- estimates ---
  async getEstimates(projectId: string) { return this.get(this.getProjectPath(projectId, 'estimates')); }
  async setEstimates(projectId: string, data: any) { return this.set(data, this.getProjectPath(projectId, 'estimates')); }
  async updateEstimates(projectId: string, updates: any) { return this.update(updates, this.getProjectPath(projectId, 'estimates')); }
  onEstimates(projectId: string, callback: (data: any) => void) { return this.onValue(callback, this.getProjectPath(projectId, 'estimates')); }

  // --- bm01 ---
  async getBM01(projectId: string) { return this.get(this.getProjectPath(projectId, 'bm01')); }
  async setBM01(projectId: string, data: any) { return this.set(data, this.getProjectPath(projectId, 'bm01')); }
  async updateBM01(projectId: string, updates: any) { return this.update(updates, this.getProjectPath(projectId, 'bm01')); }
  onBM01(projectId: string, callback: (data: any) => void) { return this.onValue(callback, this.getProjectPath(projectId, 'bm01')); }

  // --- bm02 ---
  async getBM02(projectId: string) { return this.get(this.getProjectPath(projectId, 'bm02')); }
  async setBM02(projectId: string, data: any) { return this.set(data, this.getProjectPath(projectId, 'bm02')); }
  async updateBM02(projectId: string, updates: any) { return this.update(updates, this.getProjectPath(projectId, 'bm02')); }
  onBM02(projectId: string, callback: (data: any) => void) { return this.onValue(callback, this.getProjectPath(projectId, 'bm02')); }

  // --- bm03 ---
  async getBM03(projectId: string) { return this.get(this.getProjectPath(projectId, 'bm03')); }
  async setBM03(projectId: string, data: any) { return this.set(data, this.getProjectPath(projectId, 'bm03')); }
  async updateBM03(projectId: string, updates: any) { return this.update(updates, this.getProjectPath(projectId, 'bm03')); }
  onBM03(projectId: string, callback: (data: any) => void) { return this.onValue(callback, this.getProjectPath(projectId, 'bm03')); }

  // --- bm06 ---
  async getBM06(projectId: string) { return this.get(this.getProjectPath(projectId, 'bm06')); }
  async setBM06(projectId: string, data: any) { return this.set(data, this.getProjectPath(projectId, 'bm06')); }
  async updateBM06(projectId: string, updates: any) { return this.update(updates, this.getProjectPath(projectId, 'bm06')); }
  onBM06(projectId: string, callback: (data: any) => void) { return this.onValue(callback, this.getProjectPath(projectId, 'bm06')); }

  // --- dashboard ---
  async getDashboard(projectId: string) { return this.get(this.getProjectPath(projectId, 'dashboard')); }
  async setDashboard(projectId: string, data: any) { return this.set(data, this.getProjectPath(projectId, 'dashboard')); }
  async updateDashboard(projectId: string, updates: any) { return this.update(updates, this.getProjectPath(projectId, 'dashboard')); }
  onDashboard(projectId: string, callback: (data: any) => void) { return this.onValue(callback, this.getProjectPath(projectId, 'dashboard')); }

  // --- snapshots ---
  async getSnapshots(projectId: string) { return this.get(this.getProjectPath(projectId, 'snapshots')); }
  async setSnapshots(projectId: string, data: any) { return this.set(data, this.getProjectPath(projectId, 'snapshots')); }
  async pushSnapshot(projectId: string, data: any) { return this.push(data, this.getProjectPath(projectId, 'snapshots')); }

  // --- history ---
  async getHistory(projectId: string) { return this.get(this.getProjectPath(projectId, 'history')); }
  async pushHistory(projectId: string, data: any) { return this.push(data, this.getProjectPath(projectId, 'history')); }

  // Advanced: multi-update across different project sub-paths
  async multiUpdateProject(projectId: string, updates: Record<string, any>) {
    // Prefix all update keys with the project path
    const prefixedUpdates: Record<string, any> = {};
    for (const key of Object.keys(updates)) {
      prefixedUpdates[`${this.basePath}/${projectId}/${key}`] = updates[key];
    }
    await rtDbProvider.multiUpdate(prefixedUpdates);
  }
}

export const projectsRepository = new ProjectsRepository();

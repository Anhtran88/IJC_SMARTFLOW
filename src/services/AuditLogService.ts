import { logActivity } from '../lib/firebaseService';

export class AuditLogService {
  static async log(
    username: string,
    role: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'IMPORT' | 'EXPORT' | 'DELETE_USER' | 'DELETE_BACKUP' | string,
    moduleName: 'Dự toán' | 'BM06' | 'BM02' | 'BM03.2' | 'Báo cáo' | 'Cấu hình' | 'Quản lý tài khoản & Quyền hạn' | 'Sao lưu & Khôi phục' | string,
    description: string,
    targetId?: string,
    beforeData?: any,
    afterData?: any,
    extraParams?: Record<string, any>
  ): Promise<void> {
    try {
      await logActivity(
        username || 'khách',
        role || 'viewer',
        action as any,
        moduleName as any,
        description,
        targetId,
        beforeData,
        afterData,
        extraParams
      );
    } catch (e) {
      console.error('AuditLogService.log error:', e);
    }
  }
}

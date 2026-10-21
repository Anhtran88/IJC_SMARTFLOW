import { BaseRepository } from './BaseRepository';

export interface SystemBackup {
  backupId: string;
  [key: string]: any;
}

export class SystemBackupRepository extends BaseRepository<SystemBackup> {
  constructor() {
    super('system_backups');
  }

  // Backup system uses chunks in a sub-path like system_backups/{backupId}/chunks
  async getBackupChunks(backupId: string): Promise<Record<string, any> | null> {
    return this.provider.get(`system_backups/${backupId}/chunks`);
  }
}

export const systemBackupRepository = new SystemBackupRepository();

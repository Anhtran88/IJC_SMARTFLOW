import { RTBaseRepository } from './RTBaseRepository';

export class SettingsRepository extends RTBaseRepository<any> {
  constructor() {
    super('settings');
  }
}

export const settingsRepository = new SettingsRepository();

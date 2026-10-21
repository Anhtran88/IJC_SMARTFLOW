import { ConfigRepository } from './ConfigRepository';

export interface MaterialTypeConfig {
  id?: string;
  [key: string]: any;
}

export class MaterialTypeConfigRepository extends ConfigRepository<MaterialTypeConfig> {
  constructor() {
    super('materialTypeConfigs');
  }
}

export const materialTypeConfigRepository = new MaterialTypeConfigRepository();

import { rtDbProvider, RealtimeDatabaseProvider } from '../providers/RealtimeDatabaseProvider';

export abstract class BaseRepository<T> {
  protected provider: RealtimeDatabaseProvider;
  protected basePath: string;

  constructor(basePath: string) {
    this.provider = rtDbProvider;
    this.basePath = basePath;
  }

  protected getFullPath(id?: string): string {
    return id ? `${this.basePath}/${id}` : this.basePath;
  }

  async getById(id: string): Promise<T | null> {
    return this.provider.get<T>(this.getFullPath(id));
  }

  async getAll(): Promise<Record<string, T> | null> {
    return this.provider.get<Record<string, T>>(this.getFullPath());
  }

  async create(data: Omit<T, 'id'>, id?: string): Promise<string> {
    if (id) {
      await this.provider.set(this.getFullPath(id), data);
      return id;
    } else {
      const newId = await this.provider.push(this.getFullPath(), data);
      if (!newId) throw new Error('Failed to generate ID');
      return newId;
    }
  }

  async update(id: string, updates: Partial<T>): Promise<void> {
    await this.provider.update(this.getFullPath(id), updates);
  }

  async delete(id: string): Promise<void> {
    await this.provider.remove(this.getFullPath(id));
  }
}

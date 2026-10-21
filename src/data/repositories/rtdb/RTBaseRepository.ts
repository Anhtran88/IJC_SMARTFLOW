import { RealtimeDatabaseProvider, rtDbProvider } from '../../providers/RealtimeDatabaseProvider';

export abstract class RTBaseRepository<T> {
  protected provider: RealtimeDatabaseProvider;
  protected basePath: string;

  constructor(basePath: string) {
    this.provider = rtDbProvider;
    this.basePath = basePath;
  }

  protected getFullPath(pathSuffix?: string): string {
    return pathSuffix ? `${this.basePath}/${pathSuffix}` : this.basePath;
  }

  async get(pathSuffix?: string): Promise<T | null> {
    return this.provider.get<T>(this.getFullPath(pathSuffix));
  }

  async set(data: T, pathSuffix?: string): Promise<void> {
    await this.provider.set(this.getFullPath(pathSuffix), data);
  }

  async push(data: any, pathSuffix?: string): Promise<string | null> {
    return this.provider.push(this.getFullPath(pathSuffix), data);
  }

  async update(updates: Record<string, any>, pathSuffix?: string): Promise<void> {
    await this.provider.update(this.getFullPath(pathSuffix), updates);
  }

  async remove(pathSuffix?: string): Promise<void> {
    await this.provider.remove(this.getFullPath(pathSuffix));
  }

  async transaction(transactionUpdate: (currentData: any) => any, pathSuffix?: string): Promise<{ committed: boolean; snapshot: any }> {
    return this.provider.transaction(this.getFullPath(pathSuffix), transactionUpdate);
  }

  onValue(callback: (data: T | null) => void, pathSuffix?: string): () => void {
    return this.provider.onValue<T>(this.getFullPath(pathSuffix), callback);
  }
}

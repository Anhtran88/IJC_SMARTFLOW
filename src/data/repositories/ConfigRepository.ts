import { FirestoreProvider, firestoreProvider } from '../providers/FirestoreProvider';

export abstract class ConfigRepository<T extends Record<string, any>> {
  protected provider: FirestoreProvider;
  protected collectionName: string;

  constructor(collectionName: string) {
    this.provider = firestoreProvider;
    this.collectionName = collectionName;
  }

  async getById(id: string): Promise<T | null> {
    return this.provider.getDoc<T>(this.collectionName, id);
  }

  async getAll(): Promise<T[]> {
    return this.provider.getCollection<T>(this.collectionName);
  }

  async set(id: string, data: T, merge = true): Promise<void> {
    await this.provider.setDoc(this.collectionName, id, data, merge);
  }

  async update(id: string, updates: Partial<T>): Promise<void> {
    await this.provider.updateDoc(this.collectionName, id, updates as Record<string, any>);
  }

  async delete(id: string): Promise<void> {
    await this.provider.deleteDoc(this.collectionName, id);
  }

  onDocChange(id: string, callback: (data: T | null) => void): () => void {
    return this.provider.onSnapshot<T>(this.collectionName, id, callback);
  }
}

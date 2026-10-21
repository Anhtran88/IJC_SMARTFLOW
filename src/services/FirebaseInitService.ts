import { initFirebase, getDB } from '../lib/firebaseService';

export class FirebaseInitService {
  static init(config: any): void {
    initFirebase(config);
  }

  static isInitialized(): boolean {
    return !!getDB();
  }
}

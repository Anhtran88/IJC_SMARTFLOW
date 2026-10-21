import { ref, onValue, Database } from 'firebase/database';
import { doc, collection, onSnapshot, getFirestore } from 'firebase/firestore';
import { getDB, getFirestoreDB, sanitizeRTDBPath, handleFirestoreError, OperationType } from '../lib/firebaseService';

export type ListenerCallback<T = any> = (data: T | null) => void;

interface ActiveSubscription {
  path: string;
  nativeUnsubscribe: (() => void) | null;
  callbacks: Map<string, ListenerCallback>;
  lastData: any;
  hasValue: boolean;
}

export class FirebaseListenerManager {
  private static instance: FirebaseListenerManager;
  private subscriptions: Map<string, ActiveSubscription> = new Map();
  private callbackIdCounter = 0;

  private constructor() {}

  public static getInstance(): FirebaseListenerManager {
    if (!FirebaseListenerManager.instance) {
      FirebaseListenerManager.instance = new FirebaseListenerManager();
    }
    return FirebaseListenerManager.instance;
  }

  /**
   * Subscribe to a Realtime Database path.
   * If a subscription for the given path already exists, it is reused (reference counting).
   * Immediately delivers cached value if already fetched.
   * Returns a cleanup function that unsubscribes the callback.
   */
  public subscribe<T = any>(
    pathStr: string,
    callback: ListenerCallback<T>,
    onError?: (error: Error) => void
  ): () => void {
    const safePath = sanitizeRTDBPath(pathStr);
    const callbackId = `cb_${++this.callbackIdCounter}`;

    let sub = this.subscriptions.get(safePath);
    if (!sub) {
      sub = {
        path: safePath,
        nativeUnsubscribe: null,
        callbacks: new Map(),
        lastData: null,
        hasValue: false
      };
      this.subscriptions.set(safePath, sub);

      const parts = safePath.split('/');
      const isFirestore = ['estimateItems', 'estimateGroups', 'projects', 'bm06Orders', 'bm02Orders', 'bm032Orders', 'bbntOrders', 'lichSu'].includes(parts[0]);

      if (isFirestore) {
        const fsDb = getFirestoreDB();
        if (fsDb) {
          try {
            let unsub;
            const fsErrorHandler = (err: any) => {
              if (onError) {
                try { onError(err); } catch (_) {}
              }
              handleFirestoreError(err, OperationType.LIST, safePath);
            };

            if (parts.length === 1) {
              unsub = onSnapshot(collection(fsDb, parts[0]), (snapshot) => {
                const val: any = {};
                snapshot.forEach(doc => { val[doc.id] = doc.data(); });
                const currentSub = this.subscriptions.get(safePath);
                if (!currentSub) return;
                currentSub.lastData = val as T;
                currentSub.hasValue = true;
                currentSub.callbacks.forEach(cb => cb(val as T));
              }, fsErrorHandler);
            } else {
              unsub = onSnapshot(doc(fsDb, parts[0], parts.slice(1).join('/')), (snapshot) => {
                const val = snapshot.exists() ? snapshot.data() : null;
                const currentSub = this.subscriptions.get(safePath);
                if (!currentSub) return;
                currentSub.lastData = val as T;
                currentSub.hasValue = true;
                currentSub.callbacks.forEach(cb => cb(val as T));
              }, fsErrorHandler);
            }
            sub.nativeUnsubscribe = unsub;
          } catch(e: any) {
            console.error('FirebaseListenerManager Firestore attach error:', e);
          }
        }
      } else {
        const db = getDB();
        if (db) {
          try {
            const dbRef = ref(db, safePath);
            const nativeUnsub = onValue(
              dbRef,
              (snapshot) => {
                const currentSub = this.subscriptions.get(safePath);
                if (!currentSub) return;
                const val = snapshot.exists() ? (snapshot.val() as T) : null;
                currentSub.lastData = val;
                currentSub.hasValue = true;
                currentSub.callbacks.forEach((cb) => {
                  try {
                    cb(val);
                  } catch (err) {
                    console.error(`FirebaseListenerManager callback error on path [${safePath}]:`, err);
                  }
                });
              },
              (error) => {
                console.error(`FirebaseListenerManager error on path [${safePath}]:`, error);
                if (onError) onError(error);
              }
            );
            sub.nativeUnsubscribe = nativeUnsub;
          } catch (err) {
            console.error(`FirebaseListenerManager failed to attach listener for path [${safePath}]:`, err);
          }
        }
      }
    }

    sub.callbacks.set(callbackId, callback);
    if (sub.hasValue) {
      try {
        callback(sub.lastData);
      } catch (err) {
        console.error(`FirebaseListenerManager cached delivery error on path [${safePath}]:`, err);
      }
    }
    return () => {
      this.unsubscribe(safePath, callbackId);
    };
  }

  /**
   * Reuses an existing subscription path or attaches a new listener.
   * Useful for explicitly reusing path subscriptions across modules.
   */
  public reuse<T = any>(
    pathStr: string,
    callback: ListenerCallback<T>,
    onError?: (error: Error) => void
  ): () => void {
    return this.subscribe<T>(pathStr, callback, onError);
  }

  /**
   * Unsubscribes a specific callback from a path using path and callbackId or function reference.
   * If callback count reaches zero, native Firebase subscription is detached.
   */
  public unsubscribe(pathStr: string, callbackTarget: string | ListenerCallback): void {
    const safePath = sanitizeRTDBPath(pathStr);
    const sub = this.subscriptions.get(safePath);
    if (!sub) return;

    if (typeof callbackTarget === 'string') {
      sub.callbacks.delete(callbackTarget);
    } else {
      for (const [id, cb] of sub.callbacks.entries()) {
        if (cb === callbackTarget) {
          sub.callbacks.delete(id);
          break;
        }
      }
    }

    if (sub.callbacks.size === 0) {
      if (sub.nativeUnsubscribe) {
        try {
          sub.nativeUnsubscribe();
        } catch (e) {
          console.warn(`FirebaseListenerManager native unsubscribe error for path [${safePath}]:`, e);
        }
      }
      this.subscriptions.delete(safePath);
    }
  }

  /**
   * Returns whether there is an active native subscription for a path.
   */
  public isSubscribed(pathStr: string): boolean {
    const safePath = sanitizeRTDBPath(pathStr);
    const sub = this.subscriptions.get(safePath);
    return !!sub && sub.callbacks.size > 0;
  }

  /**
   * Returns the subscriber count for a path.
   */
  public getListenerCount(pathStr: string): number {
    const safePath = sanitizeRTDBPath(pathStr);
    return this.subscriptions.get(safePath)?.callbacks.size || 0;
  }

  /**
   * Clear all active listeners (e.g., when resetting session).
   */
  public clearAll(): void {
    this.subscriptions.forEach((sub, path) => {
      if (sub.nativeUnsubscribe) {
        try {
          sub.nativeUnsubscribe();
        } catch (e) {
          // ignore
        }
      }
    });
    this.subscriptions.clear();
  }
}

export const firebaseListenerManager = FirebaseListenerManager.getInstance();

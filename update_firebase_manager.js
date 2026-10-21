const fs = require('fs');

const path = 'src/services/FirebaseListenerManager.ts';
let content = fs.readFileSync(path, 'utf8');

// Add getFirestoreDB
content = content.replace(
  "import { getDB, sanitizeRTDBPath } from '../lib/firebaseService';",
  "import { getDB, getFirestoreDB, sanitizeRTDBPath } from '../lib/firebaseService';"
);

const MIGRATED_COLS = "['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders']";

const newSubscribe = `
  public subscribe<T = any>(
    pathStr: string,
    callback: ListenerCallback<T>,
    onError?: (error: Error) => void
  ): () => void {
    const safePath = sanitizeRTDBPath(pathStr);
    const callbackId = \`cb_\${++this.callbackIdCounter}\`;

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
      const isFirestore = ${MIGRATED_COLS}.includes(parts[0]);

      if (isFirestore) {
        const fsDb = getFirestoreDB();
        if (fsDb) {
          try {
            let unsub;
            if (parts.length === 1) {
              unsub = onSnapshot(collection(fsDb, parts[0]), (snapshot) => {
                const val: any = {};
                snapshot.forEach(doc => { val[doc.id] = doc.data(); });
                const currentSub = this.subscriptions.get(safePath);
                if (!currentSub) return;
                currentSub.lastData = val as T;
                currentSub.hasValue = true;
                currentSub.callbacks.forEach(cb => cb(val as T));
              }, onError);
            } else {
              unsub = onSnapshot(doc(fsDb, parts[0], parts.slice(1).join('/')), (snapshot) => {
                const val = snapshot.exists() ? snapshot.data() : null;
                const currentSub = this.subscriptions.get(safePath);
                if (!currentSub) return;
                currentSub.lastData = val as T;
                currentSub.hasValue = true;
                currentSub.callbacks.forEach(cb => cb(val as T));
              }, onError);
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
                    console.error(\`FirebaseListenerManager callback error on path [\${safePath}]:\`, err);
                  }
                });
              },
              (error) => {
                console.error(\`FirebaseListenerManager error on path [\${safePath}]:\`, error);
                if (onError) onError(error);
              }
            );
            sub.nativeUnsubscribe = nativeUnsub;
          } catch (err) {
            console.error(\`FirebaseListenerManager failed to attach listener for path [\${safePath}]:\`, err);
          }
        }
      }
    }

    sub.callbacks.set(callbackId, callback);
    if (sub.hasValue) {
      try {
        callback(sub.lastData);
      } catch (err) {
        console.error(\`FirebaseListenerManager cached delivery error on path [\${safePath}]:\`, err);
      }
    }
    return () => {
      this.unsubscribe(safePath, callbackId);
    };
  }
`;

content = content.replace(/public subscribe<T = any>[\s\S]*?return \(\) => \{\s*this\.unsubscribe\(safePath, callbackId\);\s*\};\s*\}/, newSubscribe.trim());
fs.writeFileSync(path, content);

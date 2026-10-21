import { doc, collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getFirestoreDB } from './firebaseService';
import { removeUndefined, getProjectTotalUnits } from './firebaseService';
import { EstimateItem, EstimateGroup } from '../../types';
import { ref, update, get } from 'firebase/database';
import { getDB } from './firebaseService';

export const recalculateCumulativeChain = async (
  materialId: string,
  newInitialQty: number,
  reason: string
): Promise<void> => {
  const db = getDB();
  if (!db) throw new Error("Chưa kết nối Firebase");
  const fsDb2 = getFirestoreDB();

  // Fetch all needed data with fallback to RTDB
  let estimateItems: EstimateItem[] = [];
  let estimateGroups: EstimateGroup[] = [];
  let bm06Orders: any[] = [];

  

  if (estimateItems.length === 0 && db) {
    try {
      const fsDb = getFirestoreDB();
      if (fsDb) {
        const itemsSnap = await getDocs(collection(fsDb, 'estimateItems'));
        const val: any = {};
        itemsSnap.forEach(d => { val[d.id] = d.data(); });
        estimateItems = Object.keys(val).map(k => ({ id: k, ...val[k] }));
        
        const grpSnap = await getDocs(collection(fsDb, 'estimateGroups'));
        const grpVal: any = {};
        grpSnap.forEach(d => { grpVal[d.id] = d.data(); });
        estimateGroups = Object.keys(grpVal).map(k => ({ ...grpVal[k], groupId: k, id: k }));

        const ordersSnap = await getDocs(collection(fsDb, 'bm06Orders'));
        const ordersVal: any = {};
        ordersSnap.forEach(d => { ordersVal[d.id] = d.data(); });
        bm06Orders = Object.keys(ordersVal).map(k => ({ id: k, ...ordersVal[k] }));
      }
    } catch (rtdbErr) {
      console.warn("RTDB fetch in recalculateCumulativeChain failed:", rtdbErr);
    }
  }

  const targetMaterial = estimateItems.find(i => i.id === materialId);
  if (!targetMaterial) throw new Error("Không tìm thấy vật tư");

  const { projectId, unitId } = targetMaterial;
  const oldInitialQty = targetMaterial.initialCumulativeQty || 0;

  // Log the adjustment
  let performedBy = 'Khách';
  try {
    const uStr = localStorage.getItem('currentUser');
    if (uStr) {
      const u = JSON.parse(uStr);
      performedBy = u.username || 'Khách';
    }
  } catch (e) {}
  
  

  // Find all orders for this project and unit
  const orders = bm06Orders.filter(o => {
    if (o.projectId === projectId && o.unitId === unitId) return true;
    const items = o.selectedItems || o.rows || [];
    return items.some((it: any) => (it.projectId || o.projectId) === projectId && (it.unitId || o.unitId) === unitId);
  });

  // Sort chronologically
  const sortedOrders = orders.sort((a, b) => {
    const dateA = a.orderDate || '';
    const dateB = b.orderDate || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const getComparableTime = (val: any): number => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = Date.parse(val);
        return isNaN(parsed) ? 0 : parsed;
      }
      if (val && typeof val === 'object') {
        if (typeof val.seconds === 'number') return val.seconds * 1000 + (val.nanoseconds || 0) / 1000000;
        if (typeof val.getTime === 'function') return val.getTime();
      }
      return 0;
    };
    const tA = getComparableTime(a.createdAt);
    const tB = getComparableTime(b.createdAt);
    if (tA !== tB) return tA - tB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const orderQtySumMap = new Map<string, number>();
  const groupOrderQtySumMap = new Map<string, number>();

  orders.forEach(order => {
    const itemsList = order.allocations && order.allocations.length > 0 ? order.allocations : (order.selectedItems || order.rows || []);
    itemsList.forEach((it: any) => {
      const pId = it.projectId || order.projectId;
      const uId = it.unitId || order.unitId;
      if (pId === projectId && uId === unitId) {
        const key = `${pId}::${uId}::${(it.name || '').toLowerCase().trim()}`;
        orderQtySumMap.set(key, (orderQtySumMap.get(key) || 0) + (Number(it.orderQty) || 0));
        
        const estMatch = estimateItems.find(e => e.projectId === pId && e.unitId === uId && e.name.toLowerCase().trim() === (it.name || '').toLowerCase().trim());
        const groupId = it.groupId || estMatch?.groupId || '';
        const isGrouped = it.isGroupedEstimate || estMatch?.isGroupedEstimate || !!groupId;
        if (isGrouped && groupId) {
          groupOrderQtySumMap.set(groupId, (groupOrderQtySumMap.get(groupId) || 0) + (Number(it.orderQty) || 0));
        }
      }
    });
  });

  const itemCumTracker = new Map<string, number>();
  estimateItems.forEach(est => {
    const key = `${est.projectId}::${est.unitId}::${est.name?.toLowerCase().trim()}`;
    const dbCum = Number((est.isGroupedEstimate && est.itemCumulativeQty !== undefined) ? est.itemCumulativeQty : (est.cumulativeQty || (est as any).cumulativeQtyOld || 0));
    const totalOrder = orderQtySumMap.get(key) || 0;
    let startCum = est.initialCumulativeQty !== undefined ? est.initialCumulativeQty : Math.max(0, dbCum - totalOrder);
    if (est.id === materialId) startCum = newInitialQty;
    itemCumTracker.set(key, startCum);
  });

  const groupCumTracker = new Map<string, number>();
  estimateGroups.forEach(grp => {
    let startGroupCum = 0;
    estimateItems.forEach(est => {
      if (est.groupId === grp.groupId) {
         const key = `${est.projectId}::${est.unitId}::${est.name?.toLowerCase().trim()}`;
         startGroupCum += itemCumTracker.get(key) || 0;
      }
    });
    groupCumTracker.set(grp.groupId, startGroupCum);
  });

  
  const rtdbUpdates: any = {};
  const updatedOrders = new Set<string>();

  sortedOrders.forEach(order => {
    let orderChanged = false;
    const itemsList = order.selectedItems || order.rows || [];
    const newItemsList = itemsList.map((it: any) => {
      const pId = it.projectId || order.projectId;
      const uId = it.unitId || order.unitId;
      if (pId === projectId && uId === unitId) {
        const estMatch = estimateItems.find(e => e.projectId === pId && e.unitId === uId && e.name.toLowerCase().trim() === (it.name || '').toLowerCase().trim());
        const groupId = it.groupId || estMatch?.groupId || '';
        const isGrouped = it.isGroupedEstimate || estMatch?.isGroupedEstimate || !!groupId;
        const estQty = Number(it.estimatedQty || estMatch?.estimatedQty || 0);

        const key = `${pId}::${uId}::${(it.name || '').toLowerCase().trim()}`;
        const prevItemCum = itemCumTracker.get(key) || 0;
        const orderQty = Number(it.orderQty) || 0;
        const newItemCum = prevItemCum + orderQty;
        itemCumTracker.set(key, newItemCum);

        let finalIt = { ...it };

        if (isGrouped && groupId) {
          const groupEstMatch = estimateGroups.find(g => g.groupId === groupId);
          const grpEstQty = Number(groupEstMatch?.estimatedQty || ((it as any).groupEstimatedQty) || ((estMatch as any)?.groupEstimatedQty) || estQty);
          const prevGroupCum = groupCumTracker.get(groupId) || 0;
          const newGroupCum = prevGroupCum + orderQty;
          groupCumTracker.set(groupId, newGroupCum);

          finalIt.groupCumulativeBefore = prevGroupCum;
          finalIt.groupRemainingBefore = grpEstQty - prevGroupCum;
          finalIt.groupCumulativeAfter = newGroupCum;
          finalIt.groupRemainingAfter = grpEstQty - newGroupCum;
          
          finalIt.itemCumulativeBefore = prevItemCum;
          finalIt.itemCumulativeAfter = newItemCum;
          finalIt.cumulativeQtyOld = prevItemCum;
          finalIt.cumulativeBefore = prevItemCum;
          finalIt.cumulativeAfter = newItemCum;
          finalIt.remainingQtyOld = estQty - prevItemCum;
          finalIt.remainingBefore = estQty - prevItemCum;
          finalIt.remainingAfter = estQty - newItemCum;
        } else {
          finalIt.cumulativeQtyOld = prevItemCum;
          finalIt.cumulativeBefore = prevItemCum;
          finalIt.itemCumulativeBefore = prevItemCum;
          finalIt.itemCumulativeAfter = newItemCum;
          finalIt.cumulativeAfter = newItemCum;
          finalIt.remainingQtyOld = estQty - prevItemCum;
          finalIt.remainingBefore = estQty - prevItemCum;
          finalIt.remainingAfter = estQty - newItemCum;
        }
        orderChanged = true;
        return finalIt;
      }
      return it;
    });

    if (orderChanged && order.id) {
      if (order.selectedItems) {
        
        rtdbUpdates[`bm06Orders/${order.id}/selectedItems`] = newItemsList;
      } else if (order.rows) {
        
        rtdbUpdates[`bm06Orders/${order.id}/rows`] = newItemsList;
      }
      updatedOrders.add(order.id);
    }
  });

  estimateItems.forEach(est => {
    if (est.projectId === projectId && est.unitId === unitId) {
      const key = `${est.projectId}::${est.unitId}::${est.name?.toLowerCase().trim()}`;
      const finalCum = itemCumTracker.get(key) || 0;
      let updates: any = {};
      if (est.id === materialId) {
        updates.initialCumulativeQty = newInitialQty;
      }
      if (est.isGroupedEstimate) {
        updates.itemCumulativeQty = finalCum;
      } else {
        updates.cumulativeQty = finalCum;
        updates.remainingQty = Number(est.estimatedQty) - finalCum;
      }
      
      if (updates.initialCumulativeQty !== undefined) rtdbUpdates[`estimateItems/${est.id}/initialCumulativeQty`] = updates.initialCumulativeQty;
      if (updates.itemCumulativeQty !== undefined) rtdbUpdates[`estimateItems/${est.id}/itemCumulativeQty`] = updates.itemCumulativeQty;
      if (updates.cumulativeQty !== undefined) rtdbUpdates[`estimateItems/${est.id}/cumulativeQty`] = updates.cumulativeQty;
      if (updates.remainingQty !== undefined) rtdbUpdates[`estimateItems/${est.id}/remainingQty`] = updates.remainingQty;
    }
  });

  estimateGroups.forEach(grp => {
    if (grp.projectId === projectId && grp.unitId === unitId) {
      const finalGroupCum = groupCumTracker.get(grp.groupId) || 0;
      rtdbUpdates[`estimateGroups/${grp.groupId}/cumulativeQty`] = finalGroupCum;
      rtdbUpdates[`estimateGroups/${grp.groupId}/remainingQty`] = Number(grp.estimatedQty) - finalGroupCum;
    }
  });

  if (Object.keys(rtdbUpdates).length > 0) {
    
    
    if (fsDb2) {
      for (const [k, v] of Object.entries(rtdbUpdates)) {
        const parts = k.split('/');
        if (['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'].includes(parts[0])) {
           if (parts.length > 1) {
             const docId = parts[1];
             const restPath = parts.slice(2).join('.');
             if (restPath) {
               await updateDoc(doc(fsDb2, parts[0], docId), { [restPath]: v });
             } else {
               await setDoc(doc(fsDb2, parts[0], docId), v, { merge: true });
             }
           }
           delete rtdbUpdates[k];
        }
      }
    }
    
    const fsDb = getFirestoreDB();
    if (fsDb && Object.keys(rtdbUpdates).length > 0) {
       for (const key of Object.keys(rtdbUpdates)) {
         const parts = key.split('/');
         const col = parts[0];
         const docId = parts[1];
         const fieldPath = parts.slice(2).join('.');
         
         const isFirestore = ['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders', 'bbntOrders', 'projects', 'lichSu'].includes(col);
         
         if (isFirestore) {
            const val = rtdbUpdates[key];
            if (parts.length === 2) {
               if (val === null) await deleteDoc(doc(fsDb, col, docId));
               else await setDoc(doc(fsDb, col, docId), val, { merge: true });
            } else if (parts.length > 2) {
               if (val === null) {
                  // Ignore nested null update for simplicity or handle it:
                  const updateObj = {}; updateObj[fieldPath] = null;
                  await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
               } else {
                  const updateObj = {}; updateObj[fieldPath] = val;
                  await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
               }
            }
         } else {
            const tempDb = getDB();
            if (tempDb) {
               const rUpdate = {};
               rUpdate[key] = rtdbUpdates[key];
               await update(ref(tempDb), rUpdate);
            }
         }
       }
    }


  }
};

export const recalculateAllOrdersChain = async (): Promise<void> => {
  const fsDb2 = getFirestoreDB();
  const db = getDB();
  if (!db) return;

  let estimateItems: any[] = [];
  let estimateGroups: any[] = [];
  let bm06Orders: any[] = [];

  

  if (estimateItems.length === 0 && db) {
    try {
      if (fsDb2) {
        const itemsSnap = await getDocs(collection(fsDb2, 'estimateItems'));
        const val: any = {};
        itemsSnap.forEach(d => { val[d.id] = d.data(); });
        estimateItems = Object.keys(val).map(k => ({ id: k, ...val[k] }));

        const grpSnap = await getDocs(collection(fsDb2, 'estimateGroups'));
        const grpVal: any = {};
        grpSnap.forEach(d => { grpVal[d.id] = d.data(); });
        estimateGroups = Object.keys(grpVal).map(k => ({ ...grpVal[k], groupId: k, id: k }));

        const ordersSnap = await getDocs(collection(fsDb2, 'bm06Orders'));
        const ordersVal: any = {};
        ordersSnap.forEach(d => { ordersVal[d.id] = d.data(); });
        bm06Orders = Object.keys(ordersVal).map(k => ({ id: k, ...ordersVal[k] }));
      }
    } catch (rtdbErr) {
      console.warn("RTDB fetch in recalculateAllOrdersChain failed:", rtdbErr);
    }
  }

  const sortedOrders = bm06Orders.sort((a, b) => {
    const dateA = a.orderDate || '';
    const dateB = b.orderDate || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const getComparableTime = (val: any): number => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = Date.parse(val);
        return isNaN(parsed) ? 0 : parsed;
      }
      if (val && typeof val === 'object') {
        if (typeof val.seconds === 'number') return val.seconds * 1000 + (val.nanoseconds || 0) / 1000000;
        if (typeof val.getTime === 'function') return val.getTime();
      }
      return 0;
    };
    const tA = getComparableTime(a.createdAt);
    const tB = getComparableTime(b.createdAt);
    if (tA !== tB) return tA - tB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  // 1. Calculate total order qty per item
  const orderQtySumMap = new Map<string, number>();
  sortedOrders.forEach(order => {
    const itemsList = order.selectedItems || order.rows || [];
    itemsList.forEach((it: any) => {
      const pId = it.projectId || order.projectId;
      const uId = it.unitId || order.unitId;
      const key = `${pId}::${uId}::${(it.name || '').toLowerCase().trim()}`;
      orderQtySumMap.set(key, (orderQtySumMap.get(key) || 0) + (Number(it.orderQty) || 0));
    });
  });

  // 2. Initialize itemCumTracker
  const itemCumTracker = new Map<string, number>();
  estimateItems.forEach(est => {
    const key = `${est.projectId}::${est.unitId}::${est.name?.toLowerCase().trim()}`;
    const dbCum = Number((est.isGroupedEstimate || !!est.groupId) ? (est.itemCumulativeQty || 0) : (est.cumulativeQty || (est as any).cumulativeQtyOld || 0));
    const totalOrder = orderQtySumMap.get(key) || 0;
    
    // If initialCumulativeQty is explicitly defined, use it.
    // Otherwise, infer it as (Current Cumulative - Total Orders) to preserve any manual adjustments.
    let startCum = est.initialCumulativeQty !== undefined ? 
      Number(est.initialCumulativeQty) : 
      Math.max(0, dbCum - totalOrder);
      
    itemCumTracker.set(key, startCum);
  });

  // 3. Initialize groupCumTracker
  const groupCumTracker = new Map<string, number>();
  estimateGroups.forEach(grp => {
    let startGroupCum = 0;
    estimateItems.forEach(est => {
      if (est.groupId === grp.groupId) {
         const key = `${est.projectId}::${est.unitId}::${est.name?.toLowerCase().trim()}`;
         startGroupCum += itemCumTracker.get(key) || 0;
      }
    });
    groupCumTracker.set(grp.groupId, startGroupCum);
  });

  
  const rtdbUpdates: any = {};
  
  let bm02OrdersMap = new Map();
  

  const MAX_BATCH_OPS = 400;
  let opsCount = 0;
  

  const commitBatchIfFull = async () => {
    
  };

  sortedOrders.forEach(order => {
    let orderChanged = false;
    let bm02Changed = false;
    const itemsList = order.selectedItems || order.rows || [];
    const newItemsList = itemsList.map((it: any) => {
      const pId = it.projectId || order.projectId;
      const uId = it.unitId || order.unitId;
      const estMatch = estimateItems.find(e => e.projectId === pId && e.unitId === uId && e.name.toLowerCase().trim() === (it.name || '').toLowerCase().trim());
      const groupId = it.groupId || estMatch?.groupId || '';
      const isGrouped = it.isGroupedEstimate || estMatch?.isGroupedEstimate || !!groupId;
      const estQty = Number(it.estimatedQty || estMatch?.estimatedQty || 0);

      const key = `${pId}::${uId}::${(it.name || '').toLowerCase().trim()}`;
      
      const prevItemCum = itemCumTracker.get(key) || 0;
      const orderQty = Number(it.orderQty) || 0;
      const newItemCum = prevItemCum + orderQty;
      itemCumTracker.set(key, newItemCum);

      let finalIt = { ...it };

      if (isGrouped && groupId) {
        const groupEstMatch = estimateGroups.find(g => g.groupId === groupId);
        const grpEstQty = Number(groupEstMatch?.estimatedQty || ((it as any).groupEstimatedQty) || ((estMatch as any)?.groupEstimatedQty) || estQty);
        
        const prevGroupCum = groupCumTracker.get(groupId) || 0;
        const newGroupCum = prevGroupCum + orderQty;
        groupCumTracker.set(groupId, newGroupCum);

        finalIt.groupCumulativeBefore = prevGroupCum;
        finalIt.groupRemainingBefore = grpEstQty - prevGroupCum;
        finalIt.groupCumulativeAfter = newGroupCum;
        finalIt.groupRemainingAfter = grpEstQty - newGroupCum;
        
        finalIt.itemCumulativeBefore = prevItemCum;
        finalIt.itemCumulativeAfter = newItemCum;
        finalIt.cumulativeQtyOld = prevItemCum;
        finalIt.cumulativeBefore = prevItemCum;
        finalIt.cumulativeAfter = newItemCum;
        finalIt.remainingQtyOld = estQty - prevItemCum;
        finalIt.remainingBefore = estQty - prevItemCum;
        finalIt.remainingAfter = estQty - newItemCum;
      } else {
        finalIt.cumulativeQtyOld = prevItemCum;
        finalIt.cumulativeBefore = prevItemCum;
        finalIt.itemCumulativeBefore = prevItemCum;
        finalIt.itemCumulativeAfter = newItemCum;
        finalIt.cumulativeAfter = newItemCum;
        finalIt.remainingQtyOld = estQty - prevItemCum;
        finalIt.remainingBefore = estQty - prevItemCum;
        finalIt.remainingAfter = estQty - newItemCum;
      }

      if (
        finalIt.cumulativeQtyOld !== it.cumulativeQtyOld ||
        finalIt.cumulativeAfter !== it.cumulativeAfter ||
        finalIt.remainingQtyOld !== it.remainingQtyOld ||
        finalIt.remainingAfter !== it.remainingAfter ||
        finalIt.itemCumulativeBefore !== it.itemCumulativeBefore ||
        finalIt.itemCumulativeAfter !== it.itemCumulativeAfter ||
        finalIt.groupCumulativeBefore !== it.groupCumulativeBefore ||
        finalIt.groupCumulativeAfter !== it.groupCumulativeAfter
      ) {
        orderChanged = true;
      }
      return finalIt;
    });

    if (orderChanged && order.id) {
      if (order.selectedItems) {
        
        rtdbUpdates[`bm06Orders/${order.id}/selectedItems`] = newItemsList;
        opsCount++;

        const bm02Id = order.id.replace('BM06-', 'BM02-');
        const bm02Order = bm02OrdersMap.get(bm02Id);
        if (bm02Order && bm02Order.items) {
          const newBm02Items = bm02Order.items.map((it:any) => {
            const match = newItemsList.find((x:any) => x.name === it.name && (x.projectId || order.projectId) === (it.projectId || bm02Order.projectId) && (x.unitId || order.unitId) === (it.unitId || bm02Order.unitId));
            if (match) {
              const isGrouped = match.isGroupedEstimate || !!match.groupId;
              return {
                ...it,
                duToanQty: isGrouped ? match.groupEstimatedQty : match.estimatedQty,
                luyKeQty: isGrouped ? match.itemCumulativeBefore : match.cumulativeQtyOld,
                itemCumulativeBefore: match.itemCumulativeBefore,
                itemCumulativeAfter: match.itemCumulativeAfter,
                groupCumulativeBefore: match.groupCumulativeBefore,
                groupRemainingBefore: match.groupRemainingBefore,
                groupCumulativeAfter: match.groupCumulativeAfter,
                groupRemainingAfter: match.groupRemainingAfter,
                groupEstimatedQty: match.groupEstimatedQty,
              };
            }
            return it;
          });
          
          rtdbUpdates[`bm02Orders/${bm02Id}/items`] = newBm02Items;
          opsCount++;
        }

      } else if (order.rows) {
        
        rtdbUpdates[`bm06Orders/${order.id}/rows`] = newItemsList;
        opsCount++;
      }
    }
  });

  await commitBatchIfFull();

  estimateItems.forEach(est => {
    const key = `${est.projectId}::${est.unitId}::${est.name?.toLowerCase().trim()}`;
    const finalCum = itemCumTracker.get(key) || 0;
    
    const currItemCum = Number(est.itemCumulativeQty) || 0;
    const currCum = Number(est.cumulativeQty) || 0;
    const isGrouped = est.isGroupedEstimate || !!est.groupId;
    
    if ((isGrouped && finalCum !== currItemCum) || (!isGrouped && finalCum !== currCum)) {
      let updates: any = {};
      
      console.log(`[recalculateAllOrdersChain] Vật tư "${est.name}" (ID: ${est.id}):`);
      console.log(`  - Trước khi tính lại: Dự toán = ${est.estimatedQty}, Lũy kế = ${isGrouped ? currItemCum : currCum}, Còn lại = ${isGrouped ? '-' : (Number(est.estimatedQty) - currCum)}`);

      if (isGrouped) {
        updates.itemCumulativeQty = finalCum;
        console.log(`  - Sau khi tính lại (Grouped): Lũy kế riêng mới = ${finalCum}`);
      } else {
        updates.cumulativeQty = finalCum;
        updates.remainingQty = Number(est.estimatedQty) - finalCum;
        console.log(`  - Sau khi tính lại: Lũy kế mới = ${finalCum}, Còn lại mới = ${updates.remainingQty}`);
      }

      
      opsCount++;
      
      if (updates.itemCumulativeQty !== undefined) rtdbUpdates[`estimateItems/${est.id}/itemCumulativeQty`] = updates.itemCumulativeQty;
      if (updates.cumulativeQty !== undefined) rtdbUpdates[`estimateItems/${est.id}/cumulativeQty`] = updates.cumulativeQty;
      if (updates.remainingQty !== undefined) rtdbUpdates[`estimateItems/${est.id}/remainingQty`] = updates.remainingQty;
    }
  });

  await commitBatchIfFull();

  estimateGroups.forEach(grp => {
    const finalGroupCum = groupCumTracker.get(grp.groupId) || 0;
    const currGroupCum = Number(grp.cumulativeQty) || 0;
    
    if (finalGroupCum !== currGroupCum) {
      rtdbUpdates[`estimateGroups/${grp.groupId}/cumulativeQty`] = finalGroupCum;
      rtdbUpdates[`estimateGroups/${grp.groupId}/remainingQty`] = Number(grp.estimatedQty) - finalGroupCum;
    }
  });

  if (Object.keys(rtdbUpdates).length > 0) {
    
    
    if (fsDb2) {
      for (const [k, v] of Object.entries(rtdbUpdates)) {
        const parts = k.split('/');
        if (['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'].includes(parts[0])) {
           if (parts.length > 1) {
             const docId = parts[1];
             const restPath = parts.slice(2).join('.');
             if (restPath) {
               await updateDoc(doc(fsDb2, parts[0], docId), { [restPath]: v });
             } else {
               await setDoc(doc(fsDb2, parts[0], docId), v, { merge: true });
             }
           }
           delete rtdbUpdates[k];
        }
      }
    }
    
    const fsDb = getFirestoreDB();
    if (fsDb && Object.keys(rtdbUpdates).length > 0) {
       for (const key of Object.keys(rtdbUpdates)) {
         const parts = key.split('/');
         const col = parts[0];
         const docId = parts[1];
         const fieldPath = parts.slice(2).join('.');
         
         const isFirestore = ['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders', 'bbntOrders', 'projects', 'lichSu'].includes(col);
         
         if (isFirestore) {
            const val = rtdbUpdates[key];
            if (parts.length === 2) {
               if (val === null) await deleteDoc(doc(fsDb, col, docId));
               else await setDoc(doc(fsDb, col, docId), val, { merge: true });
            } else if (parts.length > 2) {
               if (val === null) {
                  // Ignore nested null update for simplicity or handle it:
                  const updateObj = {}; updateObj[fieldPath] = null;
                  await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
               } else {
                  const updateObj = {}; updateObj[fieldPath] = val;
                  await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
               }
            }
         } else {
            const tempDb = getDB();
            if (tempDb) {
               const rUpdate = {};
               rUpdate[key] = rtdbUpdates[key];
               await update(ref(tempDb), rUpdate);
            }
         }
       }
    }


  }

  // Also recalculate CHI PHÍ DỰ ÁN items and their distributed DETAIL records
  await recalculateProjectSharedItems();
};

export const recalculateProjectSharedItems = async (
  targetProjectId?: string,
  targetMaterialName?: string
): Promise<void> => {
  const db = getDB();
  if (!db) return;

  let bm06OrdersMap: Record<string, any> = {};
  try {
    const ordersSnap = await get(ref(db, 'bm06Orders'));
    if (ordersSnap.exists()) {
      bm06OrdersMap = ordersSnap.val() || {};
    }
  } catch (err) {
    console.warn("RTDB bm06Orders fetch error in recalculateProjectSharedItems:", err);
  }

  let bm06Orders: any[] = Object.keys(bm06OrdersMap).map(k => ({ id: k, ...bm06OrdersMap[k] }));

  

  let estimateItemsMap: Record<string, any> = {};
  try {
    const itemsSnap = await get(ref(db, 'estimateItems'));
    if (itemsSnap.exists()) {
      estimateItemsMap = itemsSnap.val() || {};
    }
  } catch (err) {
    console.warn("RTDB estimateItems fetch error in recalculateProjectSharedItems:", err);
  }

  let estimateItems: any[] = Object.keys(estimateItemsMap).map(k => ({ id: k, ...estimateItemsMap[k] }));

  

  const calculateWarning = (est: number, cum: number): 'NORMAL' | 'WARNING_90' | 'EXCEEDED' => {
    if (est <= 0) return 'NORMAL';
    if (cum > est) return 'EXCEEDED';
    if (cum >= est * 0.9) return 'WARNING_90';
    return 'NORMAL';
  };

  const masterItems = estimateItems.filter(item => {
    const isMaster = item.unitId === 'PROJECT_SHARED' || item.sourceType === 'PROJECT_COST' || (item.isProjectShared && item.unitId === 'PROJECT_SHARED');
    if (!isMaster) return false;
    if (targetProjectId && item.projectId !== targetProjectId) return false;
    if (targetMaterialName && (item.name || '').trim().toLowerCase() !== targetMaterialName.trim().toLowerCase()) return false;
    return true;
  });

  if (masterItems.length === 0) return;

  const rtdbUpdates: Record<string, any> = {};
  const nowTimestamp = Date.now();

  for (const master of masterItems) {
    const projectId = master.projectId;
    const pSharedId = master.projectSharedId || master.id;
    const masterNameNormalized = (master.name || '').trim().toLowerCase();

    const totalProjectUnits = getProjectTotalUnits(projectId) || Number(master.totalProjectUnits) || 1;

    // Filter matching BM06 orders
    const matchingOrders = bm06Orders.filter(ord => {
      const ordProjId = ord.projectId;
      const itemsList = ord.selectedItems || ord.rows || ord.allocations || [];
      return itemsList.some((it: any) => {
        const itemProjId = it.projectId || ordProjId;
        if (itemProjId !== projectId) return false;
        const isShared = it.isProjectShared || it.unitId === 'PROJECT_SHARED' || it.sourceType === 'PROJECT_COST' || it.sourceType === 'PROJECT_SHARED_DISTRIBUTED';
        const matchName = (it.name || '').trim().toLowerCase() === masterNameNormalized;
        const matchSharedId = pSharedId && it.projectSharedId === pSharedId;
        const matchItemId = (it.estimateItemId === master.id) || (it.id === master.id);
        return matchItemId || matchName || matchSharedId || (isShared && matchName);
      });
    });

    // Sort chronologically by orderDate, then createdAt
    matchingOrders.sort((a, b) => {
      const dateA = a.orderDate || a.proposerDate || '';
      const dateB = b.orderDate || b.proposerDate || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const getComparableTime = (val: any): number => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const parsed = Date.parse(val);
          return isNaN(parsed) ? 0 : parsed;
        }
        if (val && typeof val === 'object') {
          if (typeof val.seconds === 'number') return val.seconds * 1000 + (val.nanoseconds || 0) / 1000000;
          if (typeof val.getTime === 'function') return val.getTime();
        }
        return 0;
      };
      const tA = getComparableTime(a.createdAt);
      const tB = getComparableTime(b.createdAt);
      if (tA !== tB) return tA - tB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    // Calculate total MASTER order quantity
    let totalMasterOrderQty = 0;
    matchingOrders.forEach(ord => {
      const itemsList = ord.selectedItems || ord.rows || ord.allocations || [];
      itemsList.forEach((it: any) => {
        const itemProjId = it.projectId || ord.projectId;
        if (itemProjId === projectId) {
          const isShared = it.isProjectShared || it.unitId === 'PROJECT_SHARED' || it.sourceType === 'PROJECT_COST' || it.sourceType === 'PROJECT_SHARED_DISTRIBUTED';
          const matchName = (it.name || '').trim().toLowerCase() === masterNameNormalized;
          const matchSharedId = pSharedId && it.projectSharedId === pSharedId;
          const matchItemId = (it.estimateItemId === master.id) || (it.id === master.id);
          
          // If the order item name exactly matches the master PROJECT_SHARED item name in the same project, 
          // we count it towards the master's cumulative total, even if older records miss the isProjectShared flag.
          if (matchItemId || matchName || matchSharedId || (isShared && matchName)) {
            totalMasterOrderQty += Number(it.orderQty) || 0;
          }
        }
      });
    });

    const masterEstQty = Number(master.estimatedQty) || 0;
    const masterInitCum = Number(master.initialCumulativeQty) || 0;
    const masterCumQty = masterInitCum + totalMasterOrderQty;
    const masterRemQty = masterEstQty - masterCumQty;

    // Process history to calculate allocated Đặt kỳ này per unit
    const unitPeriodQtyAccum = new Map<string, number>();

    matchingOrders.forEach(ord => {
      const itemsList = ord.selectedItems || ord.rows || ord.allocations || [];
      const matchingRow = itemsList.find((it: any) => {
        const itemProjId = it.projectId || ord.projectId;
        if (itemProjId !== projectId) return false;
        const isShared = it.isProjectShared || it.unitId === 'PROJECT_SHARED' || it.sourceType === 'PROJECT_COST' || it.sourceType === 'PROJECT_SHARED_DISTRIBUTED';
        const matchName = (it.name || '').trim().toLowerCase() === masterNameNormalized;
        const matchSharedId = pSharedId && it.projectSharedId === pSharedId;
        const matchItemId = (it.estimateItemId === master.id) || (it.id === master.id);
        return matchItemId || matchName || matchSharedId || (isShared && matchName);
      });

      if (!matchingRow) return;

      const periodQty = Number(matchingRow.orderQty) || 0;
      if (periodQty <= 0) return;

      let rawUnits: any[] = [];
      if (Array.isArray(matchingRow.applyUnitIds) && matchingRow.applyUnitIds.length > 0) {
        rawUnits = matchingRow.applyUnitIds;
      } else if (Array.isArray(matchingRow.appliedUnits) && matchingRow.appliedUnits.length > 0) {
        rawUnits = matchingRow.appliedUnits;
      } else if (Array.isArray(ord.selectedUnits) && ord.selectedUnits.length > 0) {
        rawUnits = ord.selectedUnits.map((u: any) => typeof u === 'string' ? u : u.unitId);
      } else if (ord.unitId && ord.unitId !== 'PROJECT_SHARED') {
        rawUnits = [ord.unitId];
      }

      const orderSelectedUnits: string[] = [];
      const seenUnits = new Set<string>();
      rawUnits.forEach(u => {
        if (!u) return;
        const uStr = String(u).trim();
        if (uStr && uStr !== 'PROJECT_SHARED' && !seenUnits.has(uStr.toLowerCase())) {
          seenUnits.add(uStr.toLowerCase());
          orderSelectedUnits.push(uStr);
        }
      });

      const numSelected = orderSelectedUnits.length;
      if (numSelected === 0) return;

      let sumAlloc = 0;
      for (let i = 0; i < numSelected; i++) {
        const uId = orderSelectedUnits[i];
        let allocVal = 0;
        if (i < numSelected - 1) {
          allocVal = Math.floor((periodQty / numSelected) * 1000) / 1000;
          sumAlloc += allocVal;
        } else {
          allocVal = Math.round((periodQty - sumAlloc) * 1000) / 1000;
        }

        const currentAccum = unitPeriodQtyAccum.get(uId) || 0;
        unitPeriodQtyAccum.set(uId, Math.round((currentAccum + allocVal) * 1000) / 1000);
      }
    });

    const unitEstQty = Math.round((masterEstQty / totalProjectUnits) * 1000) / 1000;

    const appliedDetailsList: any[] = [];

    const existingDetailItems = estimateItems.filter(it => 
      it.sourceType === 'PROJECT_SHARED_DISTRIBUTED' && 
      ((pSharedId && it.projectSharedId === pSharedId) || (it.projectId === projectId && (it.name || '').trim().toLowerCase() === masterNameNormalized))
    );

    const existingDetailMap = new Map<string, any>();
    const duplicateIdsToRemove: string[] = [];
    existingDetailItems.forEach(it => {
      const normUId = (it.unitId || '').trim().toLowerCase();
      if (existingDetailMap.has(normUId)) {
        duplicateIdsToRemove.push(it.id);
      } else {
        existingDetailMap.set(normUId, it);
      }
    });

    duplicateIdsToRemove.forEach(dupId => {
      rtdbUpdates[`estimateItems/${dupId}`] = null;
    });

    const allDetailUnitIds = new Set<string>();
    unitPeriodQtyAccum.forEach((_, uId) => allDetailUnitIds.add(uId.trim()));
    existingDetailMap.forEach((_, normUId) => {
      const actualItem = existingDetailMap.get(normUId);
      if (actualItem && actualItem.unitId) {
        allDetailUnitIds.add(actualItem.unitId.trim());
      }
    });

    // Update or create DETAIL record for each unit
    allDetailUnitIds.forEach(uId => {
      const normUId = uId.toLowerCase();
      const accumAllocQty = unitPeriodQtyAccum.get(uId) || unitPeriodQtyAccum.get(normUId) || 0;
      const existingDetail = existingDetailMap.get(normUId);

      const cleanUIdKey = String(uId).replace(/[.#$/[\]]/g, '_');
      const unitItemKey = existingDetail?.id || `est_psh_${pSharedId}_${cleanUIdKey}`;

      const unitCumQty = accumAllocQty; // Lũy kế thực tế của căn này
      const unitRemQty = Math.round((unitEstQty - unitCumQty) * 1000) / 1000;
      const unitWarningStatus = calculateWarning(unitEstQty, unitCumQty);

      const unitPayload = {
        id: unitItemKey,
        projectId: projectId,
        unitId: uId,
        code: master.code || existingDetail?.code || '',
        name: master.name,
        unit: master.unit,
        specification: master.specification || existingDetail?.specification || '',
        basePrice: Number(master.basePrice) || 0,
        estimatedQty: unitEstQty,
        cumulativeQty: unitCumQty,
        remainingQty: unitRemQty,
        lastOrderQty: accumAllocQty,
        orderQty: accumAllocQty,
        warningStatus: unitWarningStatus,
        isProjectShared: true,
        sourceType: 'PROJECT_SHARED_DISTRIBUTED',
        createdFrom: 'PROJECT_COST',
        projectSharedId: pSharedId,
        totalProjectUnits: totalProjectUnits,
        createdAt: existingDetail?.createdAt || nowTimestamp,
        updatedAt: nowTimestamp
      };

      rtdbUpdates[`estimateItems/${unitItemKey}`] = unitPayload;

      appliedDetailsList.push({
        unitId: uId,
        estimatedQty: unitEstQty,
        cumulativeQty: unitCumQty,
        remainingQty: unitRemQty,
        lastOrderQty: accumAllocQty,
        warningStatus: unitWarningStatus
      });
    });

    // Update MASTER item
    const masterPayload = {
      ...master,
      estimatedQty: masterEstQty,
      cumulativeQty: masterCumQty,
      remainingQty: masterRemQty,
      totalProjectUnits: totalProjectUnits,
      appliedUnits: Array.from(unitPeriodQtyAccum.keys()),
      appliedUnitsDetails: appliedDetailsList,
      warningStatus: calculateWarning(masterEstQty, masterCumQty),
      updatedAt: nowTimestamp
    };

    rtdbUpdates[`estimateItems/${master.id}`] = masterPayload;
  }

  if (Object.keys(rtdbUpdates).length > 0) {
    
    const fsDb = getFirestoreDB();
    if (fsDb && Object.keys(rtdbUpdates).length > 0) {
       for (const key of Object.keys(rtdbUpdates)) {
         const parts = key.split('/');
         const col = parts[0];
         const docId = parts[1];
         const fieldPath = parts.slice(2).join('.');
         
         const isFirestore = ['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders', 'bbntOrders', 'projects', 'lichSu'].includes(col);
         
         if (isFirestore) {
            const val = removeUndefined(rtdbUpdates)[key];
            if (parts.length === 2) {
               if (val === null) await deleteDoc(doc(fsDb, col, docId));
               else await setDoc(doc(fsDb, col, docId), val, { merge: true });
            } else if (parts.length > 2) {
               if (val === null) {
                  // Ignore nested null update for simplicity or handle it:
                  const updateObj = {}; updateObj[fieldPath] = null;
                  await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
               } else {
                  const updateObj = {}; updateObj[fieldPath] = val;
                  await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
               }
            }
         } else {
            const tempDb = getDB();
            if (tempDb) {
               const rUpdate = {};
               rUpdate[key] = rtdbUpdates[key];
               await update(ref(tempDb), rUpdate);
            }
         }
       }
    }


    
  }
};

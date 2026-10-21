import { collection, getDocs } from 'firebase/firestore';
import { getFirestoreDB } from './firebaseService';
import { getDB, loadProjectTotalUnitsAll } from './firebaseService';
import { ref, get } from 'firebase/database';
// Removed firestore imports
import { EstimateItem, EstimateGroup } from '../../types';
import { normalizeProjectName } from './formatUtils';
import { ProjectService } from '../services/ProjectService';
import { firebaseListenerManager } from '../services/FirebaseListenerManager';

export interface UnifiedEstimateData {
  items: EstimateItem[];
  groups: EstimateGroup[];
  orders: any[];
}

/**
 * Process raw EstimateGroups, EstimateItems, and Orders into a unified dataset.
 *
 * Single Source of Truth Rules:
 * 1. Load EstimateGroups FIRST.
 * 2. Load/expand ALL EstimateItems belonging to each groupId.
 * 3. Expand materials listed in group.materialDetails if they don't have
 *    individual EstimateItem records yet, ensuring no sub-materials (e.g. Phi6, Phi8, Phi10)
 *    are lost.
 * 4. Include all Project Shared (Chi phí dự án) and Group Norm (Định mức nhóm) items.
 * 5. Provide consistent data structure for BM01, BM06, Dashboard, Order History, Báo cáo, Export.
 */
export function processUnifiedEstimateData(
  rawGroups: any[],
  rawItems: any[],
  rawOrders: any[] = []
): UnifiedEstimateData {
  const processedItems: EstimateItem[] = [];
  const processedGroups: EstimateGroup[] = [];
  const seenItemKeys = new Set<string>();

  // Map existing items by groupId
  const itemsByGroupId = new Map<string, any[]>();
  const standaloneItems: any[] = [];

  rawItems.forEach(item => {
    if (!item) return;
    const gId = item.groupId;
    if (gId) {
      if (!itemsByGroupId.has(gId)) {
        itemsByGroupId.set(gId, []);
      }
      itemsByGroupId.get(gId)!.push(item);
    } else {
      standaloneItems.push(item);
    }
  });

  // STEP 1: Process EstimateGroups FIRST
  rawGroups.forEach(group => {
    if (!group) return;
    const gId = group.groupId || group.id;
    if (!gId) return;

    const grpEstQty = Number(group.estimatedQty) || 0;

    // Existing items in DB that have item.groupId === gId
    const existingGroupItems = itemsByGroupId.get(gId) || [];

    // Check group.materialDetails for materials defined in group
    const matDetails = Array.isArray(group.materialDetails) ? group.materialDetails : [];
    const groupItemsList: any[] = [...existingGroupItems];

    // Check if matDetails has sub-materials not yet present in existingGroupItems
    matDetails.forEach((mat: any) => {
      const matNameNorm = (mat.name || mat.itemName || '').trim().toLowerCase();
      if (!matNameNorm) return;

      const exists = groupItemsList.some(it => {
        const itNameNorm = (it.name || '').trim().toLowerCase();
        return itNameNorm === matNameNorm || (mat.id && it.materialId === mat.id);
      });

      if (!exists) {
        // Expand/synthesize missing sub-material from EstimateGroup definition
        const synthId = `EST-GRP-${gId}-${mat.id || mat.code || matNameNorm}`;
        groupItemsList.push({
          id: synthId,
          projectId: group.projectId,
          unitId: group.unitId,
          code: mat.code || mat.id || 'VT-GRP',
          name: mat.name,
          unit: mat.unit || group.unit || 'kg',
          basePrice: Number(mat.unitPrice || mat.basePrice || 0),
          specs: mat.specification || mat.specs || '',
          groupId: gId,
          isGroupedEstimate: true,
          groupName: group.groupName,
          materialId: mat.id,
          estimatedQty: grpEstQty,
          cumulativeQty: 0,
          remainingQty: grpEstQty,
          itemCumulativeQty: 0,
          warningStatus: group.status || 'NORMAL',
          createdAt: group.createdAt || Date.now(),
          updatedAt: Date.now()
        });
      }
    });

    // Calculate group cumulative & remaining
    let grpCumQty = Number(group.cumulativeQty || 0);
    let itemCumSum = 0;
    groupItemsList.forEach(it => {
      const itCum = Number(it.itemCumulativeQty !== undefined ? it.itemCumulativeQty : (it.cumulativeQty || 0));
      itemCumSum += itCum;
    });
    if (itemCumSum > grpCumQty) {
      grpCumQty = itemCumSum;
    }

    const grpRemQty = grpEstQty - grpCumQty;
    let grpStatus: 'NORMAL' | 'NEARLY_EMPTY' | 'EXCEEDED' = 'NORMAL';
    if (grpRemQty <= 0) grpStatus = 'EXCEEDED';
    else if (grpEstQty > 0 && grpRemQty / grpEstQty <= 0.10) grpStatus = 'NEARLY_EMPTY';

    const rawProj = group.projectId;
    const normProj = ProjectService.resolveProjectName(rawProj) || normalizeProjectName(rawProj) || rawProj;

    processedGroups.push({
      ...group,
      projectId: normProj,
      groupId: gId,
      id: gId,
      estimatedQty: grpEstQty,
      cumulativeQty: grpCumQty,
      remainingQty: grpRemQty,
      status: grpStatus
    });

    // Add ALL items belonging to this group
    groupItemsList.forEach(it => {
      if (!it || it.isArchived) return;

      const pId = ProjectService.resolveProjectName(it.projectId || group.projectId) || normalizeProjectName(it.projectId || group.projectId) || (it.projectId || group.projectId);
      const uId = it.unitId || group.unitId;
      const itemKey = `${pId}::${uId}::${(it.name || '').trim().toLowerCase()}::${gId}`;
      if (seenItemKeys.has(itemKey)) return;
      seenItemKeys.add(itemKey);

      const autoCum = Number(it.itemCumulativeQty !== undefined ? it.itemCumulativeQty : (it.cumulativeQty || 0));
      const adjQty = Number(it.adjustmentQty || 0);
      const cum = autoCum + adjQty;

      const isProjectShared = (
        uId === 'PROJECT_SHARED' || 
        it.isProjectShared === true || 
        it.sourceType === 'PROJECT_COST' || 
        it.sourceType === 'PROJECT_SHARED_DISTRIBUTED' ||
        it.createdFrom === 'PROJECT_COST'
      );

      processedItems.push({
        ...it,
        id: it.id || `EST-ITEM-${gId}-${(it.name || '').trim()}`,
        projectId: pId,
        unitId: uId,
        code: it.code || '',
        name: (it.name || '').trim(),
        unit: (it.unit || group.unit || '').trim(),
        basePrice: Number(it.basePrice || 0),
        groupId: gId,
        isGroupedEstimate: true,
        groupName: group.groupName || it.groupName,
        isProjectShared,
        estimatedQty: Number(it.estimatedQty || grpEstQty),
        groupEstimatedQty: grpEstQty,
        groupRemainingQty: grpRemQty,
        cumulativeQty: cum,
        remainingQty: grpRemQty,
        warningStatus: grpStatus
      });
    });
  });

  // STEP 2: Process Standalone items (items not in any group)
  standaloneItems.forEach(it => {
    if (!it || it.isArchived) return;

    const nameStr = (it.name || '').trim();
    if (!nameStr || nameStr.startsWith("Vật tư khởi tạo")) return;
    if (it.isTemporary === true || it.isVirtual === true || it.status === "TEMP") return;

    const pId = ProjectService.resolveProjectName(it.projectId) || normalizeProjectName(it.projectId) || it.projectId;
    const isProjectShared = (
      it.unitId === 'PROJECT_SHARED' || 
      it.isProjectShared === true || 
      it.sourceType === 'PROJECT_COST' || 
      it.sourceType === 'PROJECT_SHARED_DISTRIBUTED' ||
      it.createdFrom === 'PROJECT_COST'
    );

    const est = Number(it.estimatedQty || 0);
    // For non-group and non-project-shared items, skip if est <= 0
    if (!isProjectShared && est <= 0) return;

    const itemKey = `${pId}::${it.unitId}::${nameStr.toLowerCase()}`;
    if (seenItemKeys.has(itemKey)) return;
    seenItemKeys.add(itemKey);

    const autoCum = Number(it.cumulativeQty || 0);
    const adjQty = Number(it.adjustmentQty || 0);
    const cum = autoCum + adjQty;
    const rem = est - cum;

    let warningStatus: 'NORMAL' | 'NEARLY_EMPTY' | 'EXCEEDED' = 'NORMAL';
    if (rem <= 0) warningStatus = 'EXCEEDED';
    else if (est > 0 && rem / est <= 0.10) warningStatus = 'NEARLY_EMPTY';

    processedItems.push({
      ...it,
      id: it.id,
      projectId: pId,
      unitId: it.unitId,
      code: it.code || '',
      name: nameStr,
      unit: (it.unit || '').trim(),
      basePrice: Number(it.basePrice || 0),
      isProjectShared,
      estimatedQty: est,
      cumulativeQty: cum,
      remainingQty: rem,
      warningStatus
    });
  });


  return {
    items: processedItems,
    groups: processedGroups,
    orders: rawOrders
  };
}

/**
 * Fetch unified estimate data once (async).
 */
export async function fetchUnifiedEstimateData(): Promise<UnifiedEstimateData> {
  const db = getDB();

  // Load project total units cache asynchronously
  loadProjectTotalUnitsAll().catch(() => {});

  let rawGroups: any[] = [];
  let rawItems: any[] = [];
  let rawOrders: any[] = [];

  if (getFirestoreDB()) {
    try {
      const grpSnap = await getDocs(collection(getFirestoreDB(), 'estimateGroups'));
      grpSnap.forEach(doc => rawGroups.push({ ...doc.data(), id: doc.id, groupId: doc.data().groupId || doc.id }));
    } catch (e) { console.warn("Firestore estimateGroups fetch error:", e); }

    try {
      const itemsSnap = await getDocs(collection(getFirestoreDB(), 'estimateItems'));
      itemsSnap.forEach(doc => rawItems.push({ ...doc.data(), id: doc.id }));
    } catch (e) { console.warn("Firestore estimateItems fetch error:", e); }

    try {
      const ordersSnap = await getDocs(collection(getFirestoreDB(), 'bm06Orders'));
      ordersSnap.forEach(doc => rawOrders.push({ ...doc.data(), id: doc.id }));
    } catch (e) { console.warn("Firestore bm06Orders fetch error:", e); }
  }

  return processUnifiedEstimateData(rawGroups, rawItems, rawOrders);
}

/**
 * Realtime listener for unified estimate data.
 */
export function subscribeUnifiedEstimateData(
  onData: (data: UnifiedEstimateData) => void,
  onError?: (err: any) => void
): () => void {
  const db = getDB();
  if (!db) {
    fetchUnifiedEstimateData().then(onData).catch(err => {
      if (onError) onError(err);
    });
    return () => {};
  }

  let rawGroups: any[] = [];
  let rawItems: any[] = [];
  let rawOrders: any[] = [];

  const updateAndNotify = () => {
    try {
      const data = processUnifiedEstimateData(rawGroups, rawItems, rawOrders);
      onData(data);
    } catch (err) {
      console.error("Error processing unified estimate data:", err);
      if (onError) onError(err);
    }
  };

  const unsubGroups = firebaseListenerManager.subscribe('estimateGroups', (val) => {
    if (val) {
      rawGroups = Object.keys(val).map(k => ({ ...val[k], id: k, groupId: val[k].groupId || k }));
    } else {
      rawGroups = [];
    }
    updateAndNotify();
  }, onError);

  const unsubItems = firebaseListenerManager.subscribe('estimateItems', (val) => {
    if (val) {
      rawItems = Object.keys(val).map(k => ({ ...val[k], id: k }));
    } else {
      rawItems = [];
    }
    updateAndNotify();
  }, onError);

  return () => {
    unsubGroups();
    unsubItems();
  };
}

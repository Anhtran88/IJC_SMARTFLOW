const fs = require('fs');
let code = fs.readFileSync('src/lib/firebaseService.ts', 'utf8');

// Replace saveEstimateItems
code = code.replace(/export const saveEstimateItems = async.*?\} catch \(error: any\) \{/s, 
`export const saveEstimateItems = async (projectId: string, unitId: string, items: EstimateItem[]): Promise<string[]> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  const savedIds: string[] = [];
  try {
    for (const item of items) {
      const itemId = item.id || generateUUID();
      const enrichedItem = { ...item, id: itemId, projectId, unitId, createdAt: item.createdAt || Date.now(), updatedAt: Date.now() };
      await setDoc(doc(fsDb, 'estimateItems', itemId), removeUndefined(enrichedItem), { merge: true });
      savedIds.push(itemId);
    }
    return savedIds;
  } catch (error: any) {`);

// Replace getEstimateItems
code = code.replace(/export const getEstimateItems = async.*?\} catch \(error: any\) \{/s,
`export const getEstimateItems = async (projectId: string, unitId: string): Promise<EstimateItem[]> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  try {
    const snapshot = await getDocs(collection(fsDb, 'estimateItems'));
    const items: EstimateItem[] = [];
    snapshot.forEach((docSnap) => {
      const item = docSnap.data() as EstimateItem;
      if (item && item.projectId === projectId && item.unitId === unitId) {
        items.push({ ...item, id: docSnap.id });
      }
    });
    return items.sort((a, b) => {
      const codeA = (a.code || '').toLowerCase();
      const codeB = (b.code || '').toLowerCase();
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  } catch (error: any) {`);

// Replace updateEstimateItem
code = code.replace(/export const updateEstimateItem = async.*?\} catch \(error: any\) \{/s,
`export const updateEstimateItem = async (itemId: string, updates: Partial<EstimateItem>): Promise<void> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  try {
    const sanitizedUpdates = removeUndefined({ ...updates, updatedAt: Date.now() });
    await setDoc(doc(fsDb, 'estimateItems', itemId), sanitizedUpdates, { merge: true });
  } catch (error: any) {`);

// Replace deleteEstimateItem
code = code.replace(/export const deleteEstimateItem = async.*?\} catch \(error: any\) \{/s,
`export const deleteEstimateItem = async (itemId: string): Promise<void> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  try {
    await deleteDoc(doc(fsDb, 'estimateItems', itemId));
  } catch (error: any) {`);

// Replace getEstimateGroups
code = code.replace(/export const getEstimateGroups = async.*?\} catch \(error: any\) \{/s,
`export const getEstimateGroups = async (projectId: string, unitId: string): Promise<EstimateGroup[]> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) return [];
  try {
    const snapshot = await getDocs(collection(fsDb, 'estimateGroups'));
    const groups: EstimateGroup[] = [];
    snapshot.forEach((docSnap) => {
      const g = docSnap.data();
      const matchProject = !projectId || projectId === 'ALL' || g.projectId === projectId;
      const matchUnit = !unitId || unitId === 'ALL' || g.unitId === unitId;
      if (matchProject && matchUnit) {
        groups.push({ ...(g as EstimateGroup), groupId: docSnap.id });
      }
    });
    return groups.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (error: any) {`);

// Replace deleteEstimateGroup
code = code.replace(/export const deleteEstimateGroup = async.*?\} catch \(error: any\) \{/s,
`export const deleteEstimateGroup = async (groupId: string): Promise<void> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  try {
    await deleteDoc(doc(fsDb, 'estimateGroups', groupId));
    const snapItems = await getDocs(collection(fsDb, 'estimateItems'));
    snapItems.forEach(async (docSnap) => {
      const it = docSnap.data();
      if (it && it.groupId === groupId) {
        await setDoc(doc(fsDb, 'estimateItems', docSnap.id), {
          groupId: null, isGroupedEstimate: false, estimatedQty: 0, remainingQty: 0, warningStatus: 'NORMAL', updatedAt: Date.now()
        }, { merge: true });
      }
    });
  } catch (error: any) {`);

// Replace saveEstimateGroup
code = code.replace(/export const saveEstimateGroup = async.*?\} catch \(error: any\) \{/s,
`export const saveEstimateGroup = async (group: Partial<EstimateGroup> & { materialDetails?: any[] }): Promise<string> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  const groupId = group.groupId || generateUUID();
  const enrichedGroup: EstimateGroup = { ...group, groupId, createdAt: group.createdAt || Date.now(), updatedAt: Date.now() };
  if (group.materialDetails) enrichedGroup.materialDetails = group.materialDetails;
  try {
    await setDoc(doc(fsDb, 'estimateGroups', groupId), removeUndefined(enrichedGroup), { merge: true });
    return groupId;
  } catch (error: any) {`);

fs.writeFileSync('src/lib/firebaseService.ts', code);

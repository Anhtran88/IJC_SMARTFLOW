export const generateCommonFileNamePart = (data: any): string => {
  const parts = [];
  if (data.docNumber) parts.push(data.docNumber);
  if (data.date) parts.push(data.date);
  return parts.length > 0 ? parts.join('_') : 'Export';
};

export const groupItemsForExport = (items: any[]): any[] => {
  const map = new Map<string, any>();
  
  items.forEach(item => {
    // Group by project, unit, and name
    const key = `${item.projectId || ''}_${item.unitId || ''}_${item.name || ''}_${item.code || ''}`;
    
    if (map.has(key)) {
      const existing = map.get(key);
      existing.orderQty = (Number(existing.orderQty) || 0) + (Number(item.orderQty) || 0);
      existing.estimatedQty = (Number(existing.estimatedQty) || 0) + (Number(item.estimatedQty) || 0);
      existing.total = (Number(existing.total) || 0) + (Number(item.total) || 0);
      // Ensure shared costs are properly merged
      if (item.isSharedCost) existing.isSharedCost = true;
    } else {
      map.set(key, { ...item });
    }
  });
  
  return Array.from(map.values());
};

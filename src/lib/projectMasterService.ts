import { CANONICAL_PROJECTS, normalizeProjectName, getShortProjectName } from './formatUtils';
import { ProjectService } from '../services/ProjectService';

export { CANONICAL_PROJECTS, normalizeProjectName, getShortProjectName };

export function isValidProjectName(projName?: string | null): boolean {
  if (!projName) return false;
  const norm = ProjectService.resolveProjectName(projName) || normalizeProjectName(projName);
  if (!norm) return false;
  const lower = norm.toLowerCase();
  if (lower.includes('test') || lower.includes('demo') || lower.includes('tạm') || lower.includes('rác')) {
    return false;
  }
  return true;
}

/**
 * Returns canonical/master projects that have valid estimate items or BM06 orders.
 * Strictly adheres to system requirements:
 * - Load projects from Project Master (CANONICAL_PROJECTS + valid custom master projects).
 * - Only display projects that have valid estimate items or BM06 orders.
 * - Filter out test, garbage, or temporary projects.
 * - Compatibility layer: Prioritizes matching by project name (name property || key).
 */
export function getValidMasterProjects(estimateItems: any[] = [], bm06Orders: any[] = []): string[] {
  const activeProjects = new Set<string>();

  const checkItem = (it: any) => {
    if (!it || it.isArchived) return;
    const rawProj = it.projectId || it.project_name;
    const norm = ProjectService.resolveProjectName(rawProj);
    if (isValidProjectName(norm)) {
      activeProjects.add(norm);
    }
  };

  estimateItems.forEach(checkItem);
  bm06Orders.forEach((ord: any) => {
    if (!ord) return;
    if (ord.projectId) checkItem({ projectId: ord.projectId });
    if (ord.project_name) checkItem({ projectId: ord.project_name });
    if (Array.isArray(ord.selectedUnits)) {
      ord.selectedUnits.forEach((u: any) => {
        if (u?.projectId) checkItem({ projectId: u.projectId });
      });
    }
  });

  const resultList = Array.from(activeProjects).filter(p => isValidProjectName(p));

  return resultList.sort((a, b) => {
    const idxA = CANONICAL_PROJECTS.indexOf(a);
    const idxB = CANONICAL_PROJECTS.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, 'vi');
  });
}

/**
 * Get valid units for a given project from estimateItems and bm06Orders.
 */
export function getValidUnitsForProject(project: string, estimateItems: any[] = [], bm06Orders: any[] = []): string[] {
  const normTarget = ProjectService.resolveProjectName(project);
  if (!normTarget) return [];

  const unitsSet = new Set<string>();

  estimateItems.forEach(it => {
    if (!it || it.isArchived) return;
    const normP = ProjectService.resolveProjectName(it.projectId || it.project_name);
    if (normP === normTarget && it.unitId && it.unitId !== 'PROJECT_SHARED') {
      unitsSet.add(it.unitId);
    }
  });

  bm06Orders.forEach((ord: any) => {
    if (!ord) return;
    if (Array.isArray(ord.selectedUnits)) {
      ord.selectedUnits.forEach((u: any) => {
        if (u && u.unitId && u.unitId !== 'PROJECT_SHARED') {
          const normP = ProjectService.resolveProjectName(u.projectId || ord.projectId);
          if (normP === normTarget) {
            unitsSet.add(u.unitId);
          }
        }
      });
    }
  });

  return Array.from(unitsSet).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b, 'vi');
  });
}


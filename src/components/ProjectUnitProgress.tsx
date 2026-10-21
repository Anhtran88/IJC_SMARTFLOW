import React from 'react';
import { getProjectTotalUnits } from '../lib/firebaseService';

export const ProjectUnitProgress = ({ projectId, usedUnitsCount, darkMode = false }: { projectId: string, usedUnitsCount: number, darkMode?: boolean }) => {
  const dbTotal = getProjectTotalUnits(projectId) || 0;
  if (!projectId) return null;

  const hasConfiguredTotal = dbTotal > 0;
  const total = hasConfiguredTotal ? dbTotal : Math.max(1, usedUnitsCount);
  const percentage = hasConfiguredTotal ? Math.round((usedUnitsCount / dbTotal) * 100) : 0;
  
  let colorClass = 'bg-blue-500';
  let textColor = darkMode ? 'text-blue-400' : 'text-blue-700';
  let bgColor = darkMode ? 'bg-blue-900/20' : 'bg-blue-50';
  let borderColor = darkMode ? 'border-blue-800' : 'border-blue-200';
  let warningMsg = '';

  if (hasConfiguredTotal) {
    if (percentage >= 100) {
      colorClass = 'bg-rose-500';
      textColor = darkMode ? 'text-rose-400' : 'text-rose-700';
      bgColor = darkMode ? 'bg-rose-900/20' : 'bg-rose-50';
      borderColor = darkMode ? 'border-rose-800' : 'border-rose-200';
      warningMsg = 'Không thể thêm căn mới.';
    } else if (percentage >= 80) {
      colorClass = 'bg-amber-500';
      textColor = darkMode ? 'text-amber-400' : 'text-amber-700';
      bgColor = darkMode ? 'bg-amber-900/20' : 'bg-amber-50';
      borderColor = darkMode ? 'border-amber-800' : 'border-amber-200';
      warningMsg = 'Sắp đạt giới hạn số căn.';
    } else if (percentage >= 50) {
      colorClass = 'bg-yellow-400';
      textColor = darkMode ? 'text-yellow-400' : 'text-yellow-700';
      bgColor = darkMode ? 'bg-yellow-900/20' : 'bg-yellow-50';
      borderColor = darkMode ? 'border-yellow-800' : 'border-yellow-200';
    }
  }

  return (
    <div className={`p-3 rounded-xl border ${borderColor} ${bgColor} flex flex-col gap-2`}>
      <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-wider">
        <span className={textColor}>Tiến độ sử dụng căn {projectId ? `(${projectId})` : ''}</span>
        <span className={textColor}>
          {hasConfiguredTotal 
            ? `${usedUnitsCount}/${dbTotal} (${Math.min(percentage, 100)}%)` 
            : `Đã sử dụng: ${usedUnitsCount} căn`}
        </span>
      </div>
      <div className={`w-full h-2.5 ${darkMode ? 'bg-slate-800' : 'bg-slate-200/50'} rounded-full overflow-hidden shadow-inner`}>
        <div 
          className={`h-full ${colorClass} transition-all duration-500`} 
          style={{ width: `${hasConfiguredTotal ? Math.min(percentage, 100) : (usedUnitsCount > 0 ? 100 : 0)}%` }} 
        />
      </div>
      {warningMsg && (
        <div className={`text-[10.5px] font-bold ${textColor}`}>
          ⚠️ {warningMsg}
        </div>
      )}
      {hasConfiguredTotal && percentage >= 100 && (
        <div className={`text-[10px] font-bold ${textColor} italic`}>
          Đã sử dụng đủ {usedUnitsCount}/{dbTotal} căn.
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { ReportModule } from './ReportModule';

export default function Dashboard({
  isFirebaseInitialized,
  onSelectOrderRecord,
  setToast,
  refreshTrigger
}: {
  isFirebaseInitialized?: boolean;
  onSelectOrderRecord?: (record: any) => void;
  setToast?: (toast: { message: string; type: 'success' | 'error' | 'info' }) => void;
  refreshTrigger?: number;
}) {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0f172a] text-slate-100 p-4 md:p-8 animate-fade-in custom-scrollbar">
      <ReportModule onSelectOrderRecord={onSelectOrderRecord} setToast={setToast} refreshTrigger={refreshTrigger} />
    </div>
  );
}

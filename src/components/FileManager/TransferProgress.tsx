import React, { useEffect, useState } from 'react';
import { FileTransfer } from '../../types';
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';

interface TransferProgressProps {
  transfers: FileTransfer[];
  onClear: (id: string) => void;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({ transfers, onClear }) => {
  // Simple time remaining calc could be done here if we tracked rates,
  // but for now we just show progress.

  if (transfers.length === 0) return null;

  return (
    <div className="border-t border-gray-700 bg-gray-800 p-3 flex flex-col gap-2 max-h-40 overflow-y-auto">
       <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Transfers</h4>
       {transfers.map(t => (
           <div key={t.id} className="flex items-center gap-3 bg-gray-900 p-2 rounded border border-gray-700">
               <div className="flex-1 min-w-0">
                   <div className="flex justify-between text-xs mb-1">
                       <span className={`font-medium truncate ${t.status === 'error' ? 'text-red-400' : 'text-gray-300'}`}>
                           {t.type === 'upload' ? '↑' : '↓'} {t.filename}
                       </span>
                       <span className="text-gray-500">
                           {t.status === 'completed' ? 'Done' : t.status === 'error' ? 'Error' : `${Math.round(t.progress)}%`}
                       </span>
                   </div>

                   <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                       <div
                         className={`h-full transition-all duration-200 ${
                            t.status === 'completed' ? 'bg-green-500' :
                            t.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                         }`}
                         style={{ width: `${t.progress}%` }}
                       />
                   </div>
                   {t.error && <div className="text-[10px] text-red-500 mt-1 truncate">{t.error}</div>}
               </div>

               <button onClick={() => onClear(t.id)} className="text-gray-500 hover:text-gray-300">
                   {t.status === 'running' ? <Loader2 size={14} className="animate-spin text-blue-400"/> : <X size={14}/>}
               </button>
           </div>
       ))}
    </div>
  );
};

import React from 'react';
import { AlertCircle, XCircle, Info } from 'lucide-react';
import { Button } from '../../components/Button';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: 'error' | 'info' | 'success';
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  variant = 'error'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case 'error': return <XCircle size={24} />;
      case 'success': return <AlertCircle size={24} />; // Using generic circle for now, or check/check-circle
      default: return <Info size={24} />;
    }
  };

  const getColorClasses = () => {
    switch (variant) {
      case 'error': return 'bg-red-900/50 text-red-400';
      case 'success': return 'bg-green-900/50 text-green-400';
      default: return 'bg-blue-900/50 text-blue-400';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-sm p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${getColorClasses()}`}>
            {getIcon()}
          </div>
          <h2 className="text-xl font-bold text-gray-100">{title}</h2>
          <div className="mt-2 w-full">
            <div className="text-sm text-gray-300 text-center bg-gray-800/50 p-3 rounded border border-gray-700 font-mono break-words whitespace-pre-wrap max-h-40 overflow-y-auto">
                {message}
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-6">
          <Button
            variant="secondary"
            onClick={onClose}
            className="w-full"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

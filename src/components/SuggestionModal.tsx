import React from 'react';
import { CommandFix, CommandStatus } from '../types';
import { AlertTriangle, SkipForward, RefreshCw, Lightbulb, X } from 'lucide-react';
import { Button } from './Button';

interface SuggestionModalProps {
  suggestion: CommandFix;
  fontSize: number;
  onApply: () => void;
  onSkip: () => void;
  onAbort: () => void;
}

export const SuggestionModal: React.FC<SuggestionModalProps> = ({
  suggestion,
  fontSize,
  onApply,
  onSkip,
  onAbort
}) => {
  const isError = suggestion.classification === 'error';

  // Styles based on classification
  const containerBorder = isError ? 'border-red-500/30' : 'border-blue-500/30';
  const iconColor = isError ? 'text-red-400' : 'text-blue-400';
  const titleColor = isError ? 'text-red-400' : 'text-blue-400';
  const titleText = isError ? 'Execution Error' : 'Suggestion';
  const Icon = isError ? AlertTriangle : Lightbulb;
  const commandColor = isError ? 'text-green-400' : 'text-blue-300';

  return (
    <div className={`fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in slide-in-from-bottom-5 fade-in duration-300`}>
      <div className={`bg-gray-800/95 backdrop-blur-md border ${containerBorder} rounded-xl p-5 shadow-2xl ring-1 ring-black/20`}>

        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <h3 className={`text-sm font-bold ${titleColor} uppercase tracking-wider flex items-center gap-2`}>
            <Icon size={16} /> {titleText}
          </h3>
          <button onClick={onAbort} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="text-gray-300 text-sm mb-3">
           {isError ? "The command failed. AI suggests a fix:" : "The command completed with potential issues. AI suggests:"}
        </p>

        {/* Command Block */}
        <div
            className="bg-black/60 p-3 rounded-lg font-mono mb-4 border border-gray-700/50 overflow-x-auto shadow-inner"
            style={{ fontSize: `${fontSize}px` }}
        >
          <span className={commandColor}>{suggestion.command}</span>
        </div>

        {/* Reasoning */}
        <p className="text-gray-400 text-sm mb-5 leading-relaxed bg-gray-900/30 p-3 rounded border border-gray-700/30">
          <span className="text-gray-500 font-semibold uppercase text-xs block mb-1">Reasoning</span>
          {suggestion.explanation}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-700/30">
          <Button variant="ghost" size="sm" onClick={onAbort} className="text-gray-400 hover:text-gray-200">
             Abort
          </Button>
          <Button variant="secondary" size="sm" onClick={onSkip} className="bg-gray-700 hover:bg-gray-600 border-gray-600">
             <SkipForward size={14} className="mr-2"/> Skip Step
          </Button>
          <Button
            variant={suggestion.dangerous ? 'danger' : 'primary'}
            size="sm"
            onClick={onApply}
            className="shadow-lg"
          >
            <RefreshCw size={14} className="mr-2"/> Apply Fix
          </Button>
        </div>
      </div>
    </div>
  );
};

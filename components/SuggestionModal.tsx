import React from 'react';
import { AlertTriangle, RefreshCw, SkipForward, CheckCircle, Info } from 'lucide-react';
import { Button } from './Button';
import { FixSuggestion } from '../types';

interface SuggestionModalProps {
    suggestion: FixSuggestion;
    originalCommand: string;
    onApply: () => void;
    onSkip: () => void;
    onAbort: () => void;
    fontSize: number;
}

export const SuggestionModal: React.FC<SuggestionModalProps> = ({
    suggestion,
    originalCommand,
    onApply,
    onSkip,
    onAbort,
    fontSize
}) => {
    const isError = suggestion.classification === 'error';
    const borderColor = isError ? 'border-red-500/50' : 'border-yellow-500/50';
    const titleColor = isError ? 'text-red-400' : 'text-yellow-400';
    const Icon = isError ? AlertTriangle : Info;
    const titleText = isError ? 'Execution Error' : 'Suggestion';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
             <div className={`bg-gray-900 border ${borderColor} rounded-lg w-full max-w-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200`}>

                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`text-lg font-bold ${titleColor} uppercase tracking-wider flex items-center gap-2`}>
                    <Icon size={20}/> {titleText}
                  </h3>
                </div>

                <div className="space-y-4">
                    {/* Active Command Display */}
                    <div>
                        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Executed Command</p>
                        <div
                            className="bg-gray-800 p-2.5 rounded font-mono text-gray-300 border border-gray-700/50 opacity-80"
                            style={{ fontSize: `${fontSize}px` }}
                        >
                            {originalCommand}
                        </div>
                    </div>

                    {/* Logic for "The command failed" text */}
                    {isError && (
                        <p className="text-red-200 text-sm">
                            The command failed. AI suggests a fix:
                        </p>
                    )}
                    {!isError && (
                        <p className="text-gray-300 text-sm">
                            AI suggests a follow-up action:
                        </p>
                    )}

                    {/* Suggested Fix */}
                    <div>
                        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Suggested Action</p>
                        <div
                            className="bg-black/50 p-3 rounded font-mono text-green-400 border border-gray-700/50 shadow-inner"
                            style={{ fontSize: `${fontSize}px` }}
                        >
                            {suggestion.command}
                        </div>
                    </div>

                    {/* Explanation */}
                    <div className="bg-gray-800/50 p-3 rounded border border-gray-700/30">
                        <p className="text-gray-300 text-sm">
                            <span className="text-gray-500 font-medium block text-xs uppercase mb-1">Reasoning</span>
                            {suggestion.explanation}
                        </p>
                    </div>
                </div>

                {/* Footer / Actions */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
                  <Button variant="ghost" size="sm" onClick={onAbort}>Abort</Button>
                  <Button variant="secondary" size="sm" onClick={onSkip}>
                     <SkipForward size={14} className="mr-2"/> Skip Step
                  </Button>
                  <Button
                    variant={suggestion.dangerous ? 'danger' : 'primary'}
                    size="sm"
                    onClick={onApply}
                  >
                    <RefreshCw size={14} className="mr-2"/> Apply Fix
                  </Button>
                </div>
            </div>
        </div>
    );
};

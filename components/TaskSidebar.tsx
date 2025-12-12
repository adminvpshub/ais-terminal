import React from 'react';
import { CommandStep, CommandStatus } from '../types';
import { CheckCircle, XCircle, Clock, PlayCircle, SkipForward, AlertCircle, Play } from 'lucide-react';

interface TaskSidebarProps {
  steps: CommandStep[];
  activeStepId: string | null;
  className?: string;
  onRunStep?: (id: string) => void;
  isExecuting?: boolean;
}

const getStatusIcon = (status: CommandStatus) => {
  switch (status) {
    case CommandStatus.Success:
      return <CheckCircle size={16} className="text-green-500" />;
    case CommandStatus.Error:
      return <XCircle size={16} className="text-red-500" />;
    case CommandStatus.Running:
      return <PlayCircle size={16} className="text-blue-500 animate-spin-slow" />; // Need to define custom spin if standard spin is too fast, or just animate-pulse
    case CommandStatus.Skipped:
      return <SkipForward size={16} className="text-gray-500" />;
    default:
      return <Clock size={16} className="text-gray-600" />;
  }
};

export const TaskSidebar: React.FC<TaskSidebarProps> = ({
  steps,
  activeStepId,
  className = '',
  onRunStep,
  isExecuting = false
}) => {
  if (steps.length === 0) return null;

  return (
    <div className={`flex flex-col h-full bg-gray-900 border-l border-gray-800 w-80 flex-shrink-0 ${className}`}>
      <div className="p-4 border-b border-gray-800 bg-gray-900 sticky top-0 z-10">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
           Execution Plan
           <span className="bg-blue-900/50 text-blue-300 text-[10px] px-2 py-0.5 rounded-full border border-blue-800">
             {steps.filter(s => s.status === CommandStatus.Success).length}/{steps.length}
           </span>
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {steps.map((step, index) => {
          const isActive = step.id === activeStepId;

          return (
            <div
              key={step.id}
              className={`
                relative p-3 rounded-lg border transition-all duration-200 group
                ${isActive
                  ? 'bg-blue-900/10 border-blue-500/50 shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]'
                  : 'bg-gray-800/40 border-gray-800 hover:bg-gray-800'
                }
              `}
            >
                {/* Connector Line */}
                {index < steps.length - 1 && (
                    <div className="absolute left-[19px] top-[36px] bottom-[-16px] w-[2px] bg-gray-800 -z-10 group-hover:bg-gray-700 transition-colors" />
                )}

                <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex-shrink-0 ${isActive && step.status === CommandStatus.Running ? 'animate-pulse' : ''}`}>
                        {getStatusIcon(step.status)}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                             <p className={`text-xs font-mono mb-1 truncate ${isActive ? 'text-blue-300' : 'text-gray-400'}`}>
                                {step.command}
                            </p>
                        </div>

                        <p className="text-xs text-gray-500 leading-relaxed">
                            {step.explanation}
                        </p>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          {step.dangerous ? (
                              <div className="flex items-center gap-1 text-[10px] text-orange-400 bg-orange-950/30 w-fit px-1.5 py-0.5 rounded border border-orange-900/50">
                                  <AlertCircle size={10} />
                                  <span>High Risk</span>
                              </div>
                          ) : <div></div>}

                          {onRunStep && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRunStep(step.id);
                              }}
                              disabled={isExecuting}
                              className={`
                                flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors
                                ${isExecuting
                                  ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
                                  : 'bg-blue-900/20 text-blue-300 border-blue-800 hover:bg-blue-800/40 hover:text-blue-200'
                                }
                              `}
                              title="Run this command"
                            >
                              <Play size={8} fill="currentColor" />
                              Run
                            </button>
                          )}
                        </div>
                    </div>
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

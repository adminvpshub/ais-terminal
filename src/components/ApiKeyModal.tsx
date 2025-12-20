import React from 'react';
import { Key, X } from 'lucide-react';
import { Button } from '../../components/Button';

interface ApiKeyModalProps {
    onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-red-500/50 rounded-lg w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mb-4 text-red-500 border border-red-500/30">
                        <Key size={24} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-100">Invalid API Key</h2>
                </div>

                <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 mb-6">
                    <p className="text-sm text-red-200 text-center leading-relaxed">
                        Your Gemini API Key is invalid.
                        <br/>
                        Please add a valid key to the <code className="bg-black/50 px-1.5 py-0.5 rounded text-red-100 font-mono text-xs">.env.local</code> file.
                    </p>
                </div>

                <Button
                    onClick={onClose}
                    variant="secondary"
                    className="w-full py-2.5 border-red-500/30 hover:bg-red-900/20 hover:text-red-200"
                >
                    Close
                </Button>
            </div>
        </div>
    );
};

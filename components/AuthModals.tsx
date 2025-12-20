import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { Button } from './Button';

interface SetupPinModalProps {
    onSuccess: (pin: string) => void;
}

export const SetupPinModal: React.FC<SetupPinModalProps> = ({ onSuccess }) => {
    const [pin, setPin] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (pin.length !== 6) {
            setError("PIN must be exactly 6 digits.");
            return;
        }

        if (pin !== confirm) {
            setError("PINs do not match.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });
            const data = await res.json();

            if (res.ok) {
                onSuccess(pin);
            } else {
                setError(data.error || 'Setup failed');
            }
        } catch (err) {
            setError("Failed to connect to server.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md p-6 shadow-2xl">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 rounded-full bg-blue-900/50 flex items-center justify-center mb-3 text-blue-400">
                        <Lock size={24} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-100">Setup Security PIN</h2>
                    <p className="text-sm text-gray-400 text-center mt-2">
                        To secure your SSH keys, please create a master 6-digit PIN. You will need this PIN to connect to servers.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-500/50 text-red-200 text-sm p-3 rounded mb-4 flex items-start gap-2">
                        <AlertCircle size={16} className="mt-0.5 flex-shrink-0"/>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Create PIN</label>
                        <input
                            type="password"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none text-center tracking-widest text-lg"
                            placeholder="••••••"
                            autoFocus
                            maxLength={6}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Confirm PIN</label>
                        <input
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none text-center tracking-widest text-lg"
                            placeholder="••••••"
                            maxLength={6}
                        />
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        className="w-full py-2.5 mt-2"
                        disabled={loading || !pin || !confirm}
                    >
                        {loading ? 'Securing...' : 'Set Master PIN'}
                    </Button>
                </form>
            </div>
        </div>
    );
};

interface PinEntryModalProps {
    onSuccess: (pin: string) => void;
    onCancel?: () => void;
    canCancel?: boolean;
}

export const PinEntryModal: React.FC<PinEntryModalProps> = ({ onSuccess, onCancel, canCancel = true }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('http://localhost:3001/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });
            const data = await res.json();

            if (res.ok && data.valid) {
                onSuccess(pin);
            } else {
                setError("Incorrect PIN.");
                setPin('');
            }
        } catch (err) {
            setError("Validation failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-sm p-6 shadow-2xl">
                 <div className="flex flex-col items-center mb-6">
                    <div className="w-10 h-10 rounded-full bg-blue-900/50 flex items-center justify-center mb-3 text-blue-400">
                        <Lock size={20} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-100">
                        {canCancel ? "Enter Master PIN" : "Login Required"}
                    </h2>
                    <p className="text-xs text-gray-400 text-center mt-1">
                        Please enter your 6-digit PIN to unlock SSH keys.
                    </p>
                </div>

                {error && (
                     <div className="text-center text-red-400 text-sm mb-3 animate-pulse">
                        {error}
                     </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none text-center tracking-widest text-lg"
                        placeholder="••••••"
                        autoFocus
                        maxLength={6}
                    />

                    <div className="flex gap-2">
                        {canCancel && onCancel && (
                            <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
                                Cancel
                            </Button>
                        )}
                        <Button type="submit" variant="primary" className="flex-1" disabled={loading || !pin}>
                            {loading ? 'Verifying...' : 'Unlock'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

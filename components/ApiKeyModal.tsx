import React, { useState } from 'react';
import { Key, X, ExternalLink, ShieldCheck, Check } from 'lucide-react';

interface ApiKeyModalProps {
    onSave: (key: string) => void;
    onClose: () => void;
    currentKey: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSave, onClose, currentKey }) => {
    const [key, setKey] = useState(currentKey);
    const [isSaved, setIsSaved] = useState(false);

    const handleSave = () => {
        onSave(key);
        setIsSaved(true);
        setTimeout(() => {
            setIsSaved(false);
            onClose();
        }, 1500);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
                <div className="p-8">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-primary">
                            <Key size={24} />
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-full">
                            <X size={20} />
                        </button>
                    </div>

                    <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Gemini API Key</h2>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                        To use AI-powered project generation, you need a Google Gemini API key. Your key is stored locally in your browser.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Your API Key</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={key}
                                    onChange={(e) => setKey(e.target.value)}
                                    placeholder="Paste your key here..."
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-sans focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                />
                                {key.length > 20 && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                                        <ShieldCheck size={18} />
                                    </div>
                                )}
                            </div>
                        </div>

                        <a
                            href="https://aistudio.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-[10px] font-bold text-primary hover:underline"
                        >
                            Get a free API key from Google AI Studio <ExternalLink size={10} />
                        </a>
                    </div>

                    <div className="mt-8 flex gap-3">
                        <button
                            onClick={onClose}
                            className="h-12 flex-1 text-slate-500 font-bold text-[10px] uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!key.trim() || isSaved}
                            className={`h-12 flex-1 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 ${isSaved ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-blue-600 shadow-xl shadow-blue-200 disabled:opacity-50'}`}
                        >
                            {isSaved ? <Check size={18} /> : null}
                            {isSaved ? 'Key Saved' : 'Save Key'}
                        </button>
                    </div>
                </div>

                <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium">Your key never leaves your browser.</p>
                </div>
            </div>
        </div>
    );
};

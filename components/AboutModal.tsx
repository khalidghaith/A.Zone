import React from 'react';
import { X, Heart } from 'lucide-react';

interface AboutModalProps {
    onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-white/20 p-8 text-center relative animate-in fade-in zoom-in-95 duration-200">
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 rounded-full hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                    <X size={20} />
                </button>
                
                <h2 className="text-2xl font-black text-slate-800 dark:text-gray-100 mb-4 tracking-tight">About SOAP</h2>
                <p className="text-slate-600 dark:text-gray-300 font-medium leading-relaxed mb-8">
                    SOAP is designed by Khalid Ghaith using Gemini
                </p>

                <div className="pt-6 border-t border-slate-100 dark:border-white/10">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                        Help keep the development going 🙂
                    </p>
                    <a 
                        href="https://ko-fi.com/khalidghaith" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 w-full py-3 bg-[#FF5E5B] text-white rounded-xl font-black text-sm hover:bg-[#ff4542] transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                        <Heart size={18} className="fill-white/20" />
                        Support Me
                    </a>
                </div>
            </div>
        </div>
    );
};
import React from 'react';
import { X, Image, FileJson, FileType, Save, FileSpreadsheet } from 'lucide-react';
import { ExportFormat } from '../utils/exportSystem';

interface ExportModalProps {
    onExport: (format: ExportFormat | 'csv') => void;
    onClose: () => void;
    viewMode: 'EDITOR' | 'CANVAS';
}

export const ExportModal: React.FC<ExportModalProps> = ({ onExport, onClose, viewMode }) => {
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-white/20 slide-in-bottom">
                <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center">
                    <h2 className="text-lg font-black text-slate-800 dark:text-gray-100">Export Project</h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 rounded-full hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 grid grid-cols-2 gap-4">
                    <button onClick={() => onExport('json')} className="col-span-2 flex flex-row items-center justify-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-dark-border hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all group">
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Save size={20} />
                        </div>
                        <span className="font-bold text-sm text-slate-700 dark:text-gray-200">Save Project File (.json)</span>
                    </button>
                    <button onClick={() => onExport('png')} className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-dark-border hover:border-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Image size={24} />
                        </div>
                        <span className="font-bold text-sm text-slate-700 dark:text-gray-200">PNG Image</span>
                    </button>
                    <button onClick={() => onExport('jpeg')} className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-dark-border hover:border-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                        <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Image size={24} />
                        </div>
                        <span className="font-bold text-sm text-slate-700 dark:text-gray-200">JPEG Image</span>
                    </button>
                    <button onClick={() => onExport('svg')} className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-dark-border hover:border-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                        <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <FileType size={24} />
                        </div>
                        <span className="font-bold text-sm text-slate-700 dark:text-gray-200">SVG Vector</span>
                    </button>
                    <button onClick={() => onExport('dxf')} className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-dark-border hover:border-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                        <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <FileJson size={24} />
                        </div>
                        <span className="font-bold text-sm text-slate-700 dark:text-gray-200">DXF (CAD)</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
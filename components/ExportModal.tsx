import React, { useState, useEffect } from 'react';
import { X, Image, FileJson, FileType, FileSpreadsheet, Box, Check, ChevronRight, ArrowLeft } from 'lucide-react';

interface ExportModalProps {
    onExport: (format: 'json' | 'png' | 'pdf' | 'obj' | 'csv', options?: any) => void;
    onClose: () => void;
    viewMode: 'EDITOR' | 'CANVAS' | 'VOLUMES';
    projectName: string;
    onPreview?: () => Promise<string | null>;
}

type ExportFormat = 'json' | 'png' | 'pdf' | 'obj' | 'csv';

interface ExportOptions {
    filename: string;
    scale: number; // 1 = 100%, 2 = 200% etc.
    quality: 'low' | 'medium' | 'high'; // maps to DPI or compression
    pageSize: 'A4' | 'A3' | 'Letter'; // for PDF
    orientation: 'portrait' | 'landscape'; // for PDF
    transparentBackground: boolean; // for PNG
    includeBackground: boolean; // for PNG/PDF
    pdfScale: number; // 1:X scale (e.g. 50, 100)
}

export const ExportModal: React.FC<ExportModalProps> = ({ onExport, onClose, viewMode, projectName, onPreview }) => {
    const [step, setStep] = useState<'SELECT' | 'CONFIGURE'>('SELECT');
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
    const [options, setOptions] = useState<ExportOptions>({
        filename: projectName,
        scale: 2,
        quality: 'high',
        pageSize: 'A3',
        orientation: 'landscape',
        transparentBackground: true,
        includeBackground: false,
        pdfScale: 100 // Default 1:100
    });
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    useEffect(() => {
        if (step === 'CONFIGURE' && onPreview && (selectedFormat === 'png' || selectedFormat === 'pdf')) {
            setIsLoadingPreview(true);
            onPreview().then(url => {
                setPreviewUrl(url);
                setIsLoadingPreview(false);
            });
        } else {
            setPreviewUrl(null);
        }
    }, [step, onPreview, selectedFormat]);

    useEffect(() => {
        setOptions(prev => ({ ...prev, filename: projectName }));
    }, [projectName]);

    const handleFormatSelect = (format: ExportFormat) => {
        setSelectedFormat(format);
        setStep('CONFIGURE');
        // Set defaults based on format
        if (format === 'png') {
            setOptions(prev => ({ ...prev, scale: 4, transparentBackground: true }));
        } else if (format === 'pdf') {
            setOptions(prev => ({ ...prev, pageSize: 'A3', orientation: 'landscape', pdfScale: 100 }));
        }
    };

    const handleExport = () => {
        if (selectedFormat) {
            onExport(selectedFormat, options);
            onClose();
        }
    };

    const FormatButton = ({ format, icon: Icon, title, desc, colorClass, bgClass, borderClass }: any) => {
        const isDisabled = format === 'obj' && viewMode !== 'VOLUMES';
        return (
            <button
                onClick={() => !isDisabled && handleFormatSelect(format)}
                disabled={isDisabled}
                className={`flex items-center gap-4 p-4 rounded-2xl border ${borderClass} hover:bg-opacity-50 transition-all text-left w-full group relative overflow-hidden ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <div className={`w-12 h-12 ${bgClass} ${colorClass} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                    <Icon size={24} />
                </div>
                <div className="flex-1">
                    <span className="font-black text-base text-slate-800 dark:text-gray-100 block">{title}</span>
                    <span className="text-xs text-slate-500 dark:text-gray-400">{desc}</span>
                </div>
                {!isDisabled && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 dark:text-gray-500">
                        <ChevronRight size={20} />
                    </div>
                )}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden border border-white/20 scale-100 transition-all duration-300">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
                    <div className="flex items-center gap-3">
                        {step === 'CONFIGURE' && (
                            <button
                                onClick={() => setStep('SELECT')}
                                className="p-2 -ml-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-gray-400"
                            >
                                <ArrowLeft size={20} />
                            </button>
                        )}
                        <h2 className="text-xl font-black text-slate-800 dark:text-gray-100">
                            {step === 'SELECT' ? 'Export Project' : `Configure ${selectedFormat?.toUpperCase()}`}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {step === 'SELECT' ? (
                        <div className="grid grid-cols-1 gap-3">
                            <FormatButton
                                format="json"
                                icon={FileJson}
                                title="Project File (.json)"
                                desc="Save full project state and history"
                                colorClass="text-purple-600 dark:text-purple-400"
                                bgClass="bg-purple-100 dark:bg-purple-900/30"
                                borderClass="border-purple-100 dark:border-purple-900/30 hover:border-purple-300 dark:hover:border-purple-700"
                            />

                            <div className="my-2 border-t border-slate-100 dark:border-white/5" />

                            <FormatButton
                                format="png"
                                icon={Image}
                                title="High-Res Image (.png)"
                                desc="Raster export with transparency support"
                                colorClass="text-blue-600 dark:text-blue-400"
                                bgClass="bg-blue-100 dark:bg-blue-900/30"
                                borderClass="border-blue-100 dark:border-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700"
                            />

                            {(viewMode === 'CANVAS' || viewMode === 'EDITOR') && (
                                <FormatButton
                                    format="pdf"
                                    icon={FileType}
                                    title="Vector Document (.pdf)"
                                    desc="Scalable vector graphics, print ready"
                                    colorClass="text-orange-600 dark:text-orange-400"
                                    bgClass="bg-orange-100 dark:bg-orange-900/30"
                                    borderClass="border-orange-100 dark:border-orange-900/30 hover:border-orange-300 dark:hover:border-orange-700"
                                />
                            )}

                            <div title={viewMode !== 'VOLUMES' ? "Switch to Volumes View to export 3D model" : ""}>
                                <FormatButton
                                    format="obj"
                                    icon={Box}
                                    title="3D Model (.obj)"
                                    desc="Standard 3D geometry export"
                                    colorClass={viewMode === 'VOLUMES' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}
                                    bgClass={viewMode === 'VOLUMES' ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-slate-100 dark:bg-white/5"}
                                    borderClass={viewMode === 'VOLUMES' ? "border-emerald-100 dark:border-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-700" : "border-slate-200 opacity-50 cursor-not-allowed"}
                                />
                            </div>

                            <div className="my-2 border-t border-slate-100 dark:border-white/5" />

                            <FormatButton
                                format="csv"
                                icon={FileSpreadsheet}
                                title="Data Spreadsheet (.csv)"
                                desc="Room schedule and program data"
                                colorClass="text-slate-600 dark:text-slate-400"
                                bgClass="bg-slate-100 dark:bg-slate-800"
                                borderClass="border-slate-200 dark:border-slate-700 hover:border-slate-400"
                            />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Filename Input */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">File Name</label>
                                <input
                                    type="text"
                                    value={options.filename}
                                    onChange={(e) => setOptions({ ...options, filename: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                                    placeholder="Enter filename..."
                                />
                            </div>

                            {/* Format Specific Options */}
                            {selectedFormat === 'png' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scale / Quality</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[1, 2, 4].map(scale => (
                                                <button
                                                    key={scale}
                                                    onClick={() => setOptions({ ...options, scale })}
                                                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${options.scale === scale
                                                        ? 'bg-blue-500 text-white border-blue-500'
                                                        : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-blue-300'}`}
                                                >
                                                    {scale}x ({scale * 72} DPI)
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 pt-2">
                                        <button
                                            onClick={() => setOptions({ ...options, transparentBackground: !options.transparentBackground })}
                                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${options.transparentBackground ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-transparent'}`}
                                        >
                                            {options.transparentBackground && <Check size={14} />}
                                        </button>
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Transparent Background</span>
                                    </div>
                                </>
                            )}

                            {selectedFormat === 'pdf' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Page Size</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {['A4', 'A3', 'Letter'].map(size => (
                                                <button
                                                    key={size}
                                                    onClick={() => setOptions({ ...options, pageSize: size as any })}
                                                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${options.pageSize === size
                                                        ? 'bg-orange-500 text-white border-orange-500'
                                                        : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-orange-300'}`}
                                                >
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Orientation</label>
                                        <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                                            {['landscape', 'portrait'].map(orientation => (
                                                <button
                                                    key={orientation}
                                                    onClick={() => setOptions({ ...options, orientation: orientation as any })}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${options.orientation === orientation
                                                        ? 'bg-white dark:bg-dark-surface shadow text-orange-600'
                                                        : 'text-slate-500 dark:text-gray-400 hover:text-slate-700'}`}
                                                >
                                                    {orientation}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Drawing Scale</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[50, 100, 200].map(scale => (
                                                <button
                                                    key={scale}
                                                    onClick={() => setOptions({ ...options, pdfScale: scale })}
                                                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${options.pdfScale === scale
                                                        ? 'bg-orange-500 text-white border-orange-500'
                                                        : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-orange-300'}`}
                                                >
                                                    1:{scale}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Preview Area */}
                            {(selectedFormat === 'png' || selectedFormat === 'pdf') && (
                                <div className="mt-4 p-4 bg-slate-100 dark:bg-black/20 rounded-xl border border-slate-200 dark:border-white/5 flex flex-col items-center">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 self-start">Preview</label>
                                    {isLoadingPreview ? (
                                        <div className="h-32 flex items-center justify-center text-slate-400">Loading preview...</div>
                                    ) : previewUrl ? (
                                        <img src={previewUrl} alt="Preview" className="max-h-48 rounded-lg shadow-sm border border-slate-200 dark:border-white/10" />
                                    ) : (
                                        <div className="h-32 flex items-center justify-center text-slate-400 text-xs text-center px-4">Preview not available</div>
                                    )}
                                    {selectedFormat === 'pdf' && (
                                        <p className="text-[10px] text-slate-400 mt-2 text-center">
                                            Preview shows content only. Page layout will vary based on {options.pageSize} - {options.orientation}.
                                        </p>
                                    )}
                                </div>
                            )}

                            {selectedFormat === 'csv' && (
                                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                    <p className="text-sm text-slate-600 dark:text-slate-300">
                                        Exports room schedule including Name, Area, Zone, Floor, and Dimensions.
                                    </p>
                                </div>
                            )}

                            {selectedFormat === 'json' && (
                                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                    <p className="text-sm text-slate-600 dark:text-slate-300">
                                        Saves the entire project state including history, settings, and view configuration.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-white/5 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    {step === 'SELECT' ? (
                        // Step 1: Nothing here, buttons do action
                        <div />
                    ) : (
                        // Step 2: Export Button
                        <button
                            onClick={handleExport}
                            className="px-8 py-3 rounded-xl font-bold text-white bg-slate-900 dark:bg-white dark:text-black hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-2"
                        >
                            <span>Save {selectedFormat?.toUpperCase()}</span>
                            <Check size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

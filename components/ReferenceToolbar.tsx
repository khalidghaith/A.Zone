import React from 'react';
import { Lock, Unlock, Trash2, Scaling, X, Upload, Image as ImageIcon } from 'lucide-react';
import { ReferenceImage } from '../types';

interface ReferenceToolbarProps {
    isReferenceMode: boolean;
    selectedImage: ReferenceImage | null;
    onUpdateImage: (id: string, updates: Partial<ReferenceImage>) => void;
    onDeleteImage: (id: string) => void;
    onImportImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onStartScaling: (id: string) => void;
    isScalingMode: boolean;
    onCancelScaling: () => void;
}

export const ReferenceToolbar: React.FC<ReferenceToolbarProps> = ({
    isReferenceMode,
    selectedImage,
    onUpdateImage,
    onDeleteImage,
    onImportImage,
    onStartScaling,
    isScalingMode,
    onCancelScaling
}) => {
    if (!isReferenceMode && !isScalingMode) return null;

    return (
        <div
            className="flex flex-col gap-2 pointer-events-auto shrink-0 w-52"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Main Reference Controls */}
            {!isScalingMode && (
                <div className="bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-dark-border shadow-xl flex flex-col gap-3 animate-in slide-in-from-left-4 transition-all duration-300">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-dark-border pb-2">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-gray-400 flex items-center gap-2">
                            <ImageIcon size={12} /> Reference Manager
                        </h3>
                    </div>
                    
                    <label className="w-full py-2 bg-slate-100 dark:bg-white/5 hover:bg-orange-50 dark:hover:bg-orange-900/20 border border-dashed border-slate-300 dark:border-dark-border hover:border-orange-300 dark:hover:border-orange-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-gray-400 hover:text-orange-600 cursor-pointer flex items-center justify-center gap-2 transition-all">
                        <Upload size={14} /> Import Image
                        <input type="file" accept="image/*" className="hidden" onChange={onImportImage} />
                    </label>
                </div>
            )}

            {isScalingMode ? (
                <div className="bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200 dark:border-dark-border shadow-xl flex flex-col gap-3 animate-in slide-in-from-left-4 transition-all duration-300">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-orange-600">Scale by Reference</h3>
                        <button onClick={onCancelScaling} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-200">
                            <X size={14} />
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-gray-400 leading-relaxed max-w-[180px] px-1">
                        Click two points on the image that have a known real-world distance.
                    </p>
                </div>
            ) : selectedImage && (
                <div className="bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200 dark:border-dark-border shadow-xl flex flex-col gap-4 animate-in slide-in-from-left-4 transition-all duration-300">
                    <div className="flex items-center border-b border-slate-100 dark:border-dark-border pb-2 px-1">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate max-w-[100px]">
                                {selectedImage.name}
                            </span>
                            <button
                                onClick={() => onUpdateImage(selectedImage.id, { isLocked: !selectedImage.isLocked })}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${selectedImage.isLocked ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50' : 'text-slate-400 hover:text-orange-600 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'}`}
                                title={selectedImage.isLocked ? "Unlock Image" : "Lock Image"}
                            >
                                {selectedImage.isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                            </button>
                        </div>
                        <button
                            onClick={() => onDeleteImage(selectedImage.id)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-all"
                            title="Delete Image"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>

                    <div className="space-y-4 px-1 pb-1">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                                <span>Opacity</span>
                                <span>{Math.round(selectedImage.opacity * 100)}%</span>
                            </div>
                            <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-xl">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={selectedImage.opacity}
                                    onChange={(e) => onUpdateImage(selectedImage.id, { opacity: parseFloat(e.target.value) })}
                                    className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border/50 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>

                        {!selectedImage.isLocked && (
                            <button
                                onClick={() => onStartScaling(selectedImage.id)}
                                className="w-full py-2 bg-orange-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-600 transition-all shadow-md active:scale-[0.98]"
                            >
                                <Scaling size={14} /> Scale by Reference
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

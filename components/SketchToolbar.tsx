import React from 'react';
import {
    Pencil,
    Trash2,
    Type,
    Slash,
    Tangent,
    Spline,
    Square,
    ArrowRight,
    Palette,
    ChevronDown,
    Eraser,
    MousePointer2,
    BringToFront,
    SendToBack,
    Bold,
    Italic,
    Underline,
    Minus,
    MoreHorizontal
} from 'lucide-react';
import { AnnotationType, ArrowCapType } from '../types';

interface SketchToolbarProps {
    isActive: boolean;
    onToggle: () => void;
    activeType: AnnotationType | 'eraser' | 'select';
    onTypeChange: (type: AnnotationType | 'eraser' | 'select') => void;
    properties: {
        stroke: string;
        strokeWidth: number;
        strokeDash: string;
        startCap: ArrowCapType;
        endCap: ArrowCapType;
        fillet: number;
        fontSize?: number;
        fontFamily?: string;
        fontWeight?: string;
        fontStyle?: string;
        textDecoration?: string;
    };
    onPropertyChange: (key: string, value: any) => void;
    selectedAnnotation?: Annotation;
    onZIndex: (action: 'front' | 'back') => void;
    onDelete: () => void;
}

export const SketchToolbar: React.FC<SketchToolbarProps> = ({
    isActive,
    onToggle,
    activeType,
    onTypeChange,
    properties,
    onPropertyChange,
    selectedAnnotation,
    onZIndex,
    onDelete
}) => {
    const isTextMode = activeType === 'text' || selectedAnnotation?.type === 'text';

    return (
        <div className="flex flex-col gap-2 pointer-events-auto">
            <button
                onClick={onToggle}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive
                    ? 'bg-orange-500 text-white shadow-lg'
                    : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-600'
                    }`}
                title="Sketch & Annotate"
            >
                <Pencil size={16} />
            </button>

            {isActive && (
                <div className="absolute top-full left-0 w-full mt-2 bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200 dark:border-dark-border shadow-xl flex flex-col gap-4 origin-top z-50">
                    {/* Path Type Selection */}
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2">Tool</label>
                        <div className="grid grid-cols-7 gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-xl">
                            <ToolButton active={activeType === 'select'} onClick={() => onTypeChange('select')} icon={<MousePointer2 size={14} />} title="Select / Edit" />
                            <ToolButton active={activeType === 'line'} onClick={() => onTypeChange('line')} icon={<Slash size={14} />} title="Line" />
                            <ToolButton active={activeType === 'polyline'} onClick={() => onTypeChange('polyline')} icon={
                                <svg viewBox="0 0 100 100" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="8.33" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M8.096,87.798l14.393,-75.041l38.142,-0.262l31.534,38.927l-30.945,33.039l-29.964,-37.594" />
                                </svg>
                            } title="Polyline" />
                            <ToolButton active={activeType === 'arc'} onClick={() => onTypeChange('arc')} icon={<Spline size={14} />} title="Arc" />
                            <ToolButton active={activeType === 'bezier'} onClick={() => onTypeChange('bezier')} icon={<Tangent size={14} />} title="Bezier" />
                            <ToolButton active={activeType === 'text'} onClick={() => onTypeChange('text')} icon={<Type size={14} />} title="Text" />
                            <ToolButton active={activeType === 'eraser'} onClick={() => onTypeChange('eraser')} icon={<Eraser size={14} />} title="Eraser" />
                        </div>
                    </div>

                    <div className="h-px bg-slate-100 dark:bg-dark-border mx-2" />

                    {/* Properties */}
                    <div className="space-y-4 px-2 pb-2">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] font-bold text-slate-500">{selectedAnnotation ? 'Selection Color' : 'Color'}</span>
                            <div className="flex gap-1">
                                {['#f97316', '#3b82f6', '#10b981', '#ef4444', '#64748b'].map(c => (
                                    <button
                                        key={c}
                                        onClick={() => onPropertyChange('stroke', c)}
                                        className={`w-4 h-4 rounded-full border border-white dark:border-dark-surface shadow-sm hover:scale-125 ${properties.stroke === c ? 'ring-2 ring-orange-400 scale-110' : ''}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>

                        {isTextMode ? (
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                    <span>Size</span>
                                    <span>{properties.fontSize || 16}px</span>
                                </div>
                                <input
                                    type="range" min="10" max="100"
                                    value={properties.fontSize || 16}
                                    onChange={(e) => onPropertyChange('fontSize', parseInt(e.target.value))}
                                    className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                    <span>Weight</span>
                                    <span>{properties.strokeWidth}px</span>
                                </div>
                                <input
                                    type="range" min="1" max="10"
                                    value={properties.strokeWidth}
                                    onChange={(e) => onPropertyChange('strokeWidth', parseInt(e.target.value))}
                                    className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}

                        {(activeType === 'polyline' || (selectedAnnotation?.type === 'polyline')) && (
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                    <span>Fillet</span>
                                    <span>{properties.fillet}px</span>
                                </div>
                                <input
                                    type="range" min="0" max="50"
                                    value={properties.fillet}
                                    onChange={(e) => onPropertyChange('fillet', parseInt(e.target.value))}
                                    className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}

                        {isTextMode ? (
                            <>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-500">Font</span>
                                    <select
                                        value={properties.fontFamily || 'sans-serif'}
                                        onChange={(e) => onPropertyChange('fontFamily', e.target.value)}
                                        className="w-full text-[10px] bg-slate-100 dark:bg-white/5 border-none rounded-lg p-1 text-slate-700 dark:text-gray-300 focus:ring-1 ring-orange-500 outline-none"
                                    >
                                        <option value="sans-serif">Sans Serif</option>
                                        <option value="serif">Serif</option>
                                        <option value="monospace">Monospace</option>
                                        <option value="cursive">Cursive</option>
                                        <option value="fantasy">Fantasy</option>
                                    </select>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => onPropertyChange('fontWeight', properties.fontWeight === 'bold' ? 'normal' : 'bold')}
                                        className={`flex-1 p-1.5 rounded-lg flex items-center justify-center ${properties.fontWeight === 'bold' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300'}`}
                                        title="Bold"
                                    >
                                        <Bold size={14} />
                                    </button>
                                    <button
                                        onClick={() => onPropertyChange('fontStyle', properties.fontStyle === 'italic' ? 'normal' : 'italic')}
                                        className={`flex-1 p-1.5 rounded-lg flex items-center justify-center ${properties.fontStyle === 'italic' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300'}`}
                                        title="Italic"
                                    >
                                        <Italic size={14} />
                                    </button>
                                    <button
                                        onClick={() => onPropertyChange('textDecoration', properties.textDecoration === 'underline' ? 'none' : 'underline')}
                                        className={`flex-1 p-1.5 rounded-lg flex items-center justify-center ${properties.textDecoration === 'underline' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300'}`}
                                        title="Underline"
                                    >
                                        <Underline size={14} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-slate-500">Start Cap</span>
                                        <select
                                            value={properties.startCap}
                                            onChange={(e) => onPropertyChange('startCap', e.target.value)}
                                            className="w-full text-[10px] bg-slate-100 dark:bg-white/5 border-none rounded-lg p-1 text-slate-700 dark:text-gray-300 focus:ring-1 ring-orange-500 outline-none"
                                        >
                                            <option value="none">None</option>
                                            <option value="arrow">Arrow</option>
                                            <option value="open-arrow">Open Arrow</option>
                                            <option value="circle">Circle</option>
                                            <option value="square">Square</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-slate-500">End Cap</span>
                                        <select
                                            value={properties.endCap}
                                            onChange={(e) => onPropertyChange('endCap', e.target.value)}
                                            className="w-full text-[10px] bg-slate-100 dark:bg-white/5 border-none rounded-lg p-1 text-slate-700 dark:text-gray-300 focus:ring-1 ring-orange-500 outline-none"
                                        >
                                            <option value="none">None</option>
                                            <option value="arrow">Arrow</option>
                                            <option value="open-arrow">Open Arrow</option>
                                            <option value="circle">Circle</option>
                                            <option value="square">Square</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Stroke Style</label>

                                    <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl gap-1">
                                        <button
                                            onClick={() => onPropertyChange('strokeDash', '')}
                                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${!properties.strokeDash ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300'}`}
                                        >
                                            <Minus size={14} /> Solid
                                        </button>
                                        <button
                                            onClick={() => onPropertyChange('strokeDash', '5,5')}
                                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${properties.strokeDash ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300'}`}
                                        >
                                            <div className="flex gap-0.5"><div className="w-1.5 h-0.5 bg-current rounded-full" /><div className="w-1.5 h-0.5 bg-current rounded-full" /></div> Dashed
                                        </button>
                                    </div>

                                    {properties.strokeDash !== undefined && properties.strokeDash !== '' && (
                                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                                                {[
                                                    { label: 'Dash', value: '5,5' },
                                                    { label: 'Dot', value: '2,2' },
                                                    { label: 'Long', value: '10,5' },
                                                    { label: 'Mixed', value: '10,5,2,5' }
                                                ].map(preset => (
                                                    <button
                                                        key={preset.value}
                                                        onClick={() => onPropertyChange('strokeDash', preset.value)}
                                                        className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border whitespace-nowrap transition-all ${properties.strokeDash === preset.value ? 'bg-orange-500 border-orange-500 text-white' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 hover:border-orange-400'}`}
                                                    >
                                                        {preset.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="Custom Dash (e.g. 5,5)"
                                                    value={properties.strokeDash}
                                                    onChange={(e) => onPropertyChange('strokeDash', e.target.value)}
                                                    className="w-full text-[10px] bg-slate-100 dark:bg-white/5 border-none rounded-lg py-1.5 px-2.5 text-slate-700 dark:text-gray-300 focus:ring-1 ring-orange-500 outline-none font-mono"
                                                />
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-30">
                                                    <MoreHorizontal size={10} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {selectedAnnotation && (
                            <div className="pt-2 border-t border-slate-100 dark:border-dark-border grid grid-cols-3 gap-1">
                                <button onClick={() => onZIndex('front')} className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-gray-300 flex items-center justify-center" title="Bring to Front">
                                    <BringToFront size={14} />
                                </button>
                                <button onClick={() => onZIndex('back')} className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-gray-300 flex items-center justify-center" title="Send to Back">
                                    <SendToBack size={14} />
                                </button>
                                <button onClick={onDelete} className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 flex items-center justify-center" title="Delete">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const ToolButton = ({ active, onClick, icon, title }: { active: boolean, onClick: () => void, icon: React.ReactNode, title: string }) => (
    <button
        onClick={onClick}
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${active
            ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm'
            : 'text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
        title={title}
    >
        {icon}
    </button>
);

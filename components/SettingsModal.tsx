import React from 'react';
import { X } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
    settings: AppSettings;
    onUpdate: (settings: AppSettings) => void;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onUpdate, onClose }) => {
    const handleChange = (key: keyof AppSettings, value: number | boolean) => {
        onUpdate({ ...settings, [key]: value });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-white/20 slide-in-bottom">
                <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center">
                    <h2 className="text-lg font-black text-slate-800 dark:text-gray-100">Workspace Settings</h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 rounded-full hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Visual Settings */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visuals</h3>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-gray-300">
                                <span>Zone Transparency</span>
                                <span>{(settings.zoneTransparency * 100).toFixed(0)}%</span>
                            </div>
                            <input 
                                type="range" min="0" max="1" step="0.05" 
                                value={settings.zoneTransparency} 
                                onChange={(e) => handleChange('zoneTransparency', parseFloat(e.target.value))}
                                className="w-full accent-primary"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-gray-300">
                                <span>Zone Padding</span>
                                <span>{settings.zonePadding}px</span>
                            </div>
                            <input 
                                type="range" min="0" max="100" step="1" 
                                value={settings.zonePadding} 
                                onChange={(e) => handleChange('zonePadding', parseFloat(e.target.value))}
                                className="w-full accent-primary"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-gray-300">
                                <span>Stroke Width</span>
                                <span>{settings.strokeWidth}px</span>
                            </div>
                            <input 
                                type="range" min="1" max="10" step="0.5" 
                                value={settings.strokeWidth} 
                                onChange={(e) => handleChange('strokeWidth', parseFloat(e.target.value))}
                                className="w-full accent-primary"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-gray-300">
                                <span>Corner Radius</span>
                                <span>{settings.cornerRadius}px</span>
                            </div>
                            <input 
                                type="range" min="0" max="50" step="1" 
                                value={settings.cornerRadius} 
                                onChange={(e) => handleChange('cornerRadius', parseFloat(e.target.value))}
                                className="w-full accent-primary"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-gray-300">
                                <span>Font Size (Base)</span>
                                <span>{settings.fontSize}px</span>
                            </div>
                            <input 
                                type="range" min="4" max="24" step="1" 
                                value={settings.fontSize} 
                                onChange={(e) => handleChange('fontSize', parseFloat(e.target.value))}
                                className="w-full accent-primary"
                            />
                        </div>
                    </div>

                    {/* Snapping Settings */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Snapping & Interaction</h3>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-gray-300">
                                <span>Snapping Tolerance</span>
                                <span>{settings.snapTolerance}px</span>
                            </div>
                            <input 
                                type="range" min="2" max="50" step="1" 
                                value={settings.snapTolerance} 
                                onChange={(e) => handleChange('snapTolerance', parseFloat(e.target.value))}
                                className="w-full accent-primary"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700 dark:text-gray-300">Snap to Grid</span>
                            <input 
                                type="checkbox" 
                                checked={settings.snapToGrid} 
                                onChange={(e) => handleChange('snapToGrid', e.target.checked)}
                                className="w-5 h-5 accent-primary rounded-md"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700 dark:text-gray-300">Snap to Objects</span>
                            <input 
                                type="checkbox" 
                                checked={settings.snapToObjects} 
                                onChange={(e) => handleChange('snapToObjects', e.target.checked)}
                                className="w-5 h-5 accent-primary rounded-md"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700 dark:text-gray-300">Snap While Scaling</span>
                            <input 
                                type="checkbox" 
                                checked={settings.snapWhileScaling} 
                                onChange={(e) => handleChange('snapWhileScaling', e.target.checked)}
                                className="w-5 h-5 accent-primary rounded-md"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
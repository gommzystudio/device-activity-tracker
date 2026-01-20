import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Square, Activity, Wifi, Smartphone, Monitor, MessageCircle } from 'lucide-react';
import clsx from 'clsx';
import { Language, getTranslation } from '../i18n';

type Platform = 'whatsapp' | 'signal';

interface TrackerData {
    rtt: number;
    avg: number;
    median: number;
    threshold: number;
    state: string;
    timestamp: number;
}

interface DeviceInfo {
    jid: string;
    state: string;
    rtt: number;
    avg: number;
}

interface ContactCardProps {
    jid: string;
    displayNumber: string;
    data: TrackerData[];
    devices: DeviceInfo[];
    deviceCount: number;
    presence: string | null;
    profilePic: string | null;
    isTracking: boolean;
    onPause: () => void;
    onResume: () => void;
    onRemove: () => void;
    privacyMode?: boolean;
    platform?: Platform;
    language: Language;
    theme: 'light' | 'dark';
}

export function ContactCard({
    jid,
    displayNumber,
    data,
    devices,
    deviceCount,
    presence,
    profilePic,
    isTracking,
    onPause,
    onResume,
    onRemove,
    privacyMode = false,
    platform = 'whatsapp',
    language,
    theme
}: ContactCardProps) {
    const lastData = data[data.length - 1];
    const currentStatus = devices.length > 0
        ? (devices.find(d => d.state === 'OFFLINE')?.state ||
            devices.find(d => d.state.includes('Online'))?.state ||
            devices[0].state)
        : 'Unknown';

    // Blur phone number in privacy mode
    const blurredNumber = privacyMode ? displayNumber.replace(/\d/g, '•') : displayNumber;

    return (
        <div className={`rounded-xl shadow-lg border overflow-hidden transition-colors duration-300 ${theme === 'dark'
                ? 'bg-gradient-to-br from-gray-800 to-gray-700 border-gray-700'
                : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
            }`}>
            {/* Header with Stop Button */}
            <div className={`border-b px-6 py-4 flex items-center justify-between ${theme === 'dark'
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
                }`}>
                <div className="flex items-center gap-3">
                    <span className={clsx(
                        "px-2 py-1 rounded text-xs font-medium flex items-center gap-1",
                        platform === 'whatsapp' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    )}>
                        <MessageCircle size={12} />
                        {platform === 'whatsapp' ? 'WhatsApp' : 'Signal'}
                    </span>
                    <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'
                        }`}>{blurredNumber}</h3>
                </div>
                <div className="flex gap-2">
                    {isTracking ? (
                        <button
                            onClick={onPause}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 font-medium transition-colors text-sm"
                        >
                            <Square size={16} /> {getTranslation(language, 'stop')}
                        </button>
                    ) : (
                        <button
                            onClick={onResume}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 font-medium transition-colors text-sm"
                        >
                            <Square size={16} /> {getTranslation(language, 'start')}
                        </button>
                    )}
                    <button
                        onClick={onRemove}
                        className={`px-4 py-2 text-white rounded-lg hover:flex items-center gap-2 font-medium transition-colors text-sm ${theme === 'dark'
                                ? 'bg-gray-700 hover:bg-gray-600'
                                : 'bg-gray-600 hover:bg-gray-700'
                            }`}
                    >
                        <Square size={16} /> {getTranslation(language, 'remove')}
                    </button>
                </div>
            </div>

            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Status Card */}
                    <div className={`p-6 rounded-xl shadow-sm border flex flex-col items-center text-center ${theme === 'dark'
                            ? 'bg-gray-700 border-gray-600'
                            : 'bg-white border-gray-200'
                        }`}>
                        <div className="relative mb-4">
                            <div className={`w-32 h-32 rounded-full overflow-hidden border-4 shadow-md ${theme === 'dark'
                                    ? 'bg-gray-600 border-gray-800'
                                    : 'bg-gray-100 border-white'
                                }`}>
                                {profilePic ? (
                                    <img
                                        src={profilePic}
                                        alt="Profile"
                                        className={clsx(
                                            "w-full h-full object-cover transition-all duration-200",
                                            privacyMode && "blur-xl scale-110"
                                        )}
                                        style={privacyMode ? {
                                            filter: 'blur(16px) contrast(0.8)',
                                        } : {}}
                                    />
                                ) : (
                                    <div className={`w-full h-full flex items-center justify-center ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                                        }`}>
                                        {getTranslation(language, 'profilePic')}
                                    </div>
                                )}
                            </div>
                            <div className={clsx(
                                "absolute bottom-2 right-2 w-6 h-6 rounded-full border-2",
                                theme === 'dark' ? 'border-gray-800' : 'border-white',
                                currentStatus === 'OFFLINE' ? "bg-red-500" :
                                    currentStatus.includes('Online') ? "bg-green-500" : "bg-gray-400"
                            )} />
                        </div>

                        <h4 className={`text-xl font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'
                            }`}>{blurredNumber}</h4>

                        <div className="flex items-center gap-2 mb-4">
                            <span className={clsx(
                                "px-3 py-1 rounded-full text-sm font-medium",
                                currentStatus === 'OFFLINE'
                                    ? theme === 'dark' ? "bg-red-900/50 text-red-400" : "bg-red-100 text-red-700"
                                    : currentStatus.includes('Online')
                                        ? theme === 'dark' ? "bg-green-900/50 text-green-400" : "bg-green-100 text-green-700"
                                        : currentStatus === 'Standby'
                                            ? theme === 'dark' ? "bg-yellow-900/50 text-yellow-400" : "bg-yellow-100 text-yellow-700"
                                            : theme === 'dark' ? "bg-gray-600 text-gray-300" : "bg-gray-100 text-gray-700"
                            )}>
                                {currentStatus}
                            </span>
                        </div>

                        <div className={`w-full pt-4 border-t space-y-2 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-100'
                            }`}>
                            <div className={`flex justify-between items-center text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                <span className="flex items-center gap-1"><Wifi size={16} /> {getTranslation(language, 'officialStatus')}</span>
                                <span className="font-medium">
                                    {presence
                                        ? presence === 'available'
                                            ? getTranslation(language, 'available')
                                            : presence === 'unavailable'
                                                ? getTranslation(language, 'unavailable')
                                                : presence
                                        : getTranslation(language, 'unknown')}
                                </span>
                            </div>
                            <div className={`flex justify-between items-center text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                <span className="flex items-center gap-1"><Smartphone size={16} /> {getTranslation(language, 'devices')}</span>
                                <span className="font-medium">{deviceCount || 0}</span>
                            </div>
                        </div>

                        {/* Device List */}
                        {devices.length > 0 && (
                            <div className={`w-full pt-4 border-t mt-4 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-100'
                                }`}>
                                <h5 className={`text-xs font-semibold uppercase mb-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                                    }`}>{getTranslation(language, 'deviceStates')}</h5>
                                <div className="space-y-1">
                                    {devices.map((device, idx) => (
                                        <div key={device.jid} className="flex items-center justify-between text-sm py-1">
                                            <div className="flex items-center gap-2">
                                                <Monitor size={14} className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} />
                                                <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>{getTranslation(language, 'device')} {idx + 1}</span>
                                            </div>
                                            <span className={clsx(
                                                "px-2 py-0.5 rounded text-xs font-medium",
                                                device.state === 'OFFLINE'
                                                    ? theme === 'dark' ? "bg-red-900/50 text-red-400" : "bg-red-100 text-red-700"
                                                    : device.state.includes('Online')
                                                        ? theme === 'dark' ? "bg-green-900/50 text-green-400" : "bg-green-100 text-green-700"
                                                        : device.state === 'Standby'
                                                            ? theme === 'dark' ? "bg-yellow-900/50 text-yellow-400" : "bg-yellow-100 text-yellow-700"
                                                            : theme === 'dark' ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"
                                            )}>
                                                {device.state}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Metrics & Chart */}
                    <div className="md:col-span-2 space-y-6">
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className={`p-4 rounded-xl shadow-sm border ${theme === 'dark'
                                    ? 'bg-gray-700 border-gray-600'
                                    : 'bg-white border-gray-200'
                                }`}>
                                <div className={`text-sm mb-1 flex items-center gap-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                    }`}><Activity size={16} /> {getTranslation(language, 'currentAvgRTT')}</div>
                                <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-gray-900'
                                    }`}>{lastData?.avg.toFixed(0) || '-'} ms</div>
                            </div>
                            <div className={`p-4 rounded-xl shadow-sm border ${theme === 'dark'
                                    ? 'bg-gray-700 border-gray-600'
                                    : 'bg-white border-gray-200'
                                }`}>
                                <div className={`text-sm mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                    }`}>{getTranslation(language, 'median')}</div>
                                <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-gray-900'
                                    }`}>{lastData?.median.toFixed(0) || '-'} ms</div>
                            </div>
                            <div className={`p-4 rounded-xl shadow-sm border ${theme === 'dark'
                                    ? 'bg-gray-700 border-gray-600'
                                    : 'bg-white border-gray-200'
                                }`}>
                                <div className={`text-sm mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                    }`}>{getTranslation(language, 'threshold')}</div>
                                <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-yellow-400' : 'text-blue-600'
                                    }`}>{lastData?.threshold.toFixed(0) || '-'} ms</div>
                            </div>
                        </div>

                        {/* Chart */}
                        <div className={`p-6 rounded-xl shadow-sm border h-[300px] ${theme === 'dark'
                                ? 'bg-gray-700 border-gray-600'
                                : 'bg-white border-gray-200'
                            }`}>
                            <h5 className={`text-sm font-medium mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                }`}>{getTranslation(language, 'rttHistory')}</h5>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data}>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        stroke={theme === 'dark' ? '#4b5563' : '#f0f0f0'}
                                    />
                                    <XAxis dataKey="timestamp" hide stroke={theme === 'dark' ? '#9ca3af' : '#000'} />
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        stroke={theme === 'dark' ? '#9ca3af' : '#000'}
                                        tick={{ fill: theme === 'dark' ? '#9ca3af' : '#000', fontSize: 12 }}
                                    />
                                    <Tooltip
                                        labelFormatter={(t: number) => new Date(t).toLocaleTimeString()}
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: 'none',
                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                                            color: theme === 'dark' ? '#f3f4f6' : '#000000'
                                        }}
                                    />
                                    <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} name={getTranslation(language, 'currentAvgRTT')} isAnimationActive={false} />
                                    <Line type="step" dataKey="threshold" stroke="#ef4444" strokeDasharray="5 5" dot={false} name={getTranslation(language, 'threshold')} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

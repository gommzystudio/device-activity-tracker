import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, ReferenceArea } from 'recharts';
import { Activity, Wifi, Smartphone, Monitor, MessageCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Pause, Play, Trash2 } from 'lucide-react';
import clsx from 'clsx';

type Platform = 'whatsapp' | 'signal';

const stateTimelineConfig = {
    online: { label: 'Online', fill: '#bbf7d0', stroke: '#22c55e', value: 2 },
    standby: { label: 'Standby', fill: '#fde68a', stroke: '#f59e0b', value: 1 },
    offline: { label: 'Offline', fill: '#fecaca', stroke: '#ef4444', value: 0 },
    unknown: { label: 'Unknown', fill: '#e5e7eb', stroke: '#9ca3af', value: 0 }
} as const;

type TimelineStateKey = keyof typeof stateTimelineConfig;

const getTimelineStateKey = (state: string): TimelineStateKey => {
    if (state.includes('Online')) return 'online';
    if (state.includes('Standby')) return 'standby';
    if (state === 'OFFLINE') return 'offline';
    return 'unknown';
};

const formatDuration = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
};

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
    paused: boolean;
    onPause: () => void;
    onResume: () => void;
    onDelete: () => void;
    privacyMode?: boolean;
    platform?: Platform;
}

export function ContactCard({
    jid,
    displayNumber,
    data,
    devices,
    deviceCount,
    presence,
    profilePic,
    paused,
    onPause,
    onResume,
    onDelete,
    privacyMode = false,
    platform = 'whatsapp'
}: ContactCardProps) {
    const lastData = data[data.length - 1];
    const [historyRangeMs, setHistoryRangeMs] = useState<number | null>(15 * 60 * 1000);
    const [historyEndMs, setHistoryEndMs] = useState<number | null>(null);
    const [showStateHistory, setShowStateHistory] = useState(false);
    const sortedData = useMemo(() => [...data].sort((a, b) => a.timestamp - b.timestamp), [data]);
    const earliestTimestamp = sortedData[0]?.timestamp || 0;
    const latestTimestamp = sortedData[sortedData.length - 1]?.timestamp || 0;
    const windowEnd = sortedData.length > 0
        ? (!historyRangeMs ? latestTimestamp : Math.min(historyEndMs ?? latestTimestamp, latestTimestamp))
        : 0;
    const windowStart = sortedData.length > 0
        ? (!historyRangeMs ? earliestTimestamp : Math.max(windowEnd - historyRangeMs, earliestTimestamp))
        : 0;
    const windowedData = useMemo(() => {
        if (sortedData.length === 0) return [];
        if (!historyRangeMs) return sortedData;
        return sortedData.filter(point => point.timestamp >= windowStart && point.timestamp <= windowEnd);
    }, [sortedData, historyRangeMs, windowStart, windowEnd]);
    const timelineData = useMemo(() => windowedData.map((point) => {
        const stateKey = getTimelineStateKey(point.state);
        return {
            ...point,
            stateKey,
            stateLabel: stateTimelineConfig[stateKey].label,
            stateValue: stateTimelineConfig[stateKey].value
        };
    }), [windowedData]);
    const stateSegments = useMemo(() => {
        if (timelineData.length === 0) return [];
        const segments: Array<{ start: number; end: number; stateKey: TimelineStateKey }> = [];
        let currentKey = timelineData[0].stateKey;
        let segmentStart = Math.max(windowStart, timelineData[0].timestamp);

        for (let i = 1; i < timelineData.length; i += 1) {
            const point = timelineData[i];
            if (point.stateKey !== currentKey) {
                const segmentEnd = Math.min(point.timestamp, windowEnd);
                segments.push({ start: segmentStart, end: segmentEnd, stateKey: currentKey });
                currentKey = point.stateKey;
                segmentStart = Math.max(point.timestamp, windowStart);
            }
        }

        segments.push({ start: segmentStart, end: windowEnd, stateKey: currentKey });
        return segments.filter(segment => segment.end > segment.start);
    }, [timelineData, windowStart, windowEnd]);
    const stateTotals = useMemo(() => {
        const totals: Record<TimelineStateKey, number> = {
            online: 0,
            standby: 0,
            offline: 0,
            unknown: 0
        };
        stateSegments.forEach((segment) => {
            totals[segment.stateKey] += Math.max(0, segment.end - segment.start);
        });
        return totals;
    }, [stateSegments]);
    const totalWindowMs = Math.max(0, windowEnd - windowStart);
    const stateBreakdown = useMemo(() => {
        if (totalWindowMs === 0 || timelineData.length === 0) return [];
        const keys: TimelineStateKey[] = ['online', 'standby', 'offline'];
        if (stateTotals.unknown > 0) keys.push('unknown');
        return keys.map((key) => ({
            key,
            label: stateTimelineConfig[key].label,
            color: stateTimelineConfig[key].stroke,
            duration: stateTotals[key],
            percent: Math.round((stateTotals[key] / totalWindowMs) * 100)
        }));
    }, [stateTotals, totalWindowMs, timelineData.length]);
    const isLive = historyRangeMs === null || historyEndMs === null || windowEnd >= latestTimestamp;
    const canGoBack = historyRangeMs !== null && sortedData.length > 0 && windowStart > earliestTimestamp;
    const canGoForward = historyRangeMs !== null && sortedData.length > 0 && !isLive;
    const rangeOptions = [
        { label: '5m', value: 5 * 60 * 1000 },
        { label: '15m', value: 15 * 60 * 1000 },
        { label: '1h', value: 60 * 60 * 1000 },
        { label: '6h', value: 6 * 60 * 60 * 1000 },
        { label: 'All', value: null }
    ];

    const handleRangeChange = (range: number | null) => {
        setHistoryRangeMs(range);
        if (range === null || sortedData.length === 0) {
            setHistoryEndMs(null);
            return;
        }
        const minEnd = earliestTimestamp + range;
        const maxEnd = latestTimestamp;
        if (minEnd >= maxEnd) {
            setHistoryEndMs(null);
            return;
        }
        setHistoryEndMs((prev) => {
            if (prev === null) return null;
            if (prev < minEnd) return minEnd;
            if (prev >= maxEnd) return null;
            return prev;
        });
    };

    const handleHistoryBack = () => {
        if (!canGoBack || historyRangeMs === null) return;
        const minEnd = earliestTimestamp + historyRangeMs;
        const nextEnd = Math.max(windowEnd - historyRangeMs, minEnd);
        setHistoryEndMs(nextEnd);
    };

    const handleHistoryForward = () => {
        if (historyRangeMs === null || sortedData.length === 0 || isLive) return;
        const nextEnd = windowEnd + historyRangeMs;
        if (nextEnd >= latestTimestamp) {
            setHistoryEndMs(null);
        } else {
            setHistoryEndMs(nextEnd);
        }
    };
    const currentStatus = devices.length > 0
        ? (devices.find(d => d.state.includes('Online'))?.state ||
            devices.find(d => d.state.includes('Standby'))?.state ||
            devices.find(d => d.state === 'OFFLINE')?.state ||
            devices[0].state)
        : 'Unknown';
    const displayStatus = paused ? 'Paused' : currentStatus;
    const hasStateSegments = timelineData.length > 0;
    const windowLabel = sortedData.length > 0
        ? `${new Date(windowStart).toLocaleTimeString()} - ${new Date(windowEnd).toLocaleTimeString()}${historyRangeMs !== null && isLive ? ' (Live)' : ''}`
        : 'No data';

    const renderStateTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        const stateLabel = payload[0]?.payload?.stateLabel || 'Unknown';

        return (
            <div className="bg-white/95 px-3 py-2 rounded-lg shadow-md border border-white/60 text-xs text-slate-700">
                <div className="font-medium">{stateLabel}</div>
                <div>{new Date(Number(label)).toLocaleTimeString()}</div>
            </div>
        );
    };

    // Blur phone number in privacy mode
    const blurredNumber = privacyMode ? displayNumber.replace(/\d/g, '•') : displayNumber;

    return (
        <div className="relative rounded-3xl border border-white/60 bg-white/80 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] overflow-hidden">
            {/* Header with Stop Button */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/60 bg-white/70 backdrop-blur">
                <div className="flex items-center gap-3">
                    <span className={clsx(
                        "px-2 py-1 rounded text-xs font-medium flex items-center gap-1",
                        platform === 'whatsapp' ? "bg-[#dcf8eb] text-[#1f7a4f]" : "bg-[#e0ebff] text-[#2b5bb7]"
                    )}>
                        <MessageCircle size={12} />
                        {platform === 'whatsapp' ? 'WhatsApp' : 'Signal'}
                    </span>
                    <h3 className="text-lg font-semibold text-slate-900">{blurredNumber}</h3>
                </div>
                <div className="flex items-center gap-2">
                    {paused ? (
                        <button
                            onClick={onResume}
                            className="px-4 py-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 flex items-center gap-2 font-medium transition-colors text-sm shadow-sm"
                        >
                            <Play size={16} /> Start
                        </button>
                    ) : (
                        <button
                            onClick={onPause}
                            className="px-4 py-2 bg-amber-500 text-white rounded-full hover:bg-amber-600 flex items-center gap-2 font-medium transition-colors text-sm shadow-sm"
                        >
                            <Pause size={16} /> Stop
                        </button>
                    )}
                    <button
                        onClick={onDelete}
                        className="px-4 py-2 bg-rose-500 text-white rounded-full hover:bg-rose-600 flex items-center gap-2 font-medium transition-colors text-sm shadow-sm"
                    >
                        <Trash2 size={16} /> Delete
                    </button>
                </div>
            </div>

            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Status Card */}
                    <div className="bg-white/90 p-6 rounded-2xl shadow-sm border border-white/60 flex flex-col items-center text-center">
                        <div className="relative mb-4">
                            <div className="w-32 h-32 rounded-full overflow-hidden bg-[#f3ede4] border-4 border-white shadow-md">
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
                                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                                        No Image
                                    </div>
                                )}
                            </div>
                            <div className={clsx(
                                "absolute bottom-2 right-2 w-6 h-6 rounded-full border-2 border-white",
                                displayStatus === 'Paused' ? "bg-slate-400" :
                                    displayStatus === 'OFFLINE' ? "bg-rose-500" :
                                        displayStatus.includes('Online') ? "bg-emerald-500" :
                                            displayStatus === 'Standby' ? "bg-amber-400" : "bg-slate-400"
                            )} />
                        </div>

                        <h4 className="text-xl font-bold text-slate-900 mb-1">{blurredNumber}</h4>

                        <div className="flex items-center gap-2 mb-4">
                            <span className={clsx(
                                "px-3 py-1 rounded-full text-sm font-medium",
                                displayStatus === 'Paused' ? "bg-slate-100 text-slate-600" :
                                    displayStatus === 'OFFLINE' ? "bg-rose-100 text-rose-700" :
                                        displayStatus.includes('Online') ? "bg-emerald-100 text-emerald-700" :
                                            displayStatus === 'Standby' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                            )}>
                                {displayStatus}
                            </span>
                        </div>

                        <div className="w-full pt-4 border-t border-white/60 space-y-2">
                            <div className="flex justify-between items-center text-sm text-slate-600">
                                <span className="flex items-center gap-1"><Wifi size={16} /> Official Status</span>
                                <span className="font-medium">{presence || 'Unknown'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm text-slate-600">
                                <span className="flex items-center gap-1"><Smartphone size={16} /> Devices</span>
                                <span className="font-medium">{deviceCount || 0}</span>
                            </div>
                        </div>

                        {/* Device List */}
                        {devices.length > 0 && (
                            <div className="w-full pt-4 border-t border-white/60 mt-4">
                                <h5 className="text-xs font-semibold text-slate-500 uppercase mb-2">Device States</h5>
                                <div className="space-y-1">
                                    {devices.map((device, idx) => (
                                        <div key={device.jid} className="flex items-center justify-between text-sm py-1">
                                            <div className="flex items-center gap-2">
                                                <Monitor size={14} className="text-slate-400" />
                                                <span className="text-slate-600">Device {idx + 1}</span>
                                            </div>
                                            <span className={clsx(
                                                "px-2 py-0.5 rounded text-xs font-medium",
                                                device.state === 'OFFLINE' ? "bg-rose-100 text-rose-700" :
                                                    device.state.includes('Online') ? "bg-emerald-100 text-emerald-700" :
                                                        device.state === 'Standby' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
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
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="bg-white/90 p-4 rounded-2xl shadow-sm border border-white/60">
                                <div className="text-sm text-slate-500 mb-1 flex items-center gap-1"><Activity size={16} /> Current Avg RTT</div>
                                <div className="text-2xl font-bold text-slate-900">{lastData?.avg.toFixed(0) || '-'} ms</div>
                            </div>
                            <div className="bg-white/90 p-4 rounded-2xl shadow-sm border border-white/60">
                                <div className="text-sm text-slate-500 mb-1">Median (50)</div>
                                <div className="text-2xl font-bold text-slate-900">{lastData?.median.toFixed(0) || '-'} ms</div>
                            </div>
                            <div className="bg-white/90 p-4 rounded-2xl shadow-sm border border-white/60">
                                <div className="text-sm text-slate-500 mb-1">Threshold</div>
                                <div className="text-2xl font-bold text-[#1f7a4f]">{lastData?.threshold.toFixed(0) || '-'} ms</div>
                            </div>
                        </div>

                        {/* History Controls */}
                        <div className="bg-white/80 p-3 rounded-2xl shadow-sm border border-white/60 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Range</span>
                                <div className="flex rounded-full overflow-hidden border border-white/70 bg-white/70">
                                    {rangeOptions.map((option) => {
                                        const isSelected = historyRangeMs === option.value;
                                        return (
                                            <button
                                                key={option.label}
                                                type="button"
                                                onClick={() => handleRangeChange(option.value)}
                                                className={clsx(
                                                    "px-2.5 py-1 text-xs font-medium transition-colors",
                                                    isSelected
                                                        ? "bg-[#0f766e] text-white"
                                                        : "text-slate-600 hover:bg-white"
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleHistoryBack}
                                    disabled={!canGoBack}
                                    className={clsx(
                                        "px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors",
                                        canGoBack
                                            ? "bg-white/70 text-slate-700 hover:bg-white"
                                            : "bg-white/60 text-slate-400 cursor-not-allowed"
                                    )}
                                >
                                    <ChevronLeft size={14} /> Back
                                </button>
                                <button
                                    type="button"
                                    onClick={handleHistoryForward}
                                    disabled={!canGoForward}
                                    className={clsx(
                                        "px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors",
                                        canGoForward
                                            ? "bg-white/70 text-slate-700 hover:bg-white"
                                            : "bg-white/60 text-slate-400 cursor-not-allowed"
                                    )}
                                >
                                    Forward <ChevronRight size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHistoryEndMs(null)}
                                    disabled={isLive || sortedData.length === 0}
                                    className={clsx(
                                        "px-2.5 py-1 text-xs font-medium rounded-lg transition-colors",
                                        !isLive && sortedData.length > 0
                                            ? "bg-[#0f766e] text-white hover:bg-[#0b5f58]"
                                            : "bg-white/60 text-slate-400 cursor-not-allowed"
                                    )}
                                >
                                    Now
                                </button>
                            </div>
                            <div className="text-xs text-slate-500">{windowLabel}</div>
                        </div>

                        {/* Chart */}
                        <div className="bg-white/90 p-6 rounded-2xl shadow-sm border border-white/60 h-[300px]">
                            <h5 className="text-sm font-medium text-slate-500 mb-4">RTT History & Threshold</h5>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={windowedData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="timestamp" hide />
                                    <YAxis domain={['auto', 'auto']} />
                                    <Tooltip
                                        labelFormatter={(t: number) => new Date(t).toLocaleTimeString()}
                                        contentStyle={{
                                            borderRadius: '10px',
                                            border: '1px solid rgba(255, 255, 255, 0.6)',
                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                            boxShadow: '0 8px 20px -12px rgba(15, 23, 42, 0.35)'
                                        }}
                                    />
                                    <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} name="Avg RTT" isAnimationActive={false} />
                                    <Line type="step" dataKey="threshold" stroke="#ef4444" strokeDasharray="5 5" dot={false} name="Threshold" isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* State Timeline */}
                        <div className="bg-white/80 rounded-2xl shadow-sm border border-white/60">
                            <button
                                type="button"
                                onClick={() => setShowStateHistory((prev) => !prev)}
                                className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-slate-700"
                            >
                                <span>State Timeline</span>
                                {showStateHistory ? (
                                    <ChevronUp size={16} className="text-slate-500" />
                                ) : (
                                    <ChevronDown size={16} className="text-slate-500" />
                                )}
                            </button>
                            {showStateHistory && (
                                <div className="border-t border-white/60 p-4">
                                    {stateBreakdown.length > 0 && (
                                        <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-3">
                                            {stateBreakdown.map((item) => (
                                                <div key={item.key} className="flex items-center gap-2">
                                                    <span
                                                        className="w-2 h-2 rounded-full"
                                                        style={{ backgroundColor: item.color }}
                                                    />
                                                    <span>{item.label}</span>
                                                    <span className="text-slate-400">
                                                        {item.percent}% ({formatDuration(item.duration)})
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {hasStateSegments ? (
                                        <div className="h-[220px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={timelineData}>
                                                    <XAxis
                                                        dataKey="timestamp"
                                                        type="number"
                                                        domain={[windowStart, windowEnd]}
                                                        tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                                                        minTickGap={40}
                                                        tick={{ fill: '#64748b', fontSize: 11 }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <YAxis type="number" domain={[0, 2]} hide />
                                                    <Tooltip content={renderStateTooltip} />
                                                    {stateSegments.map((segment, idx) => {
                                                        const config = stateTimelineConfig[segment.stateKey];
                                                        return (
                                                            <ReferenceArea
                                                                key={`${segment.stateKey}-${idx}`}
                                                                x1={segment.start}
                                                                x2={segment.end}
                                                                y1={0}
                                                                y2={2}
                                                                fill={config.fill}
                                                                stroke={config.stroke}
                                                                fillOpacity={0.7}
                                                                ifOverflow="extendDomain"
                                                            />
                                                        );
                                                    })}
                                                    <Line
                                                        type="stepAfter"
                                                        dataKey="stateValue"
                                                        stroke="transparent"
                                                        dot={false}
                                                        isAnimationActive={false}
                                                    />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-slate-500">No data in selected window.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

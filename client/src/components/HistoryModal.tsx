import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from 'recharts';
import { X, Clock, TrendingUp, Activity, BarChart3, Calendar } from 'lucide-react';
import clsx from 'clsx';

interface StateHistoryEntry {
    state: string;
    timestamp: number;
    rtt: number;
}

interface Percentiles {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
}

interface HistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    contactName: string;
    stateHistory: StateHistoryEntry[];
    rttHistory: number[];
    percentiles: Percentiles;
    platform: 'whatsapp' | 'signal';
}

type TimeRange = '1h' | '6h' | '24h' | '7d' | 'all';

export function HistoryModal({
    isOpen,
    onClose,
    contactName,
    stateHistory,
    rttHistory,
    percentiles,
    platform
}: HistoryModalProps) {
    const [timeRange, setTimeRange] = useState<TimeRange>('24h');

    const now = Date.now();
    const timeRangeMs = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        'all': Infinity
    };

    const cutoffTime = now - timeRangeMs[timeRange];

    // Filter data by time range
    const filteredStateHistory = stateHistory.filter(entry => entry.timestamp >= cutoffTime);

    // Create RTT timeline data (add timestamps for visualization)
    const rttTimelineData = useMemo(() => {
        // Estimate timestamps for RTT history based on current time
        // Assuming roughly 2 second intervals between probes
        const interval = 2000;
        const startTime = now - (rttHistory.length * interval);

        return rttHistory
            .map((rtt, index) => ({
                timestamp: startTime + (index * interval),
                rtt: rtt
            }))
            .filter(entry => entry.timestamp >= cutoffTime);
    }, [rttHistory, cutoffTime, now]);

    // Calculate statistics
    const stats = useMemo(() => {
        if (filteredStateHistory.length === 0) {
            return {
                totalDuration: 0,
                activeTime: 0,
                onlineTime: 0,
                standbyTime: 0,
                offlineTime: 0,
                stateChanges: 0
            };
        }

        let activeTime = 0;
        let onlineTime = 0;
        let standbyTime = 0;
        let offlineTime = 0;

        for (let i = 0; i < filteredStateHistory.length - 1; i++) {
            const current = filteredStateHistory[i];
            const next = filteredStateHistory[i + 1];
            const duration = next.timestamp - current.timestamp;

            if (current.state === 'App Active') {
                activeTime += duration;
            } else if (current.state === 'App Minimized') {
                onlineTime += duration;
            } else if (current.state === 'Screen On (Idle)' || current.state === 'Standby') {
                standbyTime += duration;
            } else if (current.state === 'OFFLINE') {
                offlineTime += duration;
            }
        }

        // Add time since last state change
        const lastEntry = filteredStateHistory[filteredStateHistory.length - 1];
        const timeSinceLast = now - lastEntry.timestamp;
        if (lastEntry.state === 'App Active') {
            activeTime += timeSinceLast;
        } else if (lastEntry.state === 'App Minimized') {
            onlineTime += timeSinceLast;
        } else if (lastEntry.state === 'Screen On (Idle)' || lastEntry.state === 'Standby') {
            standbyTime += timeSinceLast;
        } else if (lastEntry.state === 'OFFLINE') {
            offlineTime += timeSinceLast;
        }

        const totalDuration = activeTime + onlineTime + standbyTime + offlineTime;

        return {
            totalDuration,
            activeTime,
            onlineTime,
            standbyTime,
            offlineTime,
            stateChanges: filteredStateHistory.length - 1
        };
    }, [filteredStateHistory, now]);

    const formatDuration = (ms: number) => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    };

    const formatPercentage = (value: number, total: number) => {
        if (total === 0) return '0%';
        return `${((value / total) * 100).toFixed(1)}%`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <BarChart3 size={32} />
                        <div>
                            <h2 className="text-2xl font-bold">{contactName}</h2>
                            <p className="text-blue-100 text-sm">Detailed Activity History</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Time Range Selector */}
                <div className="border-b border-gray-200 p-4 bg-gray-50">
                    <div className="flex items-center gap-2">
                        <Calendar size={20} className="text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">Time Range:</span>
                        <div className="flex gap-2">
                            {(['1h', '6h', '24h', '7d', 'all'] as TimeRange[]).map(range => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={clsx(
                                        "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                                        timeRange === range
                                            ? "bg-blue-600 text-white shadow-md"
                                            : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-300"
                                    )}
                                >
                                    {range === 'all' ? 'All Time' : range.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Statistics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span className="text-sm font-medium text-green-800">App Active</span>
                            </div>
                            <div className="text-2xl font-bold text-green-900">{formatDuration(stats.activeTime)}</div>
                            <div className="text-xs text-green-700 mt-1">{formatPercentage(stats.activeTime, stats.totalDuration)}</div>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                <span className="text-sm font-medium text-blue-800">Online</span>
                            </div>
                            <div className="text-2xl font-bold text-blue-900">{formatDuration(stats.onlineTime)}</div>
                            <div className="text-xs text-blue-700 mt-1">{formatPercentage(stats.onlineTime, stats.totalDuration)}</div>
                        </div>

                        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-xl border border-yellow-200">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                <span className="text-sm font-medium text-yellow-800">Standby</span>
                            </div>
                            <div className="text-2xl font-bold text-yellow-900">{formatDuration(stats.standbyTime)}</div>
                            <div className="text-xs text-yellow-700 mt-1">{formatPercentage(stats.standbyTime, stats.totalDuration)}</div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-xl border border-gray-200">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                                <span className="text-sm font-medium text-gray-800">Offline</span>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">{formatDuration(stats.offlineTime)}</div>
                            <div className="text-xs text-gray-700 mt-1">{formatPercentage(stats.offlineTime, stats.totalDuration)}</div>
                        </div>
                    </div>

                    {/* Additional Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                                <Clock size={16} />
                                <span className="text-sm">Total Duration</span>
                            </div>
                            <div className="text-xl font-bold text-gray-900">{formatDuration(stats.totalDuration)}</div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                                <TrendingUp size={16} />
                                <span className="text-sm">State Changes</span>
                            </div>
                            <div className="text-xl font-bold text-gray-900">{stats.stateChanges}</div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                                <Activity size={16} />
                                <span className="text-sm">Data Points</span>
                            </div>
                            <div className="text-xl font-bold text-gray-900">{rttHistory.length}</div>
                        </div>
                    </div>

                    {/* RTT Timeline Chart with Percentiles */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">RTT Timeline & Thresholds</h3>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={rttTimelineData}>
                                    <defs>
                                        <linearGradient id="rttGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="timestamp"
                                        tickFormatter={(t) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        stroke="#6b7280"
                                    />
                                    <YAxis stroke="#6b7280" />
                                    <Tooltip
                                        labelFormatter={(t) => new Date(t).toLocaleString()}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <ReferenceLine y={percentiles.p25} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'P25 (Very Active)', fill: '#10b981', fontSize: 12 }} />
                                    <ReferenceLine y={percentiles.p50} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'P50 (Online)', fill: '#3b82f6', fontSize: 12 }} />
                                    <ReferenceLine y={percentiles.p75} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'P75 (Standby)', fill: '#f59e0b', fontSize: 12 }} />
                                    <Area type="monotone" dataKey="rtt" stroke="#3b82f6" strokeWidth={2} fill="url(#rttGradient)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* State History Timeline */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">State Change History</h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {filteredStateHistory.slice().reverse().map((entry, idx) => (
                                <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                    <div className="flex-shrink-0">
                                        <div className={clsx(
                                            "w-3 h-3 rounded-full",
                                            entry.state === 'Very Active' ? "bg-green-500" :
                                            entry.state === 'Online' ? "bg-blue-500" :
                                            entry.state === 'Standby' ? "bg-yellow-500" :
                                            entry.state === 'Deep Standby' ? "bg-orange-500" :
                                            entry.state === 'OFFLINE' ? "bg-red-500" : "bg-gray-400"
                                        )}></div>
                                    </div>
                                    <div className="flex-1">
                                        <span className={clsx(
                                            "font-medium",
                                            entry.state === 'Very Active' ? "text-green-700" :
                                            entry.state === 'Online' ? "text-blue-700" :
                                            entry.state === 'Standby' ? "text-yellow-700" :
                                            entry.state === 'Deep Standby' ? "text-orange-700" :
                                            entry.state === 'OFFLINE' ? "text-red-700" : "text-gray-700"
                                        )}>
                                            {entry.state}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        RTT: <span className="font-mono">{entry.rtt.toFixed(0)}ms</span>
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {new Date(entry.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Percentile Information */}
                    <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-6 rounded-xl border border-purple-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Statistical Thresholds</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <div className="text-xs text-gray-600 mb-1">P25 (Very Active)</div>
                                <div className="text-2xl font-bold text-green-600">{percentiles.p25.toFixed(0)}ms</div>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <div className="text-xs text-gray-600 mb-1">P50 (Median)</div>
                                <div className="text-2xl font-bold text-blue-600">{percentiles.p50.toFixed(0)}ms</div>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <div className="text-xs text-gray-600 mb-1">P75 (Standby)</div>
                                <div className="text-2xl font-bold text-yellow-600">{percentiles.p75.toFixed(0)}ms</div>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <div className="text-xs text-gray-600 mb-1">P90 (Deep Standby)</div>
                                <div className="text-2xl font-bold text-orange-600">{percentiles.p90.toFixed(0)}ms</div>
                            </div>
                        </div>
                        <div className="mt-4 text-sm text-gray-600">
                            <p className="italic">
                                These percentile-based thresholds provide much more accurate state detection than simple averages.
                                Values below P25 indicate very active usage, while values above P75 suggest the device is in standby mode.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import {Eye, EyeOff, Plus, Trash2, Zap, MessageCircle, Settings} from 'lucide-react';
import { socket, Platform, ConnectionState } from '../App';
import { ContactCard } from './ContactCard';
import { Login } from './Login';

type ProbeMethod = 'delete' | 'reaction';

interface DashboardProps {
    connectionState: ConnectionState;
}

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

interface ContactInfo {
    jid: string;
    displayNumber: string;
    contactName: string;
    data: TrackerData[];
    devices: DeviceInfo[];
    deviceCount: number;
    presence: string | null;
    profilePic: string | null;
    platform: Platform;
    paused: boolean;
}

export function Dashboard({ connectionState }: DashboardProps) {
    const [inputNumber, setInputNumber] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<Platform>(
        connectionState.whatsapp ? 'whatsapp' : 'signal'
    );
    const [contacts, setContacts] = useState<Map<string, ContactInfo>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [privacyMode, setPrivacyMode] = useState(false);
    const [probeMethod, setProbeMethod] = useState<ProbeMethod>('delete');
    const [showConnections, setShowConnections] = useState(false);

    useEffect(() => {
        function onTrackerUpdate(update: any) {
            const { jid, ...data } = update;
            if (!jid) return;

            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(jid);

                if (contact) {
                    // Update existing contact
                    const updatedContact = { ...contact };

                    if (data.presence !== undefined) {
                        updatedContact.presence = data.presence;
                    }
                    if (data.deviceCount !== undefined) {
                        updatedContact.deviceCount = data.deviceCount;
                    }
                    if (data.devices !== undefined) {
                        updatedContact.devices = data.devices;
                    }

                    // Add to chart data
                    if (data.median !== undefined && data.devices && data.devices.length > 0) {
                        const newDataPoint: TrackerData = {
                            rtt: data.devices[0].rtt,
                            avg: data.devices[0].avg,
                            median: data.median,
                            threshold: data.threshold,
                            state: data.devices.find((d: DeviceInfo) => d.state.includes('Online'))?.state ||
                                data.devices.find((d: DeviceInfo) => d.state.includes('Standby'))?.state ||
                                data.devices.find((d: DeviceInfo) => d.state === 'OFFLINE')?.state ||
                                data.devices[0].state,
                            timestamp: Date.now(),
                        };
                        updatedContact.data = [...updatedContact.data, newDataPoint];
                    }

                    next.set(jid, updatedContact);
                }

                return next;
            });
        }

        function onProfilePic(data: { jid: string, url: string | null }) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(data.jid);
                if (contact) {
                    next.set(data.jid, { ...contact, profilePic: data.url });
                }
                return next;
            });
        }

        function onContactName(data: { jid: string, name: string }) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(data.jid);
                if (contact) {
                    next.set(data.jid, { ...contact, contactName: data.name });
                }
                return next;
            });
        }

        function onContactAdded(data: { jid: string, number: string, platform?: Platform }) {
            setContacts(prev => {
                const next = new Map(prev);
                next.set(data.jid, {
                    jid: data.jid,
                    displayNumber: data.number,
                    contactName: data.number,
                    data: [],
                    devices: [],
                    deviceCount: 0,
                    presence: null,
                    profilePic: null,
                    platform: data.platform || 'whatsapp',
                    paused: false
                });
                return next;
            });
            setInputNumber('');
        }

        function onContactRemoved(jid: string) {
            setContacts(prev => {
                const next = new Map(prev);
                next.delete(jid);
                return next;
            });
        }

        function onError(data: { jid?: string, message: string }) {
            setError(data.message);
            setTimeout(() => setError(null), 3000);
        }

        function onProbeMethod(method: ProbeMethod) {
            setProbeMethod(method);
        }

        function onTrackedContacts(contacts: { id: string, platform: Platform, paused?: boolean }[]) {
            setContacts(prev => {
                const next = new Map(prev);
                contacts.forEach(({ id, platform, paused }) => {
                    if (!next.has(id)) {
                        // Extract display number from id
                        let displayNumber = id;
                        if (platform === 'signal') {
                            displayNumber = id.replace('signal:', '');
                        } else {
                            // WhatsApp JID format: number@s.whatsapp.net
                            displayNumber = id.split('@')[0];
                        }
                        next.set(id, {
                            jid: id,
                            displayNumber,
                            contactName: displayNumber,
                            data: [],
                            devices: [],
                            deviceCount: 0,
                            presence: null,
                            profilePic: null,
                            platform,
                            paused: paused ?? false
                        });
                    } else if (paused !== undefined) {
                        const contact = next.get(id);
                        if (contact) {
                            next.set(id, { ...contact, paused });
                        }
                    }
                });
                return next;
            });
        }

        function onTrackingState(data: { jid: string, paused: boolean }) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(data.jid);
                if (contact) {
                    next.set(data.jid, { ...contact, paused: data.paused });
                }
                return next;
            });
        }

        socket.on('tracker-update', onTrackerUpdate);
        socket.on('profile-pic', onProfilePic);
        socket.on('contact-name', onContactName);
        socket.on('contact-added', onContactAdded);
        socket.on('contact-removed', onContactRemoved);
        socket.on('error', onError);
        socket.on('probe-method', onProbeMethod);
        socket.on('tracked-contacts', onTrackedContacts);
        socket.on('tracking-state', onTrackingState);

        // Request tracked contacts after listeners are set up
        socket.emit('get-tracked-contacts');

        return () => {
            socket.off('tracker-update', onTrackerUpdate);
            socket.off('profile-pic', onProfilePic);
            socket.off('contact-name', onContactName);
            socket.off('contact-added', onContactAdded);
            socket.off('contact-removed', onContactRemoved);
            socket.off('error', onError);
            socket.off('probe-method', onProbeMethod);
            socket.off('tracked-contacts', onTrackedContacts);
            socket.off('tracking-state', onTrackingState);
        };
    }, []);

    const handleAdd = () => {
        if (!inputNumber) return;
        socket.emit('add-contact', { number: inputNumber, platform: selectedPlatform });
    };

    const handlePause = (jid: string) => {
        socket.emit('pause-contact', jid);
    };

    const handleResume = (jid: string) => {
        socket.emit('resume-contact', jid);
    };

    const handleDelete = (jid: string) => {
        socket.emit('delete-contact', jid);
    };

    const handleProbeMethodChange = (method: ProbeMethod) => {
        socket.emit('set-probe-method', method);
    };

    return (
        <div className="space-y-8">
            {/* Add Contact Form */}
            <div className="glass-panel p-6 rounded-2xl shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <h2 className="text-2xl font-semibold text-slate-900">Track Contacts</h2>
                        {/* Manage Connections button */}
                        <button
                            onClick={() => setShowConnections(!showConnections)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-1 ${
                                showConnections
                                    ? 'bg-[#0f766e] text-white shadow-sm'
                                    : 'bg-white/70 text-slate-600 hover:bg-white'
                            }`}
                        >
                            <Settings size={14} />
                            {showConnections ? 'Hide Connections' : 'Manage Connections'}
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Probe Method Toggle */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">Probe Method:</span>
                            <div className="flex rounded-full overflow-hidden border border-[#e6dfd3] bg-white/70">
                                <button
                                    onClick={() => handleProbeMethodChange('delete')}
                                    className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 flex items-center gap-1 ${
                                        probeMethod === 'delete'
                                            ? 'bg-[#0f766e] text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-white'
                                    }`}
                                    title="Silent Delete Probe - Completely covert, target sees nothing"
                                >
                                    <Trash2 size={14} />
                                    Delete
                                </button>
                                <button
                                    onClick={() => handleProbeMethodChange('reaction')}
                                    className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 flex items-center gap-1 ${
                                        probeMethod === 'reaction'
                                            ? 'bg-[#e07a4f] text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-white'
                                    }`}
                                    title="Reaction Probe - Sends reactions to non-existent messages"
                                >
                                    <Zap size={14} />
                                    Reaction
                                </button>
                            </div>
                        </div>
                        {/* Privacy Mode Toggle */}
                        <button
                            onClick={() => setPrivacyMode(!privacyMode)}
                            className={`px-4 py-2 rounded-full flex items-center gap-2 font-medium transition-all duration-200 ${
                                privacyMode 
                                    ? 'bg-[#1f4b48] text-white shadow-md' 
                                    : 'bg-white/70 text-slate-600 hover:bg-white'
                            }`}
                            title={privacyMode ? 'Privacy Mode: ON (Click to disable)' : 'Privacy Mode: OFF (Click to enable)'}
                        >
                            {privacyMode ? (
                                <>
                                    <EyeOff size={20} />
                                    <span>Privacy ON</span>
                                </>
                            ) : (
                                <>
                                    <Eye size={20} />
                                    <span>Privacy OFF</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
                <div className="flex flex-col gap-4 md:flex-row">
                    {/* Platform Selector */}
                    <div className="flex rounded-full overflow-hidden border border-[#e6dfd3] bg-white/70">
                        <button
                            onClick={() => setSelectedPlatform('whatsapp')}
                            disabled={!connectionState.whatsapp}
                            className={`px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                                selectedPlatform === 'whatsapp'
                                    ? 'bg-[#1f7a4f] text-white'
                                    : connectionState.whatsapp
                                        ? 'text-slate-600 hover:bg-white'
                                        : 'text-slate-400 cursor-not-allowed'
                            }`}
                            title={connectionState.whatsapp ? 'WhatsApp' : 'WhatsApp not connected'}
                        >
                            <MessageCircle size={16} />
                            WhatsApp
                        </button>
                        <button
                            onClick={() => setSelectedPlatform('signal')}
                            disabled={!connectionState.signal}
                            className={`px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                                selectedPlatform === 'signal'
                                    ? 'bg-[#2563eb] text-white'
                                    : connectionState.signal
                                        ? 'text-slate-600 hover:bg-white'
                                        : 'text-slate-400 cursor-not-allowed'
                            }`}
                            title={connectionState.signal ? 'Signal' : 'Signal not connected'}
                        >
                            <MessageCircle size={16} />
                            Signal
                        </button>
                    </div>
                    <input
                        type="text"
                        placeholder="Enter phone number (e.g. 491701234567)"
                        className="flex-1 px-4 py-2 rounded-xl border border-[#e6dfd3] bg-white/80 text-slate-800 shadow-sm focus:ring-2 focus:ring-[#e07a4f]/40 focus:border-[#e07a4f] outline-none"
                        value={inputNumber}
                        onChange={(e) => setInputNumber(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <button
                        onClick={handleAdd}
                        className="px-6 py-2 bg-[#0f766e] text-white rounded-xl hover:bg-[#0b5f58] flex items-center gap-2 font-medium transition-colors shadow-sm"
                    >
                        <Plus size={20} /> Add Contact
                    </button>
                </div>
                {error && <p className="mt-2 text-rose-500 text-sm">{error}</p>}
            </div>

            {/* Connections Panel */}
            {showConnections && (
                <Login connectionState={connectionState} />
            )}

            {/* Contact Cards */}
            {contacts.size === 0 ? (
                <div className="bg-white/60 border border-dashed border-[#e5d5c3] rounded-2xl p-12 text-center shadow-sm">
                    <p className="text-slate-600 text-lg">No contacts being tracked</p>
                    <p className="text-slate-500 text-sm mt-2">Add a contact above to start tracking</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {Array.from(contacts.values()).map(contact => (
                        <ContactCard
                            key={contact.jid}
                            jid={contact.jid}
                            displayNumber={contact.contactName}
                            data={contact.data}
                            devices={contact.devices}
                            deviceCount={contact.deviceCount}
                            presence={contact.presence}
                            profilePic={contact.profilePic}
                            paused={contact.paused}
                            onPause={() => handlePause(contact.jid)}
                            onResume={() => handleResume(contact.jid)}
                            onDelete={() => handleDelete(contact.jid)}
                            privacyMode={privacyMode}
                            platform={contact.platform}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

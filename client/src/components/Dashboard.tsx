import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, Zap, MessageCircle, Settings } from 'lucide-react';
import { socket, Platform, ConnectionState } from '../App';
import { ContactCard } from './ContactCard';
import { ContactsList } from './ContactsList';
import { Login } from './Login';
import { Language, getTranslation } from '../i18n';

type ProbeMethod = 'delete' | 'reaction';

interface DashboardProps {
    connectionState: ConnectionState;
    language: Language;
    theme: 'light' | 'dark';
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
    isTracking: boolean;
}

export function Dashboard({ connectionState, language, theme }: DashboardProps) {
    const [inputNumber, setInputNumber] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<Platform>(
        connectionState.whatsapp ? 'whatsapp' : 'signal'
    );
    const [contacts, setContacts] = useState<Map<string, ContactInfo>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [privacyMode, setPrivacyMode] = useState(false);
    const [probeMethod, setProbeMethod] = useState<ProbeMethod>('delete');
    const [showConnections, setShowConnections] = useState(false);
    const [minDelay, setMinDelay] = useState(500);
    const [maxDelay, setMaxDelay] = useState(1000);
    const [delayApplying, setDelayApplying] = useState(false);

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
                            state: data.devices.find((d: DeviceInfo) => d.state.includes('Online'))?.state || data.devices[0].state,
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
                const existingContact = next.get(data.jid);
                next.set(data.jid, {
                    jid: data.jid,
                    displayNumber: data.number,
                    contactName: existingContact?.contactName || data.number,
                    data: existingContact?.data || [],
                    devices: existingContact?.devices || [],
                    deviceCount: existingContact?.deviceCount || 0,
                    presence: existingContact?.presence || null,
                    profilePic: existingContact?.profilePic || null,
                    platform: data.platform || 'whatsapp',
                    isTracking: true
                });
                return next;
            });
            setInputNumber('');
        }

        function onTrackingPaused(jid: string) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(jid);
                if (contact) {
                    next.set(jid, { ...contact, isTracking: false });
                }
                return next;
            });
        }

        function onTrackingResumed(jid: string) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(jid);
                if (contact) {
                    next.set(jid, { ...contact, isTracking: true });
                }
                return next;
            });
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

        function onTrackedContacts(contacts: { id: string, platform: Platform }[]) {
            setContacts(prev => {
                const next = new Map(prev);
                contacts.forEach(({ id, platform }) => {
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
                            isTracking: true
                        });
                    }
                });
                return next;
            });
        }

        socket.on('tracker-update', onTrackerUpdate);
        socket.on('profile-pic', onProfilePic);
        socket.on('contact-name', onContactName);
        socket.on('contact-added', onContactAdded);
        socket.on('tracking-paused', onTrackingPaused);
        socket.on('tracking-resumed', onTrackingResumed);
        socket.on('contact-removed', onContactRemoved);
        socket.on('error', onError);
        socket.on('probe-method', onProbeMethod);
        socket.on('tracked-contacts', onTrackedContacts);

        // Request tracked contacts after listeners are set up
        socket.emit('get-tracked-contacts');

        return () => {
            socket.off('tracker-update', onTrackerUpdate);
            socket.off('profile-pic', onProfilePic);
            socket.off('contact-name', onContactName);
            socket.off('contact-added', onContactAdded);
            socket.off('tracking-paused', onTrackingPaused);
            socket.off('tracking-resumed', onTrackingResumed);
            socket.off('contact-removed', onContactRemoved);
            socket.off('error', onError);
            socket.off('probe-method', onProbeMethod);
            socket.off('tracked-contacts', onTrackedContacts);
        };
    }, []);

    const handleAdd = () => {
        if (!inputNumber) return;
        socket.emit('add-contact', { number: inputNumber, platform: selectedPlatform });
    };

    const handlePauseTracking = (jid: string) => {
        socket.emit('pause-tracking', jid);
    };

    const handleResumeTracking = (jid: string) => {
        socket.emit('resume-tracking', jid);
    };

    const handleRemoveContact = (jid: string) => {
        socket.emit('remove-contact', jid);
    };

    const handleProbeMethodChange = (method: ProbeMethod) => {
        socket.emit('set-probe-method', method);
    };

    const handleDelayChange = () => {
        if (minDelay >= maxDelay) {
            setError('Min delay must be less than max delay');
            return;
        }
        setDelayApplying(true);
        socket.emit('set-probe-delay', { minDelay, maxDelay });

        // Visual feedback: reset button state after 1.5 seconds
        setTimeout(() => {
            setDelayApplying(false);
        }, 1500);
    };

    return (
        <div className="space-y-6">
            {/* Contacts List Management */}
            {contacts.size > 0 && (
                <ContactsList
                    contacts={Array.from(contacts.values()).map(c => ({
                        jid: c.jid,
                        displayNumber: c.contactName,
                        isTracking: c.isTracking,
                        platform: c.platform,
                        state: c.devices?.[0]?.state
                    }))}
                    onPause={handlePauseTracking}
                    onResume={handleResumeTracking}
                    onRemove={handleRemoveContact}
                    language={language}
                    theme={theme}
                />
            )}

            {/* Add Contact Form */}
            <div className={`p-6 rounded-xl shadow-sm border ${theme === 'dark'
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
                }`}>
                <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <h2 className={`text-lg sm:text-xl font-semibold whitespace-nowrap ${theme === 'dark' ? 'text-white' : 'text-gray-900'
                            }`}>{getTranslation(language, 'trackContacts')}</h2>
                        {/* Manage Connections button */}
                        <button
                            onClick={() => setShowConnections(!showConnections)}
                            className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap ${showConnections
                                ? 'bg-blue-600 text-white'
                                : theme === 'dark'
                                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            <Settings size={14} />
                            {showConnections ? getTranslation(language, 'hideConnections') : getTranslation(language, 'manageConnections')}
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Probe Delay Settings */}
                        <div className={`flex items-center gap-2 p-3 rounded-lg border ${theme === 'dark'
                                ? 'bg-gray-700 border-gray-600'
                                : 'bg-gray-50 border-gray-300'
                            }`}>
                            <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                                }`}>{getTranslation(language, 'probeDelay')}</label>
                            <input
                                type="number"
                                min="10"
                                max="5000"
                                value={minDelay}
                                onChange={(e) => setMinDelay(parseInt(e.target.value))}
                                className={`w-16 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none ${theme === 'dark'
                                        ? 'bg-gray-600 border-gray-500 text-white'
                                        : 'border-gray-300'
                                    }`}
                                title={getTranslation(language, 'minDelay')}
                            />
                            <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                                }`}>-</span>
                            <input
                                type="number"
                                min="10"
                                max="5000"
                                value={maxDelay}
                                onChange={(e) => setMaxDelay(parseInt(e.target.value))}
                                className={`w-16 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none ${theme === 'dark'
                                        ? 'bg-gray-600 border-gray-500 text-white'
                                        : 'border-gray-300'
                                    }`}
                                title={getTranslation(language, 'maxDelay')}
                            />
                            <button
                                onClick={handleDelayChange}
                                disabled={delayApplying}
                                className={`px-3 py-1.5 text-sm font-medium rounded transition-all duration-300 flex items-center justify-center min-w-10 ${delayApplying
                                        ? 'bg-green-600 text-white scale-110 shadow-lg'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                            >
                                {delayApplying ? '✓' : '✓'}
                            </button>
                        </div>

                        {/* Probe Method Toggle */}
                        <div className="flex items-center gap-2">
                            <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                                }`}>{getTranslation(language, 'probeMethod')}</span>
                            <div className={`flex rounded-lg overflow-hidden border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'
                                }`}>
                                <button
                                    onClick={() => handleProbeMethodChange('delete')}
                                    className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 flex items-center gap-1 ${probeMethod === 'delete'
                                        ? 'bg-purple-600 text-white'
                                        : theme === 'dark'
                                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    title={getTranslation(language, 'deleteProbeTitle')}
                                >
                                    <Trash2 size={14} />
                                    {getTranslation(language, 'delete')}
                                </button>
                                <button
                                    onClick={() => handleProbeMethodChange('reaction')}
                                    className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 flex items-center gap-1 ${probeMethod === 'reaction'
                                        ? 'bg-yellow-500 text-white'
                                        : theme === 'dark'
                                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    title={getTranslation(language, 'reactionProbeTitle')}
                                >
                                    <Zap size={14} />
                                    {getTranslation(language, 'reaction')}
                                </button>
                            </div>
                        </div>
                        {/* Privacy Mode Toggle */}
                         <button
                             onClick={() => setPrivacyMode(!privacyMode)}
                             className={`px-3 sm:px-4 py-2 rounded-full flex items-center gap-2 font-bold transition-all duration-300 whitespace-nowrap border-2 ${
                                 privacyMode
                                     ? theme === 'dark'
                                         ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-500 hover:border-green-400'
                                         : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white border-green-400 hover:border-green-300'
                                     : theme === 'dark'
                                     ? 'bg-gray-700 text-gray-300 border-gray-600 hover:border-gray-500'
                                     : 'bg-gray-200 text-gray-700 border-gray-300 hover:border-gray-400'
                             }`}
                             style={{
                                 boxShadow: privacyMode
                                     ? theme === 'dark'
                                         ? '0 4px 15px rgba(34, 197, 94, 0.3)'
                                         : '0 4px 15px rgba(16, 185, 129, 0.3)'
                                     : 'none',
                                 transition: 'all 300ms ease-out'
                             }}
                             title={privacyMode ? getTranslation(language, 'privacyModeOn') : getTranslation(language, 'privacyModeOff')}
                         >
                             {privacyMode ? (
                                 <>
                                     <EyeOff size={18} className="flex-shrink-0" />
                                     <span className="text-xs sm:text-sm">{getTranslation(language, 'privacyON')}</span>
                                 </>
                             ) : (
                                 <>
                                     <Eye size={18} className="flex-shrink-0" />
                                     <span className="text-xs sm:text-sm">{getTranslation(language, 'privacyOFF')}</span>
                                 </>
                             )}
                         </button>
                    </div>
                </div>
                <div className="flex gap-4">
                    {/* Platform Selector */}
                    <div className={`flex flex-wrap rounded-lg overflow-hidden border ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'
                        }`}>
                        <button
                            onClick={() => setSelectedPlatform('whatsapp')}
                            disabled={!connectionState.whatsapp}
                            className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-1 sm:gap-2 whitespace-nowrap ${selectedPlatform === 'whatsapp'
                                ? 'bg-green-600 text-white'
                                : connectionState.whatsapp
                                    ? theme === 'dark'
                                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    : theme === 'dark'
                                        ? 'bg-gray-700 text-gray-600 cursor-not-allowed'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                            title={connectionState.whatsapp ? 'WhatsApp' : getTranslation(language, 'whatsappNotConnected')}
                        >
                            <MessageCircle size={14} className="flex-shrink-0" />
                            <span>WhatsApp</span>
                        </button>
                        <button
                            onClick={() => setSelectedPlatform('signal')}
                            disabled={!connectionState.signal}
                            className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-1 sm:gap-2 whitespace-nowrap ${selectedPlatform === 'signal'
                                ? 'bg-blue-600 text-white'
                                : connectionState.signal
                                    ? theme === 'dark'
                                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    : theme === 'dark'
                                        ? 'bg-gray-700 text-gray-600 cursor-not-allowed'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                            title={connectionState.signal ? 'Signal' : getTranslation(language, 'signalNotConnected')}
                        >
                            <MessageCircle size={14} className="flex-shrink-0" />
                            <span>Signal</span>
                        </button>
                    </div>
                    <input
                        type="text"
                        placeholder={getTranslation(language, 'enterPhoneNumber')}
                        className={`flex-1 min-w-[200px] px-3 sm:px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${theme === 'dark'
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                                : 'border-gray-300'
                            }`}
                        value={inputNumber}
                        onChange={(e) => setInputNumber(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <button
                        onClick={handleAdd}
                        className={`px-3 sm:px-6 py-2 rounded-full flex items-center gap-1 sm:gap-2 font-bold whitespace-nowrap text-xs sm:text-sm flex-shrink-0 border-2 transition-all duration-300 ${
                            theme === 'dark'
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-indigo-500 hover:border-indigo-400'
                                : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-blue-400 hover:border-blue-300'
                        }`}
                        style={{
                            boxShadow: theme === 'dark'
                                ? '0 4px 15px rgba(79, 70, 229, 0.4)'
                                : '0 4px 15px rgba(59, 130, 246, 0.4)',
                            transition: 'all 300ms ease-out'
                        }}
                    >
                        <Plus size={18} className="flex-shrink-0" /> <span>{getTranslation(language, 'addContact')}</span>
                    </button>
                </div>
                {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
            </div>

            {/* Connections Panel */}
            {showConnections && (
                <Login connectionState={connectionState} language={language} theme={theme} />
            )}

            {/* Contact Cards */}
            {contacts.size === 0 ? (
                <div className={`border-2 border-dashed rounded-xl p-12 text-center ${theme === 'dark'
                        ? 'bg-gray-800 border-gray-700'
                        : 'bg-gray-50 border-gray-300'
                    }`}>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                        }`}>{getTranslation(language, 'noContactsTracked')}</p>
                    <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                        }`}>{getTranslation(language, 'addContactToStart')}</p>
                </div>
            ) : (
                <div className="space-y-6">
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
                            isTracking={contact.isTracking}
                            onPause={() => handlePauseTracking(contact.jid)}
                            onResume={() => handleResumeTracking(contact.jid)}
                            onRemove={() => handleRemoveContact(contact.jid)}
                            privacyMode={privacyMode}
                            platform={contact.platform}
                            language={language}
                            theme={theme}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

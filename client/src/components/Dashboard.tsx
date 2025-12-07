import React, { useEffect, useState } from 'react';
import {Eye, EyeOff, Plus} from 'lucide-react';
import { socket } from '../App';
import { ContactCard } from './ContactCard';

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
}

export function Dashboard() {
    const [inputNumber, setInputNumber] = useState('');
    const [contacts, setContacts] = useState<Map<string, ContactInfo>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [privacyMode, setPrivacyMode] = useState(false);

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

        function onContactAdded(data: { jid: string, number: string }) {
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
                    profilePic: null
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

        socket.on('tracker-update', onTrackerUpdate);
        socket.on('profile-pic', onProfilePic);
        socket.on('contact-name', onContactName);
        socket.on('contact-added', onContactAdded);
        socket.on('contact-removed', onContactRemoved);
        socket.on('error', onError);

        return () => {
            socket.off('tracker-update', onTrackerUpdate);
            socket.off('profile-pic', onProfilePic);
            socket.off('contact-name', onContactName);
            socket.off('contact-added', onContactAdded);
            socket.off('contact-removed', onContactRemoved);
            socket.off('error', onError);
        };
    }, []);

    const handleAdd = () => {
        if (!inputNumber) return;
        socket.emit('add-contact', inputNumber);
    };

    const handleRemove = (jid: string) => {
        socket.emit('remove-contact', jid);
    };

    return (
        <div className="space-y-6">
            {/* Add Contact Form */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Track Contacts</h2>
                    <button
                        onClick={() => setPrivacyMode(!privacyMode)}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all duration-200 ${
                            privacyMode 
                                ? 'bg-green-600 text-white hover:bg-green-700 shadow-md' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
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
                <div className="flex gap-4">
                    <input
                        type="text"
                        placeholder="Enter phone number (e.g. 491701234567)"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        value={inputNumber}
                        onChange={(e) => setInputNumber(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <button
                        onClick={handleAdd}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium transition-colors"
                    >
                        <Plus size={20} /> Add Contact
                    </button>
                </div>
                {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
            </div>

            {/* Contact Cards */}
            {contacts.size === 0 ? (
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                    <p className="text-gray-500 text-lg">No contacts being tracked</p>
                    <p className="text-gray-400 text-sm mt-2">Add a contact above to start tracking</p>
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
                            onRemove={() => handleRemove(contact.jid)}
                            privacyMode={privacyMode}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';

// Create socket with autoConnect disabled so we can add listeners before connecting
export const socket: Socket = io('http://localhost:3001', { autoConnect: false });

export type Platform = 'whatsapp' | 'signal';

export interface ConnectionState {
    whatsapp: boolean;
    signal: boolean;
    signalNumber: string | null;
    signalApiAvailable: boolean;
    signalQrImage: string | null;
    whatsappQr: string | null;
}

function App() {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [connectionState, setConnectionState] = useState<ConnectionState>({
        whatsapp: false,
        signal: false,
        signalNumber: null,
        signalApiAvailable: false,
        signalQrImage: null,
        whatsappQr: null
    });

    const isAnyPlatformReady = connectionState.whatsapp || connectionState.signal;

    useEffect(() => {
        function onConnect() {
            setIsConnected(true);
        }

        function onDisconnect() {
            setIsConnected(false);
            setConnectionState({
                whatsapp: false,
                signal: false,
                signalNumber: null,
                signalApiAvailable: false,
                signalQrImage: null,
                whatsappQr: null
            });
        }

        function onWhatsAppConnectionOpen() {
            setConnectionState(prev => ({ ...prev, whatsapp: true, whatsappQr: null }));
        }

        function onWhatsAppQr(qr: string) {
            console.log('[WHATSAPP] Received QR code');
            setConnectionState(prev => ({ ...prev, whatsappQr: qr }));
        }

        function onSignalConnectionOpen(data: { number: string }) {
            setConnectionState(prev => ({
                ...prev,
                signal: true,
                signalNumber: data.number
            }));
        }

        function onSignalDisconnected() {
            setConnectionState(prev => ({
                ...prev,
                signal: false,
                signalNumber: null
            }));
        }

        function onSignalApiStatus(data: { available: boolean }) {
            setConnectionState(prev => ({ ...prev, signalApiAvailable: data.available }));
        }

        function onSignalQrImage(url: string) {
            console.log('[SIGNAL] Received QR image URL:', url);
            setConnectionState(prev => ({ ...prev, signalQrImage: url }));
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('qr', onWhatsAppQr);
        socket.on('connection-open', onWhatsAppConnectionOpen);
        socket.on('signal-connection-open', onSignalConnectionOpen);
        socket.on('signal-disconnected', onSignalDisconnected);
        socket.on('signal-api-status', onSignalApiStatus);
        socket.on('signal-qr-image', onSignalQrImage);

        // Now connect after listeners are set up
        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('qr', onWhatsAppQr);
            socket.off('connection-open', onWhatsAppConnectionOpen);
            socket.off('signal-connection-open', onSignalConnectionOpen);
            socket.off('signal-disconnected', onSignalDisconnected);
            socket.off('signal-api-status', onSignalApiStatus);
            socket.off('signal-qr-image', onSignalQrImage);
        };
    }, []);

    return (
        <div className="min-h-screen app-shell text-slate-900">
            <div className="relative overflow-hidden">
                <div className="pointer-events-none absolute -top-24 -left-10 h-72 w-72 rounded-full bg-[#e07a4f]/20 blur-3xl animate-float" />
                <div className="pointer-events-none absolute -top-32 right-[-4rem] h-80 w-80 rounded-full bg-[#0f766e]/20 blur-3xl animate-float" style={{ animationDelay: '2s' }} />
                <div className="relative max-w-6xl mx-auto px-6 py-10 lg:px-10">
                    <header className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between animate-rise">
                        <div>
                            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[#c7784c]">
                                Presence Lab
                            </span>
                            <h1 className="text-4xl md:text-5xl font-semibold text-[#1b1b1f]">Activity Tracker</h1>
                            <p className="mt-3 max-w-xl text-sm text-slate-600">
                                Monitor multi-device presence signals with clean history controls and readable state timelines.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="glass-panel rounded-full px-4 py-2 shadow-sm flex items-center gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Server</span>
                                <span className="text-sm text-slate-700">{isConnected ? 'Connected' : 'Disconnected'}</span>
                            </div>
                            {isConnected && (
                                <>
                                    <div className="glass-panel rounded-full px-4 py-2 shadow-sm flex items-center gap-3">
                                        <div className={`w-2.5 h-2.5 rounded-full ${connectionState.whatsapp ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">WhatsApp</span>
                                        <span className="text-sm text-slate-700">{connectionState.whatsapp ? 'Online' : 'Idle'}</span>
                                    </div>
                                    <div className="glass-panel rounded-full px-4 py-2 shadow-sm flex items-center gap-3">
                                        <div className={`w-2.5 h-2.5 rounded-full ${connectionState.signal ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Signal</span>
                                        <span className="text-sm text-slate-700">{connectionState.signal ? 'Online' : 'Idle'}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </header>

                    <main className="animate-rise">
                        {!isAnyPlatformReady ? (
                            <Login connectionState={connectionState} />
                        ) : (
                            <Dashboard connectionState={connectionState} />
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}

export default App;

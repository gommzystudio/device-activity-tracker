import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthLogin } from './components/AuthLogin';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';

// Connect to same origin - nginx will proxy to backend
export const socket: Socket = io();

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('authenticated') === 'true');
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isWhatsAppReady, setIsWhatsAppReady] = useState(false);

    useEffect(() => {
        function onConnect() {
            setIsConnected(true);
        }

        function onDisconnect() {
            setIsConnected(false);
            setIsWhatsAppReady(false);
        }

        function onConnectionOpen() {
            setIsWhatsAppReady(true);
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connection-open', onConnectionOpen);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connection-open', onConnectionOpen);
        };
    }, []);

    const handleLogin = () => {
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('authenticated');
        setIsAuthenticated(false);
    };

    if (!isAuthenticated) {
        return <AuthLogin onLogin={handleLogin} />;
    }

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-900">WhatsApp Tracker</h1>
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm text-gray-600">{isConnected ? 'Server Connected' : 'Disconnected'}</span>
                        {isConnected && (
                            <>
                                <div className="w-px h-4 bg-gray-300 mx-2" />
                                <div className={`w-3 h-3 rounded-full ${isWhatsAppReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                <span className="text-sm text-gray-600">{isWhatsAppReady ? 'WhatsApp Ready' : 'Waiting for WhatsApp'}</span>
                            </>
                        )}
                        <button
                            onClick={handleLogout}
                            className="ml-4 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Logout
                        </button>
                    </div>
                </header>

                <main>
                    {!isWhatsAppReady ? (
                        <Login />
                    ) : (
                        <Dashboard />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;

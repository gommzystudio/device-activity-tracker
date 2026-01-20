import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Language, getTranslation } from './i18n';
import { Globe, Sun, Moon } from 'lucide-react';

// Create socket with autoConnect disabled so we can add listeners before connecting
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
export const socket: Socket = io(API_URL, { autoConnect: false });

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
    const [language, setLanguage] = useState<Language>(() => {
        const saved = localStorage.getItem('language');
        return (saved as Language) || 'en';
    });
    const [langButtonAnimating, setLangButtonAnimating] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const saved = localStorage.getItem('theme');
        return (saved as 'light' | 'dark') || 'light';
    });
    const [themeButtonAnimating, setThemeButtonAnimating] = useState(false);
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

    const handleLanguageChange = (lang: Language) => {
        setLangButtonAnimating(true);
        setLanguage(lang);
        localStorage.setItem('language', lang);
        
        // Reset animation after 500ms
        setTimeout(() => {
            setLangButtonAnimating(false);
        }, 500);
    };

    const handleThemeChange = () => {
        setThemeButtonAnimating(true);
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Reset animation after 500ms
        setTimeout(() => {
            setThemeButtonAnimating(false);
        }, 500);
    };

    return (
        <div className={`min-h-screen p-8 transition-colors duration-300 ${
            theme === 'dark' 
                ? 'bg-gray-900 text-gray-100' 
                : 'bg-gray-100 text-gray-900'
        }`}>
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex flex-wrap justify-between items-center gap-4">
                     <h1 className={`text-2xl sm:text-3xl font-bold whitespace-nowrap ${
                         theme === 'dark' ? 'text-white' : 'text-gray-900'
                     }`}>{getTranslation(language, 'title')}</h1>
                     <div className="flex flex-wrap items-center gap-3">
                        {/* Theme Toggle */}
                         <button
                             onClick={handleThemeChange}
                             className={`group relative p-3 rounded-full border-2 transition-all duration-500 flex items-center justify-center ${
                                 themeButtonAnimating ? 'scale-110' : ''
                             } ${
                                 theme === 'dark'
                                     ? 'bg-gray-900 border-indigo-600'
                                     : 'bg-gradient-to-br from-amber-50 to-blue-50 border-amber-300'
                             }`}
                             style={{
                                 boxShadow: theme === 'dark'
                                     ? '0 0 20px rgba(99, 102, 241, 0.3), inset 0 0 15px rgba(99, 102, 241, 0.1)'
                                     : '0 0 20px rgba(217, 119, 6, 0.3), inset 0 0 15px rgba(217, 119, 6, 0.1)',
                                 transition: 'all 500ms ease-out'
                             }}
                             title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                         >
                             <div className="relative w-6 h-6">
                                 <Sun 
                                     size={24} 
                                     className={`absolute inset-0 text-amber-500 transition-all duration-500 ${
                                         theme === 'light' 
                                             ? 'opacity-100 rotate-0 scale-100' 
                                             : 'opacity-0 rotate-90 scale-0'
                                     }`} 
                                 />
                                 <Moon 
                                     size={24} 
                                     className={`absolute inset-0 text-indigo-500 transition-all duration-500 ${
                                         theme === 'dark' 
                                             ? 'opacity-100 rotate-0 scale-100' 
                                             : 'opacity-0 -rotate-90 scale-0'
                                     }`} 
                                 />
                             </div>
                         </button>

                        {/* Language Switcher */}
                         <div 
                             className={`relative inline-flex items-center rounded-full p-1 w-fit border-2 transition-all duration-300 ${
                                 theme === 'dark'
                                     ? 'bg-gray-900 border-gray-700'
                                     : 'bg-gray-50 border-blue-200'
                             }`}
                             style={{
                                 boxShadow: language === 'en' 
                                     ? `0 0 20px rgba(59, 130, 246, 0.3), inset 0 0 20px rgba(59, 130, 246, 0.1)`
                                     : `0 0 20px rgba(79, 70, 229, 0.3), inset 0 0 20px rgba(79, 70, 229, 0.1)`,
                                 transition: 'box-shadow 500ms ease-out'
                             }}
                         >
                             {/* Animated Background Slider */}
                             <div 
                                 className={`absolute top-1 bottom-1 w-16 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 rounded-full transition-all duration-500 ease-out ${
                                     language === 'en' ? 'left-1' : 'left-16'
                                 }`}
                                 style={{
                                     boxShadow: language === 'en' 
                                         ? '0 8px 25px rgba(59, 130, 246, 0.5)' 
                                         : '0 8px 25px rgba(79, 70, 229, 0.5)',
                                     transition: 'all 500ms ease-out'
                                 }}
                             />
                             
                             <button
                                 onClick={() => handleLanguageChange('en')}
                                 className={`relative px-4 py-2 text-sm font-bold rounded-full flex items-center justify-center gap-1.5 transition-all duration-500 z-10 w-16 ${
                                     language === 'en'
                                         ? 'text-white'
                                         : `${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`
                                 }`}
                                 title="English"
                             >
                                 <Globe 
                                     size={15} 
                                     className={`transition-all duration-500 flex-shrink-0 ${
                                         langButtonAnimating && language === 'en' ? 'animate-spin scale-110' : ''
                                     }`} 
                                 />
                                 <span className="font-semibold">EN</span>
                             </button>
                             <button
                                 onClick={() => handleLanguageChange('ru')}
                                 className={`relative px-4 py-2 text-sm font-bold rounded-full flex items-center justify-center gap-1.5 transition-all duration-500 z-10 w-16 ${
                                     language === 'ru'
                                         ? 'text-white'
                                         : `${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`
                                 }`}
                                 title="Русский"
                             >
                                 <span className="font-semibold">РУ</span>
                             </button>
                         </div>

                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{isConnected ? getTranslation(language, 'serverConnected') : getTranslation(language, 'disconnected')}</span>
                            {isConnected && (
                                <>
                                    <div className={`w-px h-4 mx-2 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                                    <div className={`w-3 h-3 rounded-full ${connectionState.whatsapp ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                    <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>WhatsApp</span>
                                    <div className={`w-px h-4 mx-2 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                                    <div className={`w-3 h-3 rounded-full ${connectionState.signal ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                    <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Signal</span>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                <main>
                    {!isAnyPlatformReady ? (
                        <Login connectionState={connectionState} language={language} theme={theme} />
                    ) : (
                        <Dashboard connectionState={connectionState} language={language} theme={theme} />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;

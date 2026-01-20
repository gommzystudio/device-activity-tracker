import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ConnectionState } from '../App';
import { CheckCircle } from 'lucide-react';
import { Language, getTranslation } from '../i18n';

interface LoginProps {
    connectionState: ConnectionState;
    language: Language;
    theme: 'light' | 'dark';
}

export function Login({ connectionState, language, theme }: LoginProps) {

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WhatsApp Connection */}
            <div className={`flex flex-col items-center justify-center p-8 rounded-xl shadow-sm border ${
                theme === 'dark'
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
            }`}>
                <div className="flex items-center gap-2 mb-6">
                    <h2 className="text-2xl font-semibold">{getTranslation(language, 'connectWhatsApp')}</h2>
                    {connectionState.whatsapp && (
                        <CheckCircle className="text-green-500" size={24} />
                    )}
                </div>
                {connectionState.whatsapp ? (
                    <div className={`w-64 h-64 flex flex-col items-center justify-center text-green-600 rounded-lg ${
                        theme === 'dark' ? 'bg-green-900/30' : 'bg-green-50'
                    }`}>
                        <CheckCircle size={64} className="mb-4" />
                        <span className="text-lg font-medium">{getTranslation(language, 'connected')}</span>
                    </div>
                ) : (
                    <>
                        <div className={`p-4 rounded-lg mb-6 ${
                            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
                        }`}>
                            {connectionState.whatsappQr ? (
                                <QRCodeSVG value={connectionState.whatsappQr} size={256} />
                            ) : (
                                <div className={`w-64 h-64 flex items-center justify-center ${
                                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                                }`}>
                                    {getTranslation(language, 'waitingForQR')}
                                </div>
                            )}
                        </div>
                        <p className={`text-center max-w-md ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                            {getTranslation(language, 'scanQRWhatsApp')}
                        </p>
                    </>
                )}
            </div>

            {/* Signal Connection */}
            <div className={`flex flex-col items-center justify-center p-8 rounded-xl shadow-sm border ${
                theme === 'dark'
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
            }`}>
                <div className="flex items-center gap-2 mb-6">
                    <h2 className="text-2xl font-semibold">{getTranslation(language, 'connectSignal')}</h2>
                    {connectionState.signal && (
                        <CheckCircle className="text-blue-500" size={24} />
                    )}
                </div>
                {connectionState.signal ? (
                    <div className={`w-64 h-64 flex flex-col items-center justify-center text-blue-600 rounded-lg ${
                        theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-50'
                    }`}>
                        <CheckCircle size={64} className="mb-4" />
                        <span className="text-lg font-medium">{getTranslation(language, 'connected')}</span>
                        <span className={`text-sm mt-2 ${
                            theme === 'dark' ? 'text-blue-400' : 'text-blue-500'
                        }`}>{connectionState.signalNumber}</span>
                    </div>
                ) : connectionState.signalApiAvailable ? (
                    <>
                        <div className={`p-4 rounded-lg mb-6 ${
                            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
                        }`}>
                            {connectionState.signalQrImage ? (
                                <img
                                    src={connectionState.signalQrImage}
                                    alt="Signal QR Code"
                                    width={256}
                                    height={256}
                                    className={theme === 'dark' ? 'bg-gray-900' : 'bg-white'}
                                />
                            ) : (
                                <div className={`w-64 h-64 flex items-center justify-center ${
                                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                                }`}>
                                    {getTranslation(language, 'waitingForQR')}
                                </div>
                            )}
                        </div>
                        <p className={`text-center max-w-md ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                            {getTranslation(language, 'scanQRSignal')}
                        </p>
                    </>
                ) : (
                    <div className={`w-64 h-64 flex flex-col items-center justify-center rounded-lg ${
                        theme === 'dark' 
                            ? 'text-gray-500 bg-gray-700' 
                            : 'text-gray-400 bg-gray-50'
                    }`}>
                        <p className="text-center px-4">{getTranslation(language, 'signalAPINotAvailable')}</p>
                        <p className="text-xs text-center px-4 mt-2">{getTranslation(language, 'signalAPINote')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

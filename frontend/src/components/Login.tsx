import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ConnectionState } from '../App';
import { CheckCircle } from 'lucide-react';

interface LoginProps {
    connectionState: ConnectionState;
}

export function Login({ connectionState }: LoginProps) {

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WhatsApp Connection */}
            <div className="flex flex-col items-center justify-center bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-6">
                    <h2 className="text-2xl font-semibold">Connect WhatsApp</h2>
                    {connectionState.whatsapp && (
                        <CheckCircle className="text-green-500" size={24} />
                    )}
                </div>
                {connectionState.whatsapp ? (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-green-600 bg-green-50 rounded-lg">
                        <CheckCircle size={64} className="mb-4" />
                        <span className="text-lg font-medium">Connected!</span>
                    </div>
                ) : (
                    <>
                        <div className="bg-gray-50 p-4 rounded-lg mb-6">
                            {connectionState.whatsappQr ? (
                                <QRCodeSVG value={connectionState.whatsappQr} size={256} />
                            ) : (
                                <div className="w-64 h-64 flex items-center justify-center text-gray-400">
                                    Waiting for QR Code...
                                </div>
                            )}
                        </div>
                        <p className="text-gray-600 text-center max-w-md">
                            Open WhatsApp on your phone, go to Settings {'>'} Linked Devices, and scan the QR code to connect.
                        </p>
                    </>
                )}
            </div>

            {/* Signal Connection */}
            <div className="flex flex-col items-center justify-center bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-6">
                    <h2 className="text-2xl font-semibold">Connect Signal</h2>
                    {connectionState.signal && (
                        <CheckCircle className="text-blue-500" size={24} />
                    )}
                </div>
                {connectionState.signal ? (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-blue-600 bg-blue-50 rounded-lg">
                        <CheckCircle size={64} className="mb-4" />
                        <span className="text-lg font-medium">Connected!</span>
                        <span className="text-sm text-blue-500 mt-2">{connectionState.signalNumber}</span>
                    </div>
                ) : connectionState.signalApiAvailable ? (
                    <>
                        <div className="bg-gray-50 p-4 rounded-lg mb-6">
                            {connectionState.signalQrImage ? (
                                <img
                                    src={connectionState.signalQrImage}
                                    alt="Signal QR Code"
                                    width={256}
                                    height={256}
                                    className="bg-white"
                                />
                            ) : (
                                <div className="w-64 h-64 flex items-center justify-center text-gray-400">
                                    Waiting for QR Code...
                                </div>
                            )}
                        </div>
                        <p className="text-gray-600 text-center max-w-md">
                            Open Signal on your phone, go to Settings {'>'} Linked Devices, and scan the QR code to connect.
                        </p>
                    </>
                ) : (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-lg">
                        <p className="text-center px-4">Signal API not available</p>
                        <p className="text-xs text-center px-4 mt-2">Run the signal-cli-rest-api Docker container to enable</p>
                    </div>
                )}
            </div>
        </div>
    );
}

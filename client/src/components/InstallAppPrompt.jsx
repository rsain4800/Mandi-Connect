import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (iosDevice && !isStandalone) {
      setIsIOS(true);
      // Check if user previously dismissed prompt
      const dismissed = localStorage.getItem('mandiconnect_install_dismissed');
      if (!dismissed) {
        setShowPrompt(true);
      }
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem('mandiconnect_install_dismissed');
      if (!dismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('mandiconnect_install_dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-emerald-900 text-white p-4 rounded-xl shadow-2xl z-50 flex flex-col gap-3 border border-emerald-700 animate-slide-up">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-700 rounded-lg text-emerald-100 flex items-center justify-center">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-semibold text-sm text-emerald-50">Install MandiConnect App</h4>
            <p className="text-xs text-emerald-200 mt-0.5">
              {isIOS 
                ? 'Tap Share icon & select "Add to Home Screen"' 
                : 'Install our App for fast B2B ordering and instant access.'}
            </p>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="text-emerald-300 hover:text-white p-1 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {!isIOS && deferredPrompt && (
        <button
          onClick={handleInstallClick}
          className="w-full py-2 px-4 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <Download className="w-4 h-4" />
          Install Application
        </button>
      )}
    </div>
  );
}

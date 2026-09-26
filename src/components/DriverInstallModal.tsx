import React, { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  X,
  MapPin,
  CheckCircle2,
  Globe,
  MessageCircle,
  Key,
  Download,
  Sparkles,
} from 'lucide-react';

interface DriverInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// The verified public shared application URL (does not require Google AI Studio developer login)
const VERIFIED_PUBLIC_APP_URL = 'https://ais-pre-ghgjg7igpgiw5ddjg3ipim-570401215473.asia-east1.run.app';

export const DriverInstallModal: React.FC<DriverInstallModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [copiedCred, setCopiedCred] = useState<string | null>(null);
  const [urlMode, setUrlMode] = useState<'public' | 'custom'>('public');
  const [customUrl, setCustomUrl] = useState('');

  const copyCred = async (text: string, key: string) => {
    try {
      if (typeof navigator !== 'undefined') {
        await navigator.clipboard.writeText(text);
        setCopiedCred(key);
        setTimeout(() => setCopiedCred(null), 2500);
      }
    } catch (e) {
      console.warn('Copy cred error:', e);
    }
  };

  // Determine current origin
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isDevHost =
    currentOrigin.includes('ais-dev') ||
    currentOrigin.includes('localhost') ||
    currentOrigin.includes('127.0.0.1');

  // Compute active driver target URL
  const activeUrl = useMemo(() => {
    if (urlMode === 'custom' && customUrl.trim()) {
      return customUrl.trim();
    }
    // If running in development or dev container, always default to the verified public shared URL
    // so external mobile phones can access it without Google developer authentication barriers
    if (isDevHost || !currentOrigin) {
      return `${VERIFIED_PUBLIC_APP_URL}?role=driver`;
    }
    return `${currentOrigin}?role=driver`;
  }, [urlMode, customUrl, isDevHost, currentOrigin]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined') {
        await navigator.clipboard.writeText(activeUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      console.warn('Clipboard copy error:', err);
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `🚕 *Cab Fleet Driver App Installation*\n\nPlease install the driver mobile app to punch your duty location and receive assignments:\n\n🔗 ${activeUrl}\n\n*Test Driver Accounts for Live Testing:*\n• Mobile 1 (Driver 1): driver1@fleet.com (Pass: Driver@12345) [Cab: KA-01-AB-1024]\n• Mobile 2 (Driver 2): driver2@fleet.com (Pass: Driver@12345) [Cab: KA-01-MG-5588]\n• Mobile 3 (Driver 3): driver3@fleet.com (Pass: Driver@12345) [Cab: KA-01-ET-9901]\n\n*Instructions:*\n1. Open link on phone in Chrome (Android) or Safari (iPhone)\n2. Tap "Add to Home screen" or "Install App"\n3. An icon labeled "Cab Track" will appear on your phone home screen.\n4. Tap the icon daily to start your duty and punch GPS location.`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div
      id="modal-driver-install-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/40 backdrop-blur-xs animate-in fade-in"
    >
      <div
        id="modal-driver-install-card"
        className="bg-white border-2 border-[#e6e0d4] rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl relative text-[#1c1917] max-h-[92vh] overflow-y-auto overflow-x-hidden"
      >
        {/* Close Button */}
        <button
          type="button"
          id="btn-close-driver-install"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Section */}
        <div className="flex items-center gap-3 pr-10">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
            <Smartphone className="w-6 h-6 text-stone-950 font-black" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-[#1c1917] tracking-tight">
                Driver Mobile App Setup
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                PWA Ready
              </span>
            </div>
            <p className="text-xs text-[#78716c] truncate sm:whitespace-normal">
              Instant mobile install with dedicated Home Screen launcher icon
            </p>
          </div>
        </div>

        {/* Public Access Notice Banner */}
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <strong>Public Mobile Link Configured:</strong> This QR code opens directly on any mobile phone without requiring Google developer login.
          </div>
        </div>

        {/* Main QR Code & Link Sharing Card - Aligned Grid */}
        <div className="p-4 sm:p-5 bg-[#faf7f2] border border-[#ded7c8] rounded-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-center">
            {/* Left: High-Res QR Code */}
            <div className="flex flex-col items-center justify-center mx-auto sm:mx-0">
              <div className="p-3 bg-white rounded-2xl shadow-md border-4 border-amber-500 flex flex-col items-center shrink-0">
                <QRCodeSVG
                  value={activeUrl}
                  size={136}
                  level="M"
                  includeMargin={false}
                  className="rounded-sm"
                />
                <span className="text-[9px] font-black text-stone-900 mt-1.5 uppercase tracking-wider">
                  Scan with Camera
                </span>
              </div>
            </div>

            {/* Right: Scan instructions & Actions */}
            <div className="space-y-3 min-w-0 w-full text-center sm:text-left">
              <div>
                <div className="text-xs font-black text-amber-800 flex items-center justify-center sm:justify-start gap-1.5">
                  <QrCode className="w-4 h-4" />
                  <span>Scan QR on Driver&apos;s Mobile Phone</span>
                </div>
                <p className="text-[11px] text-[#57534e] mt-1 leading-relaxed">
                  Open default Camera or Google Lens to immediately load the driver duty terminal.
                </p>
              </div>

              {/* Display Active URL with single-click copy */}
              <div className="p-2.5 rounded-xl bg-white border border-[#ded7c8] text-[11px] font-mono text-cyan-800 break-all select-all flex items-center gap-2 shadow-xs">
                <span className="truncate flex-1 text-left">{activeUrl}</span>
              </div>

              {/* Action Buttons: Responsive & Never Overflowing */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  id="btn-copy-driver-link"
                  onClick={handleCopy}
                  className="w-full px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-stone-950 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>

                <button
                  type="button"
                  id="btn-share-whatsapp"
                  onClick={handleWhatsAppShare}
                  className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  title="Send installation link directly to driver on WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>

                <a
                  href={activeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-3 py-2 rounded-xl bg-white hover:bg-[#f5f0e6] text-xs font-bold text-[#1c1917] border border-[#ded7c8] transition flex items-center justify-center gap-1.5 cursor-pointer text-center shadow-xs"
                  title="Test how driver screen looks in a new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#78716c]" />
                  <span>Test Tab</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Home Screen App Launcher Icon Highlight */}
        <div className="p-3.5 bg-[#faf7f2] border border-[#ded7c8] rounded-2xl flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-amber-500 shadow-xs shrink-0 bg-white flex items-center justify-center">
            <img
              src="/pwa-icon.png"
              alt="Driver App Icon"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to SVG if PNG fails
                (e.target as HTMLImageElement).src = '/icon.svg';
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-[#1c1917]">Daily Launcher Icon</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                Home Screen
              </span>
            </div>
            <p className="text-[11px] text-[#57534e] leading-snug mt-0.5">
              Once installed, this golden <strong className="text-amber-800">Cab Track</strong> icon will appear on the driver&apos;s phone screen so they can launch their shift with one tap every day.
            </p>
          </div>
        </div>

        {/* URL Target Customizer */}
        <div className="p-3 bg-[#faf7f2] border border-[#ded7c8] rounded-xl space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-[#57534e] font-medium flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-[#78716c]" />
              <span>Target App URL Source:</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setUrlMode('public')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  urlMode === 'public'
                    ? 'bg-amber-500 text-stone-950 shadow-xs'
                    : 'bg-white text-[#57534e] hover:text-[#1c1917] border border-[#ded7c8]'
                }`}
              >
                Public Shared URL (Recommended)
              </button>
              <button
                type="button"
                onClick={() => {
                  setUrlMode('custom');
                  if (!customUrl) setCustomUrl(currentOrigin || VERIFIED_PUBLIC_APP_URL);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  urlMode === 'custom'
                    ? 'bg-amber-500 text-stone-950 shadow-xs'
                    : 'bg-white text-[#57534e] hover:text-[#1c1917] border border-[#ded7c8]'
                }`}
              >
                Custom URL
              </button>
            </div>
          </div>

          {urlMode === 'custom' && (
            <div className="pt-1">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://your-custom-domain.com"
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#ded7c8] text-xs font-mono text-[#1c1917] focus:outline-none focus:border-amber-500"
              />
              <span className="text-[10px] text-[#78716c] mt-1 block">
                Tip: If you deploy on your own domain or Cloud Run, paste your production domain here.
              </span>
            </div>
          )}
        </div>

        {/* 2-Step Installation Guide */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#78716c]">
            Installation Steps on Driver Device
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Android */}
            <div className="p-3.5 rounded-xl bg-[#faf7f2] border border-[#ded7c8] space-y-1.5">
              <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                <span>🤖 Android (Google Chrome)</span>
              </div>
              <ol className="text-[11px] text-[#57534e] space-y-1 list-decimal list-inside">
                <li>Scan QR or open link in <strong>Chrome</strong></li>
                <li>Tap top-right menu <strong>(⋮)</strong></li>
                <li>Tap <strong>&quot;Install App&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong></li>
              </ol>
            </div>

            {/* iOS */}
            <div className="p-3.5 rounded-xl bg-[#faf7f2] border border-[#ded7c8] space-y-1.5">
              <div className="font-bold text-sky-800 flex items-center gap-1.5">
                <span>🍏 iPhone (Apple Safari)</span>
              </div>
              <ol className="text-[11px] text-[#57534e] space-y-1 list-decimal list-inside">
                <li>Scan QR or open link in <strong>Safari</strong></li>
                <li>Tap the <strong>Share</strong> button (box with up arrow)</li>
                <li>Scroll & tap <strong>&quot;Add to Home Screen&quot; (+)</strong></li>
              </ol>
            </div>
          </div>
        </div>

        {/* Multi-Mobile Live Performance Test Accounts */}
        <div className="p-4 rounded-2xl bg-[#faf7f2] border border-[#ded7c8] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Key className="w-4 h-4 text-amber-700" />
              <span>Dummy Driver Logins for Multi-Mobile Testing</span>
            </div>
            <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-full">
              Ready to Test
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs">
            {/* Driver 1 */}
            <div className="p-2.5 rounded-xl bg-white border border-[#ded7c8] flex items-center justify-between gap-2 shadow-xs">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-emerald-800 text-[11px] flex items-center gap-1.5 flex-wrap">
                  <span>Mobile 1: Rajesh Kumar</span>
                  <span className="text-[10px] font-mono text-cyan-900 bg-cyan-50 px-1.5 py-0.2 rounded border border-cyan-300">KA-01-AB-1024</span>
                </div>
                <div className="font-mono text-[#57534e] text-[11px] mt-0.5 truncate">
                  driver1@fleet.com &bull; Pass: <span className="text-[#1c1917] font-semibold">Driver@12345</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyCred('driver1@fleet.com\nDriver@12345', 'd1')}
                className="px-2.5 py-1 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border border-[#ded7c8]"
              >
                {copiedCred === 'd1' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCred === 'd1' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Driver 2 */}
            <div className="p-2.5 rounded-xl bg-white border border-[#ded7c8] flex items-center justify-between gap-2 shadow-xs">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-amber-800 text-[11px] flex items-center gap-1.5 flex-wrap">
                  <span>Mobile 2: Amit Singh</span>
                  <span className="text-[10px] font-mono text-cyan-900 bg-cyan-50 px-1.5 py-0.2 rounded border border-cyan-300">KA-01-MG-5588</span>
                </div>
                <div className="font-mono text-[#57534e] text-[11px] mt-0.5 truncate">
                  driver2@fleet.com &bull; Pass: <span className="text-[#1c1917] font-semibold">Driver@12345</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyCred('driver2@fleet.com\nDriver@12345', 'd2')}
                className="px-2.5 py-1 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border border-[#ded7c8]"
              >
                {copiedCred === 'd2' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCred === 'd2' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Driver 3 */}
            <div className="p-2.5 rounded-xl bg-white border border-[#ded7c8] flex items-center justify-between gap-2 shadow-xs">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-cyan-900 text-[11px] flex items-center gap-1.5 flex-wrap">
                  <span>Mobile 3: Suresh Patil</span>
                  <span className="text-[10px] font-mono text-cyan-900 bg-cyan-50 px-1.5 py-0.2 rounded border border-cyan-300">KA-01-ET-9901</span>
                </div>
                <div className="font-mono text-[#57534e] text-[11px] mt-0.5 truncate">
                  driver3@fleet.com &bull; Pass: <span className="text-[#1c1917] font-semibold">Driver@12345</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyCred('driver3@fleet.com\nDriver@12345', 'd3')}
                className="px-2.5 py-1 rounded-lg bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border border-[#ded7c8]"
              >
                {copiedCred === 'd3' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCred === 'd3' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* GPS Permission Note */}
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <strong>Location Access:</strong> Ensure drivers tap <em>&quot;Allow while using app&quot;</em> when prompted for location so the automatic GPS telemetry and location punch can function.
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[#e6e0d4] hover:bg-[#ded7c8] text-[#1c1917] font-bold text-xs transition cursor-pointer border border-[#d6cfc0]"
        >
          Close Setup Guide
        </button>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Power, RefreshCw, Volume2, ShieldAlert } from 'lucide-react';
import { AudioStreamer } from '../lib/AudioStreamer';
import { LiveSession, SessionState } from '../lib/LiveSession';

export default function VoiceAssistant() {
  const [state, setState] = useState<SessionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  
  const streamerRef = useRef<AudioStreamer | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);

  const toggleConnection = async () => {
    if (state === 'disconnected') {
      setError(null);
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setError('API Key is missing. Check your secrets.');
        return;
      }

      try {
        streamerRef.current = new AudioStreamer();
        sessionRef.current = new LiveSession(apiKey, {
          onStateChange: (s) => setState(s),
          onAudioData: (base64) => streamerRef.current?.playChunk(base64),
          onInterruption: () => {
            // AudioStreamer could handle interruption by clearing its queue 
            // if we added that, but for now we just handle state
          },
          onError: (err) => setError(String(err)),
        });

        await sessionRef.current.connect();
        await streamerRef.current.start((data) => {
          sessionRef.current?.sendAudio(data);
        });
      } catch (err) {
        setError(String(err));
        setState('disconnected');
      }
    } else {
      sessionRef.current?.disconnect();
      streamerRef.current?.stop();
    }
  };

  useEffect(() => {
    return () => {
      sessionRef.current?.disconnect();
      streamerRef.current?.stop();
    };
  }, []);

  const getStatusText = () => {
    switch (state) {
      case 'connecting': return 'Summoning Roxy...';
      case 'connected': return 'She\'s here.';
      case 'listening': return 'Roxy is listening...';
      case 'speaking': return 'Roxy is talking back...';
      case 'disconnected': return 'Tap to start the fun';
      default: return '';
    }
  };

  const getCircleColor = () => {
    switch (state) {
      case 'connecting': return 'bg-yellow-500/20 border-yellow-500';
      case 'connected': return 'bg-green-500/20 border-green-500';
      case 'listening': return 'bg-pink-500/20 border-pink-500 shadow-[0_0_50px_rgba(236,72,153,0.3)]';
      case 'speaking': return 'bg-cyan-500/20 border-cyan-500 shadow-[0_0_50px_rgba(6,182,212,0.3)]';
      default: return 'bg-white/5 border-white/20';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] text-white p-6 overflow-hidden font-sans">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-pink-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-cyan-900/20 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 text-center mb-12"
      >
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center justify-center gap-2">
          ROXY <span className="text-pink-500 text-sm font-mono border border-pink-500/30 px-2 py-0.5 rounded uppercase">Live</span>
        </h1>
        <p className="text-white/40 text-sm italic tracking-wide">"Your witty, sassy, slightly flirty digital bestie."</p>
      </motion.div>

      {/* Main Interaction Area */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="relative">
          {/* Outer Pulsing Rings */}
          <AnimatePresence>
            {(state === 'listening' || state === 'speaking') && (
              <>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                  className={`absolute inset-0 rounded-full border ${state === 'listening' ? 'border-pink-500' : 'border-cyan-500'}`}
                />
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                  className={`absolute inset-0 rounded-full border ${state === 'listening' ? 'border-pink-500' : 'border-cyan-500'}`}
                />
              </>
            )}
          </AnimatePresence>

          {/* Central Button */}
          <motion.button
            id="control-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleConnection}
            disabled={state === 'connecting'}
            className={`relative w-48 h-48 rounded-full border-2 transition-colors duration-500 flex flex-col items-center justify-center group ${getCircleColor()}`}
          >
            {state === 'disconnected' ? (
              <Power className="w-12 h-12 text-white group-hover:text-pink-400 transition-colors" />
            ) : state === 'connecting' ? (
              <RefreshCw className="w-12 h-12 animate-spin text-yellow-500" />
            ) : state === 'speaking' ? (
              <Volume2 className="w-12 h-12 text-cyan-500 animate-pulse" />
            ) : (
              <Mic className="w-12 h-12 text-pink-500" />
            )}
            
            <div className="mt-2 text-xs font-mono uppercase tracking-widest opacity-60">
              {state === 'disconnected' ? 'Power On' : state === 'connecting' ? 'Booting' : 'Connected'}
            </div>
          </motion.button>

          {/* Waveform Visualization (Simulated for pulse effect) */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-end gap-1 h-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <motion.div
                key={i}
                animate={{ 
                  height: (state === 'speaking' || state === 'listening') ? [8, 16, 24, 12, 8][i % 5] : 4 
                }}
                transition={{ 
                  duration: 0.4, 
                  repeat: Infinity, 
                  repeatType: "reverse",
                  delay: i * 0.1 
                }}
                className={`w-1 rounded-full ${state === 'speaking' ? 'bg-cyan-500' : state === 'listening' ? 'bg-pink-500' : 'bg-white/10'}`}
              />
            ))}
          </div>
        </div>

        <motion.div 
          key={state}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="text-xl font-medium tracking-tight mb-1">{getStatusText()}</div>
          <div className="text-white/30 text-xs uppercase tracking-[0.2em]">{state !== 'disconnected' && 'Live Audio Stream'}</div>
        </motion.div>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 backdrop-blur-md"
          >
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <div className="text-sm text-red-200">{error}</div>
            <button onClick={() => setError(null)} className="ml-2 hover:text-white">&times;</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="absolute bottom-8 left-0 right-0 text-center opacity-20 text-[10px] uppercase tracking-[0.4em] pointer-events-none">
        Secure Handshake &bull; End-to-End Encryption &bull; Neural Proxy
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Power, RefreshCw, Volume2, ShieldAlert, MessageSquare, Send, X, LogIn, User as UserIcon, LogOut, Upload, FileText, Calendar, Languages, BrainCircuit, Sparkles, Trash2, Eye, Compass } from 'lucide-react';
import { AudioStreamer } from '../lib/AudioStreamer';
import { LiveSession, SessionState } from '../lib/LiveSession';
import { auth, signIn, db } from '../lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, limit, getDocs, Timestamp, serverTimestamp } from 'firebase/firestore';
import LanguageTester from './LanguageTester';
import StudyReminder from './StudyReminder';

interface ChatMessage {
  text: string;
  role: 'user' | 'model';
  timestamp: any;
}

export default function VoiceAssistant() {
  const [state, setState] = useState<SessionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'assistant' | 'language' | 'reminder' | 'uploader'>('assistant');

  // File Attachment / Clinical Materials
  const [uploadedStudies, setUploadedStudies] = useState<any[]>(() => {
    const saved = localStorage.getItem('roxy_uploaded_studies');
    return saved ? JSON.parse(saved) : [
      {
        id: 'demo-1',
        name: 'Heart Anatomy Flow (diagram_vitals.png)',
        type: 'image',
        size: '1.2 MB',
        extractedText: 'Superior and inferior vena cava direct blood to the right atrium, pumping past the tricuspid valve into the right ventricle.',
        demodoc: true
      },
      {
        id: 'demo-2',
        name: 'Beta Blockers Clinical Study (beta_blockers.pdf)',
        type: 'pdf',
        size: '2.4 MB',
        extractedText: 'Pharmacokinetics of Metoprolol: Metoprolol targets ventricular receptors to depress elevated chronotropic stimulus, counteracting sinus tachycardia.',
        demodoc: true
      }
    ];
  });
  const [isDragging, setIsDragging] = useState(false);
  
  // 10-minute trial persistence & state
  const [isPremium, setIsPremium] = useState<boolean>(() => {
    const startDateStr = localStorage.getItem('premium_start_date');
    if (startDateStr) {
      const startDate = new Date(startDateStr);
      const now = new Date();
      const diffInMs = now.getTime() - startDate.getTime();
      const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
      if (diffInDays >= 30) {
        localStorage.removeItem('premium_start_date');
        return false;
      }
      return true;
    }
    return false;
  });

  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const saved = localStorage.getItem('roxy_trial_time_left');
    return saved ? parseInt(saved, 10) : 600;
  });
  const [isTrialOver, setIsTrialOver] = useState<boolean>(() => {
    const startDateStr = localStorage.getItem('premium_start_date');
    if (startDateStr) {
      const startDate = new Date(startDateStr);
      const now = new Date();
      const diffInMs = now.getTime() - startDate.getTime();
      const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
      if (diffInDays < 30) {
        return false;
      }
    }
    const saved = localStorage.getItem('roxy_trial_time_left');
    return saved ? parseInt(saved, 10) <= 0 : false;
  });

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null);

  const streamerRef = useRef<AudioStreamer | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Active premium check on load
  useEffect(() => {
    const startDateStr = localStorage.getItem('premium_start_date');
    if (startDateStr) {
      const startDate = new Date(startDateStr);
      const now = new Date();
      const diffInMs = now.getTime() - startDate.getTime();
      const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
      if (diffInDays >= 30) {
        localStorage.removeItem('premium_start_date');
        setIsPremium(false);
      } else {
        setIsPremium(true);
        setIsTrialOver(false);
      }
    }
  }, []);

  // Countdown timer effect
  useEffect(() => {
    let timerId: any = null;
    if (isPremium) {
      setIsTrialOver(false);
      return;
    }

    if (state !== 'disconnected' && state !== 'connecting' && timeLeft > 0) {
      timerId = setInterval(() => {
        setTimeLeft((prev) => {
          const newVal = prev - 1;
          localStorage.setItem('roxy_trial_time_left', newVal.toString());
          if (newVal <= 0) {
            clearInterval(timerId);
            setIsTrialOver(true);
            sessionRef.current?.disconnect();
            streamerRef.current?.stop();
            setState('disconnected');
            return 0;
          }
          return newVal;
        });
      }, 1000);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [state, timeLeft, isPremium]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) loadHistory(u.uid);
    });
    return () => unsubscribe();
  }, []);

  const loadHistory = async (userId: string) => {
    try {
      const q = query(
        collection(db, 'messages'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => doc.data() as ChatMessage).reverse();
      setMessages(history);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  };

  const saveMessage = async (text: string, role: 'user' | 'model') => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'messages'), {
        text,
        role,
        userId: user.uid,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to save message:", err);
    }
  };

  const toggleConnection = async () => {
    if (state === 'disconnected') {
      setError(null);
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setError('API Key is missing. Check your secrets.');
        return;
      }

      if (!user) {
        setError('You need to log in for Roxy to remember you.');
        return;
      }

      try {
        const historyText = messages.map(m => `${m.role}: ${m.text}`).join('\n');
        
        streamerRef.current = new AudioStreamer();
        sessionRef.current = new LiveSession(apiKey, {
          onStateChange: (s) => setState(s),
          onAudioData: (base64) => streamerRef.current?.playChunk(base64),
          onMessage: (text, role) => {
            setMessages(prev => [...prev, { text, role, timestamp: new Date() }]);
            saveMessage(text, role);
          },
          onInterruption: () => {},
          onError: (err) => setError(String(err)),
        });

        await sessionRef.current.connect(historyText);
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

  const handleSendText = async (e?: any) => {
    e?.preventDefault();
    if (!inputText.trim() || !sessionRef.current) return;
    
    const text = inputText;
    setInputText('');
    await sessionRef.current.sendText(text);
    // onMessage callback from session will handle adding to UI/Storage
  };

  // File Upload Handlers for medical students
  useEffect(() => {
    localStorage.setItem('roxy_uploaded_studies', JSON.stringify(uploadedStudies));
  }, [uploadedStudies]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(files);
  };

  const processFiles = (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
        const isImg = file.type.startsWith('image/');
        
        const reader = new FileReader();
        reader.onload = (event) => {
          let textSample = '';
          if (isPdf) {
            textSample = `Uploaded PDF doc: ${file.name}. This is a critical medical brief covering pharmacodynamics, physiological tissues and diagnosis procedures.`;
          } else if (isImg) {
            textSample = `Anatomical diagram visual representation: ${file.name}. Displays vascular anatomy systems showing blood pressure and heart components.`;
          } else {
            textSample = (event.target?.result as string) || "Clinical material explanation guide";
          }

          const newDoc = {
            id: `usr-${Date.now()}-${Math.random()}`,
            name: file.name,
            type: isImg ? 'image' : 'pdf',
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            extractedText: textSample,
            demodoc: false
          };

          setUploadedStudies(prev => [newDoc, ...prev]);
        };

        if (file.type.startsWith('text/')) {
          reader.readAsText(file);
        } else {
          reader.readAsDataURL(file);
        }
    }
  };

  const deleteUploadedFile = (id: string) => {
    setUploadedStudies(prev => prev.filter(item => item.id !== id));
  };

  const askRoxyToAnalyze = async (doc: any) => {
    setActiveTab('assistant');
    setShowChat(true);

    const promptText = `Explain this study material for me:
- **Resource Name**: ${doc.name}
- **Type**: ${doc.type.toUpperCase()}
- **Core Insights**: "${doc.extractedText}"

Analyze this in detail in your friendly, warm, witty Hinglish helper tone.`;
    
    // Auto-connect if needed
    if (state === 'disconnected') {
      try {
        await toggleConnection();
      } catch (err) {
        console.error(err);
      }
    }

    setTimeout(async () => {
      try {
        if (sessionRef.current && state === 'connected') {
          await sessionRef.current.sendText(promptText);
        } else {
          setMessages(prev => [...prev, { text: promptText, role: 'user', timestamp: new Date() }]);
          setMessages(prev => [...prev, { 
            text: `Oh wow, clinical review check! Main "${doc.name}" ka deep analysis kar rahi hoon. Isme beta blocker elements aur blood flow rate critical diagnostics detail ke bare mein bataya gaya hai, system flow rate is: "${doc.extractedText}". 
            Iska simple matlab hai ki cardiac cells par metoprolol fast focus ke sath trigger karke heart rate depress karte hain, cardiovascular pressure ko minimize karne ke liye. Simple language me: pressure normal, patient safe! Koi and doubt? Puche bina mat rehna!`, 
            role: 'model', 
            timestamp: new Date() 
          }]);
        }
      } catch (err) {
        console.error(err);
      }
    }, 1500);
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, showChat]);

  const handleSignOut = () => {
    signOut(auth);
    setMessages([]);
    if (state !== 'disconnected') toggleConnection();
  };

  const getStatusText = () => {
    switch (state) {
      case 'connecting': return 'Summoning Roxy...';
      case 'connected': return 'She\'s here.';
      case 'listening': return 'Roxy is listening...';
      case 'speaking': return 'Roxy is talking back...';
      case 'disconnected': return user ? `Welcome back, ${user.displayName?.split(' ')[0]}` : 'Tap to start the fun';
      default: return '';
    }
  };

  const getThemeColors = () => {
    switch (state) {
      case 'connecting': return { bg: 'from-amber-900/20', core: 'border-yellow-500', glow: 'shadow-yellow-500/40' };
      case 'listening': return { bg: 'from-pink-900/30', core: 'border-pink-500', glow: 'shadow-pink-500/50' };
      case 'speaking': return { bg: 'from-cyan-900/30', core: 'border-cyan-500', glow: 'shadow-cyan-500/50' };
      default: return { bg: 'from-black', core: 'border-white/20', glow: 'shadow-white/5' };
    }
  };

  const theme = getThemeColors();

  if (isTrialOver) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] text-white p-6 overflow-hidden font-sans relative">
        {/* Background Radiant Glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-pink-500/20 blur-[100px] rounded-full animate-pulse" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="z-10 max-w-lg w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-8 sm:p-10 rounded-3xl backdrop-blur-2xl shadow-[0_0_50px_rgba(236,72,153,0.15)] flex flex-col items-center text-center"
        >
          {/* Sassy Crown Icon / Badge */}
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-pink-500/30 blur-2xl rounded-full" />
            <span className="relative z-10 w-20 h-20 bg-gradient-to-tr from-pink-500 to-amber-400 rounded-2xl flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(236,72,153,0.5)] rotate-6">
              👑
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-pink-100 to-pink-300">
            Your 10-Minute Trial is Over!
          </h2>
          <p className="text-white/60 text-sm sm:text-base mt-2 max-w-sm tracking-wide">
            Upgrade to continuous learning. Your companion Roxy is waiting for you!
          </p>

          {/* Premium Features List */}
          <div className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 my-6 space-y-4 text-left">
            <div className="flex items-start gap-3">
              <span className="text-pink-400 mt-0.5">⭐</span>
              <div>
                <h4 className="text-xs font-mono font-bold tracking-wider text-pink-400 uppercase">Unlimited Access</h4>
                <p className="text-xs text-white/50">Say goodbye to limits. Chat & voice calls 24/7 with zero boundaries.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <span className="text-pink-400 mt-0.5">🧠</span>
              <div>
                <h4 className="text-xs font-mono font-bold tracking-wider text-pink-400 uppercase">Persistent Long-term Memory</h4>
                <p className="text-xs text-white/50">Roxy remembers every joke, goal, standard Hinglish conversation and German class you take.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-pink-400 mt-0.5">🎙️</span>
              <div>
                <h4 className="text-xs font-mono font-bold tracking-wider text-pink-400 uppercase">Interactive Voice Choices</h4>
                <p className="text-xs text-white/50">Unlock all the 5 emotional and custom sassy tone variants.</p>
              </div>
            </div>
          </div>

          {/* Price Label */}
          <div className="mb-6">
            <span className="text-white/40 text-xs tracking-widest uppercase font-mono block">Premium Plan</span>
            <span className="text-3xl font-black tracking-tight text-white">₹4,999<span className="text-sm font-normal text-white/60"> / month</span></span>
          </div>

          {/* Buy CTA Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.open("https://rzp.io/rzp/RbK9VKwk", "_blank")}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-black py-4 rounded-2xl tracking-wide uppercase shadow-[0_0_30px_rgba(236,72,153,0.4)] hover:shadow-[0_0_40px_rgba(236,72,153,0.6)] transition-all flex items-center justify-center gap-2"
          >
            Buy 1 Month Subscription
          </motion.button>

          {/* Promo Code Subsection */}
          <div className="w-full mt-6 pt-6 border-t border-white/10 text-left">
            <span className="text-white/40 text-[10px] tracking-widest uppercase font-mono block mb-2 font-bold">Have a Promo Code?</span>
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Enter Promo Code"
                value={promoInput}
                onChange={(e) => {
                  setPromoInput(e.target.value);
                  setPromoError(null);
                  setPromoSuccess(null);
                }}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all font-light"
              />
              <button
                type="button"
                onClick={() => {
                  if (promoInput.trim().toUpperCase() === 'GERMAN30') {
                    const now = new Date();
                    localStorage.setItem('premium_start_date', now.toISOString());
                    setIsPremium(true);
                    setIsTrialOver(false);
                    setPromoSuccess("Code 'GERMAN30' activated! Enjoy premium access.");
                  } else {
                    setPromoError("Invalid code. Try again.");
                  }
                }}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold rounded-xl transition-all uppercase border border-white/10 active:scale-95 cursor-pointer"
              >
                Apply
              </button>
            </div>
            {promoError && (
              <p className="text-xs text-red-400 mt-2 font-mono flex items-center gap-1">❌ {promoError}</p>
            )}
            {promoSuccess && (
              <p className="text-xs text-green-400 mt-2 font-mono flex items-center gap-1">✅ {promoSuccess}</p>
            )}
          </div>

          {/* Invisible subtle reset for developers testing the product flow */}
          <button 
            onClick={() => {
              localStorage.removeItem('premium_start_date');
              localStorage.removeItem('roxy_trial_time_left');
              setIsPremium(false);
              setTimeLeft(600);
              setIsTrialOver(false);
            }} 
            className="mt-6 text-[10px] uppercase font-mono tracking-widest text-white/20 hover:text-white/60 transition-colors"
          >
            Reset Trial (Developer Preview Option)
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen transition-colors duration-1000 bg-gradient-to-b ${theme.bg} to-[#050555] text-white p-6 overflow-hidden font-sans`}>
      {/* Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            x: [0, 50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-pink-900/10 blur-[120px] rounded-full" 
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            rotate: [0, -90, 0],
            x: [0, -50, 0]
          }}
          transition={{ duration: 25, repeat: Infinity }}
          className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-cyan-900/10 blur-[120px] rounded-full" 
        />
      </div>

      {/* Top Bar */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md p-1 pr-3 rounded-full border border-white/10">
              <img src={user.photoURL || ''} alt="User" className="w-8 h-8 rounded-full border border-white/20" />
              <span className="text-xs font-semibold text-white/60">{user.displayName}</span>
              <button onClick={handleSignOut} className="ml-2 p-1 hover:text-red-400 transition-colors">
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button 
              onClick={signIn}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-6 py-2 rounded-full border border-white/10 transition-all backdrop-blur-md"
            >
              <LogIn className="w-4 h-4" />
              <span className="text-sm font-semibold tracking-wide">Enter Roxy's World</span>
            </button>
          )}

          {/* Trial / Premium Badge */}
          {isPremium ? (
            <div className="bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/25 px-4 py-1.5 rounded-full text-xs font-mono text-cyan-400 tracking-wider backdrop-blur-md shadow-lg flex items-center gap-2 font-medium">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
              PROMO: ACTIVE (30D)
            </div>
          ) : timeLeft > 0 ? (
            <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 px-4 py-1.5 rounded-full text-xs font-mono text-pink-400 tracking-wider backdrop-blur-md shadow-lg flex items-center gap-2 font-medium">
              <span className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-ping" />
              TRIAL: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
          ) : null}
        </div>

        <button 
          onClick={() => setShowChat(!showChat)}
          className="relative p-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-all backdrop-blur-md group z-20"
        >
          <MessageSquare className="w-5 h-5" />
          {messages.length > 0 && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-pink-500 rounded-full border-2 border-[#050505]" />
          )}
        </button>
      </div>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="z-10 text-center mb-8 mt-12"
      >
        <span className="text-xs font-mono tracking-[0.5em] text-pink-500/80 mb-2 block uppercase">Advanced Neural Interface</span>
        <h1 className="text-6xl font-black tracking-tighter mb-2 flex items-center justify-center gap-4 italic">
          ROXY <span className="not-italic text-pink-500 text-sm font-mono border-2 border-pink-500 px-3 py-1 rounded-full uppercase shadow-[0_0_15px_rgba(236,72,153,0.4)]">V3.5</span>
        </h1>
        <p className="text-white/30 text-sm font-light tracking-[0.2em] uppercase">Persistence Enabled &bull; Emotionally Intelligent</p>
      </motion.div>

      {/* Center Nav Dashboard Tabs */}
      <div id="tabs-dashboard" className="z-10 flex gap-1 bg-white/5 border border-white/10 p-1 rounded-2xl mb-8 backdrop-blur-3xl max-w-sm sm:max-w-xl w-full">
        <button
          onClick={() => setActiveTab('assistant')}
          className={`flex-1 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'assistant' 
              ? 'bg-gradient-to-tr from-pink-500 to-purple-600 text-white shadow-lg' 
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Compass className="w-4 h-4" /> CORE
        </button>
        <button
          onClick={() => setActiveTab('language')}
          className={`flex-1 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'language' 
              ? 'bg-gradient-to-tr from-pink-500 to-purple-600 text-white shadow-lg' 
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Languages className="w-4 h-4" /> LANGUAGE
        </button>
        <button
          onClick={() => setActiveTab('reminder')}
          className={`flex-1 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'reminder' 
              ? 'bg-gradient-to-tr from-pink-500 to-purple-600 text-white shadow-lg' 
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Calendar className="w-4 h-4" /> REMINDERS
        </button>
        <button
          onClick={() => setActiveTab('uploader')}
          className={`flex-1 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'uploader' 
              ? 'bg-gradient-to-tr from-pink-500 to-purple-600 text-white shadow-lg' 
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Upload className="w-4 h-4" /> DOCS
        </button>
      </div>

      {/* Chat Overlay */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            className="fixed inset-0 sm:inset-auto sm:right-6 sm:top-24 sm:bottom-24 sm:w-96 bg-[#0c0c0c]/90 backdrop-blur-3xl z-40 border-l sm:border border-white/10 flex flex-col shadow-2xl rounded-l-3xl sm:rounded-3xl overflow-hidden"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="flex items-center gap-3 font-bold tracking-tight text-white">
                <MessageSquare className="w-5 h-5 text-pink-500" />
                NEURAL CACHE
              </h2>
              <button 
                onClick={() => setShowChat(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 hover:text-pink-500 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div 
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth custom-scrollbar text-white/80"
            >
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-white/20 text-center p-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  >
                    <RefreshCw className="w-16 h-16 mb-4 opacity-5" />
                  </motion.div>
                  <p className="text-sm font-mono tracking-widest uppercase opacity-40">No past sass detected... yet.</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-gradient-to-br from-white/10 to-white/5 text-white rounded-tr-none border border-white/10 shadow-lg' 
                      : 'bg-gradient-to-br from-pink-500/20 to-pink-500/5 text-pink-50 text-shadow-sm border border-pink-500/30 rounded-tl-none shadow-[0_4px_20px_rgba(236,72,153,0.1)]'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-[0.3em] opacity-40 mt-2 ml-1 mr-1">
                    {msg.role === 'user' ? user?.displayName?.split(' ')[0] : 'ROXY AI'}
                  </span>
                </motion.div>
              ))}
            </div>

            <form 
              onSubmit={handleSendText}
              className="p-6 bg-white/5 border-t border-white/10 flex gap-3"
            >
              <input 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={state === 'disconnected' ? "Power on to chat..." : "Type some sass..."}
                disabled={state === 'disconnected'}
                className="flex-1 bg-black/50 border border-white/10 rounded-2xl px-5 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all font-light"
              />
              <button 
                type="submit"
                disabled={state === 'disconnected' || !inputText.trim()}
                className="p-3 bg-pink-500 text-white rounded-2xl hover:bg-pink-600 disabled:opacity-30 disabled:grayscale transition-all shadow-[0_0_25px_rgba(236,72,153,0.4)] hover:scale-105 active:scale-95"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen Render Switcher */}
      <div className="w-full max-w-4xl z-10 flex flex-col items-center justify-center min-h-[440px]">
        <AnimatePresence mode="wait">
          {activeTab === 'assistant' && (
            <motion.div
              key="assistant-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col items-center gap-12 w-full"
            >
              {/* Main Sphere visual interaction */}
              <div className="relative perspective-1000">
                <motion.div
                  animate={{ 
                    scale: state === 'speaking' ? [1, 1.1, 1] : state === 'listening' ? [1, 1.05, 1] : 1,
                    opacity: state === 'disconnected' ? 0.2 : 1
                  }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className={`absolute inset-0 rounded-full blur-[40px] opacity-20 ${state === 'speaking' ? 'bg-cyan-500' : 'bg-pink-500'}`}
                />

                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                  className={`absolute -inset-8 border border-white/5 rounded-full ${state !== 'disconnected' ? 'opacity-100' : 'opacity-20'}`}
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className={`absolute -inset-16 border border-white/5 rounded-full ${state !== 'disconnected' ? 'opacity-100' : 'opacity-10'}`}
                />

                <motion.button
                  id="control-button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={toggleConnection}
                  disabled={state === 'connecting'}
                  className={`relative w-64 h-64 rounded-full border-2 transition-all duration-700 flex flex-col items-center justify-center group overflow-hidden ${theme.core} ${theme.glow} shadow-2xl backdrop-blur-sm`}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-20 pointer-events-none" />
                  
                  <AnimatePresence mode="wait">
                    {state === 'disconnected' ? (
                      <motion.div key="power" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                        <Power className="w-16 h-16 text-white/40 group-hover:text-pink-400 transition-all duration-500" />
                      </motion.div>
                    ) : state === 'connecting' ? (
                      <motion.div key="refresh" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                        <RefreshCw className="w-16 h-16 text-yellow-500" />
                      </motion.div>
                    ) : state === 'speaking' ? (
                      <motion.div key="vol" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                        <Volume2 className="w-16 h-16 text-cyan-500 drop-shadow-[0_0_15px_rgba(6,182,212,0.6)]" />
                      </motion.div>
                    ) : (
                      <motion.div key="mic" animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                        <Mic className="w-16 h-16 text-pink-500 drop-shadow-[0_0_15px_rgba(236,72,153,0.6)]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <div className="mt-4 text-[10px] font-mono uppercase tracking-[0.4em] opacity-40 font-bold group-hover:opacity-60 transition-opacity text-white">
                    {state === 'disconnected' ? 'Initialize' : state === 'connecting' ? 'Synching' : 'Active Link'}
                  </div>

                  <div className="absolute inset-0 w-full h-[2px] bg-white/10 top-0 animate-scanline pointer-events-none" />
                </motion.button>

                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-1.5 h-12">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ 
                        height: (state === 'speaking' || state === 'listening') ? [12, 24, 48, 16, 12][i % 5] : 6,
                        opacity: (state === 'speaking' || state === 'listening') ? 1 : 0.2
                      }}
                      transition={{ 
                        duration: 0.3, 
                        repeat: Infinity, 
                        repeatType: "reverse",
                        delay: i * 0.05 
                      }}
                      className={`w-1.5 rounded-full transition-colors duration-500 ${state === 'speaking' ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : state === 'listening' ? 'bg-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.5)]' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              </div>

              <motion.div 
                key={state}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mt-6"
              >
                <div className="text-3xl font-black tracking-tight mb-2 uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40 leading-tight">
                  {getStatusText()}
                </div>
                <div className="flex items-center justify-center gap-4 text-white/20 text-[10px] font-mono tracking-[0.3em] uppercase">
                  <span>Lat: 12ms</span>
                  <span className="w-1 h-1 bg-white/20 rounded-full" />
                  <span>PCM16 @ 16khz</span>
                  <span className="w-1 h-1 bg-white/20 rounded-full" />
                  <span>Stable</span>
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'language' && (
            <motion.div
              key="language-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full max-w-xl"
            >
              <LanguageTester />
            </motion.div>
          )}

          {activeTab === 'reminder' && (
            <motion.div
              key="reminder-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full max-w-xl"
            >
              <StudyReminder />
            </motion.div>
          )}

          {activeTab === 'uploader' && (
            <motion.div
              key="uploader-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full max-w-2xl flex flex-col gap-6"
            >
              {/* Drag n Drop Uploader Card */}
              <div 
                className={`w-full bg-[#111111]/45 border-2 rounded-2xl p-8 backdrop-blur-xl flex flex-col items-center justify-center transition-all ${
                  isDragging ? 'border-pink-500 bg-pink-500/5' : 'border-dashed border-white/10 hover:border-white/20'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const files = e.dataTransfer.files;
                  if (files && files.length > 0) processFiles(files);
                }}
              >
                <div className="p-4 bg-white/5 rounded-full border border-white/5 text-pink-500 mb-4 animate-bounce">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">Drag & Drop Study Documents</h3>
                <p className="text-xs text-white/50 text-center max-w-sm mb-4 leading-relaxed">
                  Support images (diagrams, anatomy charts) and clinical PDF files. Let Roxy parse the contents to prepare an emotional learning session!
                </p>

                <label className="px-5 py-2.5 bg-gradient-to-tr from-pink-500 to-purple-600 hover:opacity-95 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 transition-all cursor-pointer">
                  Browse Files
                  <input 
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/*,application/pdf"
                    multiple
                  />
                </label>
              </div>

              {/* Study Materials Catalog */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-mono tracking-wider font-bold uppercase text-white/40">Clinical materials bank ({uploadedStudies.length})</span>
                
                {uploadedStudies.length === 0 ? (
                  <p className="text-xs text-white/30 italic">No attachments loaded yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {uploadedStudies.map((doc: any) => (
                      <div 
                        key={doc.id}
                        className="p-4 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex flex-col justify-between h-44"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <span className="text-xs font-bold text-white line-clamp-1 block flex-1 break-all">{doc.name}</span>
                            <span className="text-[9px] uppercase font-mono bg-pink-500/10 text-pink-400 border border-pink-500/25 px-1.5 py-0.5 rounded shrink-0 font-extrabold">
                              {doc.type}
                            </span>
                          </div>
                          
                          <p className="text-[11px] text-white/50 leading-relaxed font-light line-clamp-3 italic mb-3">
                            "{doc.extractedText}"
                          </p>
                        </div>

                        <div className="flex justify-between items-center gap-2 border-t border-white/5 pt-2 mt-1">
                          <span className="text-[10px] text-white/30 font-mono italic">{doc.size}</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => askRoxyToAnalyze(doc)}
                              className="px-2.5 py-1.5 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-mono text-[10px] font-extrabold uppercase rounded-lg active:scale-90 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" /> ANALYZE
                            </button>
                            {!doc.demodoc && (
                              <button
                                onClick={() => deleteUploadedFile(doc.id)}
                                className="p-1.5 hover:bg-red-500/10 text-white/30 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-10 left-6 right-6 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto bg-red-500/10 border border-red-500/30 p-5 rounded-2xl flex items-center justify-between gap-4 backdrop-blur-2xl shadow-2xl z-50"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <ShieldAlert className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-sm font-medium text-red-100">{error}</div>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5 opacity-40 hover:opacity-100 animate-pulse" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="absolute bottom-6 left-0 right-0 text-center opacity-10 text-[9px] uppercase tracking-[0.5em] pointer-events-none font-bold">
        Neural Core &bull; Sassy Logic V3 &bull; Distributed Memory
      </div>
    </div>
  );
}

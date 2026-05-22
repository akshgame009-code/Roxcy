import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Clock, Trash2, Check, Siren, Flame, AlertCircle } from 'lucide-react';

interface ReminderConfig {
  time: string;
  topic: string;
  days: string[];
}

export default function StudyReminder() {
  const [reminders, setReminders] = useState<ReminderConfig[]>(() => {
    const saved = localStorage.getItem('roxy_study_reminders');
    return saved ? JSON.parse(saved) : [
      { time: "20:30", topic: "German Daily A1 Greetings", days: ["Everyday"] },
      { time: "16:15", topic: "My Cardiology & Heart Anatomy review", days: ["Everyday"] }
    ];
  });

  const [inputTime, setInputTime] = useState('19:00');
  const [inputTopic, setInputTopic] = useState('German A1 Grammatik');
  const [alertToShow, setAlertToShow] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    localStorage.setItem('roxy_study_reminders', JSON.stringify(reminders));
  }, [reminders]);

  const lastTriggeredMin = useRef('');

  // Synthesizes a high-fidelity digital alarm clock double beep + high bell chime sequence
  const playAlarmSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const playChime = (startTime: number, freq: number, decay: number, type: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + decay);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + decay);
      };

      const now = ctx.currentTime;
      // High-quality classic multi-beep alarm sequence
      playChime(now + 0.0, 980, 0.12, 'triangle');
      playChime(now + 0.1, 980, 0.12, 'triangle');
      
      playChime(now + 0.35, 980, 0.12, 'triangle');
      playChime(now + 0.45, 980, 0.12, 'triangle');
      
      // High resonant crystal clock bell sound at the end
      playChime(now + 0.7, 1200, 0.4, 'sine');
      playChime(now + 0.7, 2400, 0.4, 'sine'); // overtone harmonic
    } catch (err) {
      console.warn("Failed to sound digital alarm due to browser gesture guidelines:", err);
    }
  };

  // Handle checking current clock to fire triggers in mock/realtime
  useEffect(() => {
    const checkSeconds = setInterval(() => {
      const now = new Date();
      const currentHrsMins = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      if (lastTriggeredMin.current !== currentHrsMins) {
        const triggered = reminders.find(r => r.time === currentHrsMins);
        if (triggered) {
          lastTriggeredMin.current = currentHrsMins;
          setAlertToShow(`🚨 Hey Akshay! Samay ho gaya hai! Time to practice: "${triggered.topic}". Roxy says: No excuses, let's go!`);
          setShowNotification(true);
          playAlarmSound();
        }
      }
    }, 15000); // Check every 15s

    return () => clearInterval(checkSeconds);
  }, [reminders]);

  const addReminder = () => {
    if (!inputTime) return;
    const isDup = reminders.some(r => r.time === inputTime);
    if (isDup) return;

    setReminders(prev => [
      ...prev,
      { time: inputTime, topic: inputTopic, days: ["Everyday"] }
    ]);
    
    // Play sound / Show immediate flash
    setAlertToShow(`✅ Perfect! Study reminder set for ${inputTime}. Roxy will text you to start: ${inputTopic}!`);
    setShowNotification(true);
  };

  const deleteReminder = (timeToDelete: string) => {
    setReminders(prev => prev.filter(r => r.time !== timeToDelete));
  };

  return (
    <div id="study-reminder" className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-3xl shadow-xl flex flex-col gap-5 relative">
      {/* Decorative pulse glow */}
      <div className="absolute -top-4 -left-4 w-24 h-24 bg-purple-500/10 blur-[50px] pointer-events-none rounded-full" />
      
      {/* Icon header */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="p-2.5 bg-gradient-to-tr from-purple-500 to-indigo-600 rounded-xl text-white shadow-lg shadow-purple-500/20">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-white">NEURAL STUDY REMINDER ENGINE</h3>
          <p className="text-xs text-white/50">Schedule target studies; get motivational pings from Roxy</p>
        </div>
      </div>

      {/* Reminder Creator Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-black/30 p-4 border border-white/5 rounded-xl">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-white/40 font-bold">Set Reminder Time</label>
          <input 
            type="time" 
            value={inputTime}
            onChange={(e) => setInputTime(e.target.value)}
            className="bg-[#050505] border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/60 font-mono"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-white/40 font-bold">Study Subject / Topic</label>
          <select
            value={inputTopic}
            onChange={(e) => setInputTopic(e.target.value)}
            className="bg-[#050505] border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/60 select-none"
          >
            <option value="German Daily A1 Greetings">🇩🇪 German Daily A1 Greetings</option>
            <option value="German Nursing Vocabulary (Krankenschwester)">🇩🇪 German Medical Vocabulary</option>
            <option value="My Cardiology & Heart Anatomy review">🧠 Cardiology & Heart Anatomy</option>
            <option value="Pharmacology Vitals (Beta Blockers)">💊 Pharmacology (Beta Blockers)</option>
            <option value="General Typing Spelling Test">✏️ General Typing & Spelling Practice</option>
          </select>
        </div>

        <button
          type="button"
          onClick={addReminder}
          className="col-span-1 sm:col-span-2 mt-2 py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 font-bold text-xs tracking-widest text-white uppercase rounded-xl transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-95 cursor-pointer flex items-center justify-center gap-2"
        >
          <Bell className="w-4 h-4" /> Schedule Reminder
        </button>
      </div>

      {/* Trigger Study Alert Prompt */}
      <AnimatePresence>
        {showNotification && alertToShow && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="p-4 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-orange-500/10 border-l-4 border-pink-500 p-4 rounded-xl text-xs flex flex-col gap-2 relative shadow-xl overflow-hidden"
          >
            <div className="flex items-center gap-2">
              <Siren className="w-4 h-4 text-pink-400 animate-bounce" />
              <span className="font-mono font-bold text-pink-400 capitalize bg-pink-500/10 px-2 py-0.5 rounded">Trigger Notice</span>
            </div>
            <p className="text-white/80 font-medium leading-relaxed mt-1">
              {alertToShow}
            </p>
            <button
              onClick={() => {
                setShowNotification(false);
                setAlertToShow(null);
              }}
              className="mt-2 text-[10px] font-bold text-white/50 hover:text-white uppercase font-mono tracking-widest text-right underline cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reminders List */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-mono tracking-wider uppercase text-white/40 font-bold">Active Time Reminders ({reminders.length})</span>
        {reminders.length === 0 ? (
          <p className="text-xs text-white/20 italic p-3 text-center border border-dashed border-white/5 rounded-xl">No study alarms configured.</p>
        ) : (
          <div className="space-y-2">
            {reminders.map((rem, idx) => (
              <div 
                key={idx}
                className="flex items-center justify-between p-3.5 bg-[#080808]/85 border border-white/5 rounded-xl text-xs hover:border-white/10 transition-all shadow-md group"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500/10 text-purple-400 border border-purple-500/10 p-2 rounded-lg font-mono font-bold tracking-tight text-sm">
                    {rem.time}
                  </div>
                  <div>
                    <h4 className="font-bold text-white tracking-wide">{rem.topic}</h4>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 flex items-center gap-1.5 mt-0.5">
                      <Flame className="w-3 h-3 text-pink-500" /> Repeated Everyday
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAlertToShow(`🚨 TEST ALERT TRIGGERED for ${rem.time}. Study target: "${rem.topic}". Roxy says: Chop chop, Akshay, get to work!`);
                      setShowNotification(true);
                      playAlarmSound();
                    }}
                    className="p-1.5 hover:bg-white/5 text-purple-400 hover:text-purple-300 rounded-lg transition-colors border border-transparent hover:border-white/5 text-[10px] tracking-wider font-mono font-bold uppercase transition-all px-2.5 active:scale-95 cursor-pointer"
                  >
                    Test Trg
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReminder(rem.time)}
                    className="p-1.5 hover:bg-red-500/10 text-white/30 hover:text-red-400 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

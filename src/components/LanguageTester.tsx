import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, CheckCircle2, AlertTriangle, Play, Mic, MicOff, BookOpen, RotateCcw, Award, ChevronRight, Check, Languages } from 'lucide-react';

interface LessonPrompt {
  id: string;
  category: 'german_a1' | 'medical_german' | 'english_anatomy';
  title: string;
  targetText: string;
  translation: string;
  hint: string;
}

const LESSONS: LessonPrompt[] = [
  {
    id: 'g1',
    category: 'german_a1',
    title: 'Warm Welcome',
    targetText: 'Guten Tag, wie heißen Sie?',
    translation: 'Good day, what is your name? (Formal)',
    hint: 'Guten (Good) Tag (Day), wie (how) heißen (are named) Sie (you)?'
  },
  {
    id: 'g2',
    category: 'german_a1',
    title: 'Asking for Help',
    targetText: 'Entschuldigung, wo ist das Krankenhaus?',
    translation: 'Excuse me, where is the hospital?',
    hint: 'Krankenhaus literally means sick-house, capital K!'
  },
  {
    id: 'm1',
    category: 'medical_german',
    title: 'Vitals Inspection',
    targetText: 'Bitte messen Sie den Blutdruck des Patienten.',
    translation: 'Please measure the blood pressure of the patient.',
    hint: 'Blutdruck is always capitalized. "den Blutdruck" is accusative.'
  },
  {
    id: 'm2',
    category: 'medical_german',
    title: 'Emergency Alarm',
    targetText: 'Der Patient leidet unter akuter Atemnot.',
    translation: 'The patient is suffering from acute shortness of breath.',
    hint: 'Atemnot stands for breathing distress. Capital A!'
  },
  {
    id: 'e1',
    category: 'english_anatomy',
    title: 'Anatomy Cardiology',
    targetText: 'The cardiovascular system supplies oxygen to tissues.',
    translation: 'Heart and vessels supply system.',
    hint: 'Cardiovascular is all one word, spelled card-io-vas-cular.'
  },
  {
    id: 'e2',
    category: 'english_anatomy',
    title: 'Neurological Vitals',
    targetText: 'Electroencephalography measures electrical brain activity.',
    translation: 'EEG measures brain waves.',
    hint: 'Electro-encephalo-graphy, take your time with this spelling!'
  }
];

export default function LanguageTester() {
  const [activeCategory, setActiveCategory] = useState<'german_a1' | 'medical_german' | 'english_anatomy'>('german_a1');
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [mode, setMode] = useState<'typing' | 'speaking'>('typing');
  
  // Typing States
  const [typedInput, setTypedInput] = useState('');
  const [typingResult, setTypingResult] = useState<{
    submitted: boolean;
    isCorrect: boolean;
    score: number;
    diff: { word: string; correct: boolean }[];
    feedback: string;
  } | null>(null);

  // Speaking States
  const [isRecording, setIsRecording] = useState(false);
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const [speakingResult, setSpeakingResult] = useState<{
    accuracy: number;
    matchedWords: { word: string; status: 'correct' | 'missing' | 'incorrect' }[];
    feedback: string;
  } | null>(null);

  // Web Speech API Ref
  const recognitionRef = useRef<any>(null);

  const filteredPrompts = LESSONS.filter(p => p.category === activeCategory);
  const currentPrompt = filteredPrompts[currentPromptIndex] || filteredPrompts[0];

  useEffect(() => {
    // Reset inputs on change of prompt
    setTypedInput('');
    setTypingResult(null);
    setSpokenTranscript('');
    setSpeakingResult(null);
    setIsRecording(false);
  }, [currentPromptIndex, activeCategory, mode]);

  // Setup Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      // Configure language based on category
      rec.lang = activeCategory.includes('german') ? 'de-DE' : 'en-US';

      rec.onstart = () => {
        setIsRecording(true);
        setSpokenTranscript('');
        setSpeakingResult(null);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSpokenTranscript(transcript);
        analyzeSpeaking(transcript);
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error', e);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, [activeCategory]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      // Fallback if Speech API is not supported in this browser
      const mockSpeak = prompt("Speech recognition is limited in this preview tab. Type what you spoke to mock the voice accuracy:", currentPrompt.targetText);
      if (mockSpeak) {
        setSpokenTranscript(mockSpeak);
        analyzeSpeaking(mockSpeak);
      }
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      // Re-initialize language setting on the fly
      recognitionRef.current.lang = activeCategory.includes('german') ? 'de-DE' : 'en-US';
      recognitionRef.current.start();
    }
  };

  // Compare Typing character/word by word
  const verifyTyping = () => {
    const target = currentPrompt.targetText.trim();
    const typed = typedInput.trim();

    const targetWords = target.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/);
    const typedWords = typed.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/);

    const diff = target.split(/\s+/).map((word, idx) => {
      const cleanWord = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
      const typedMatch = typedWords[idx] || '';
      return {
        word,
        correct: cleanWord === typedMatch
      };
    });

    const correctCount = diff.filter(d => d.correct).length;
    const score = Math.round((correctCount / diff.length) * 100);
    const isCorrect = score === 100;

    // Sassy companion feedback based on result
    let feedback = '';
    if (isCorrect) {
      feedback = "Perfect score! Roxy is genuinely impressed. Keep feeding that brain!";
    } else if (score >= 70) {
      feedback = "So close, but a small spelling or casing error tripped you up. Look at the highlighted parts!";
    } else if (score >= 40) {
      feedback = "Arre... check your spelling carefully. Roxy thinks you need to practice this line again.";
    } else {
      feedback = "Is that German or did your cat walk on the keyboard? Let's check the guide and try again!";
    }

    setTypingResult({
      submitted: true,
      isCorrect,
      score,
      diff,
      feedback
    });
  };

  // Analyze voice pronunciation
  const analyzeSpeaking = (transcript: string) => {
    const target = currentPrompt.targetText;
    const cleanTargetWords = target.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/);
    const cleanSpokenWords = transcript.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/);

    const matchedWords = target.split(/\s+/).map((word) => {
      const cleanWord = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
      const isFound = cleanSpokenWords.includes(cleanWord);
      return {
        word,
        status: isFound ? 'correct' as const : 'missing' as const
      };
    });

    const correctWords = matchedWords.filter(m => m.status === 'correct').length;
    const accuracy = Math.round((correctWords / matchedWords.length) * 100);

    let feedback = '';
    if (accuracy === 100) {
      feedback = "Spot on! Your accent is basically native. Roxy's heart skipped a beat.";
    } else if (accuracy >= 75) {
      feedback = `Solid effort (Accuracy: ${accuracy}%). Try to pronounce each syllable clearly next time!`;
    } else {
      feedback = `We got about ${accuracy}% correct. Give it another shot, listen to yourself and take it slowly.`;
    }

    setSpeakingResult({
      accuracy,
      matchedWords,
      feedback
    });
  };

  const nextPrompt = () => {
    if (currentPromptIndex < filteredPrompts.length - 1) {
      setCurrentPromptIndex(prev => prev + 1);
    } else {
      setCurrentPromptIndex(0);
    }
  };

  return (
    <div id="language-tester" className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-3xl shadow-xl flex flex-col gap-6 relative overflow-hidden">
      {/* Absolute decorative gradient orb */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 blur-[50px] pointer-events-none rounded-full" />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-xl text-white shadow-lg shadow-pink-500/20">
            <Languages className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              ROXY INTUITIVE LANGUAGE LAB
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-pink-500/20 border border-pink-500/40 rounded-full text-pink-400">Beta</span>
            </h3>
            <p className="text-xs text-white/50">Realtime Spelling & Pronunciation Analyzer</p>
          </div>
        </div>

        {/* Toggle Mode */}
        <div className="flex bg-black/40 border border-white/5 p-1 rounded-xl">
          <button
            onClick={() => setMode('typing')}
            className={`px-4 py-1.5 text-xs font-mono rounded-lg transition-all ${mode === 'typing' ? 'bg-pink-500 text-white font-bold' : 'text-white/40 hover:text-white/80'}`}
          >
            TYPING TEST
          </button>
          <button
            onClick={() => setMode('speaking')}
            className={`px-4 py-1.5 text-xs font-mono rounded-lg transition-all ${mode === 'speaking' ? 'bg-pink-500 text-white font-bold' : 'text-white/40 hover:text-white/80'}`}
          >
            SPEAKING TEST
          </button>
        </div>
      </div>

      {/* Categories Grid selectors */}
      <div className="grid grid-cols-3 bg-black/30 border border-white/5 p-1 rounded-xl gap-1">
        {(['german_a1', 'medical_german', 'english_anatomy'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCategory(cat);
              setCurrentPromptIndex(0);
            }}
            className={`py-1.5 text-xs font-semibold tracking-wide rounded-lg transition-all capitalize ${
              activeCategory === cat 
                ? 'bg-white/10 text-white shadow' 
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            {cat === 'german_a1' && 'German A1'}
            {cat === 'medical_german' && 'Med German'}
            {cat === 'english_anatomy' && 'Med English'}
          </button>
        ))}
      </div>

      {/* Main card representation */}
      <div className="bg-black/40 border border-white/5 rounded-2xl p-6 flex flex-col gap-4 relative">
        <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-pink-400 uppercase font-bold">
          <span>Active Practice Module ({currentPromptIndex + 1}/{filteredPrompts.length})</span>
          <span className="text-white/40">{currentPrompt.title}</span>
        </div>

        {/* Big Prompt target phrase */}
        <div className="my-2 select-all">
          <span className="text-white/40 text-xs font-mono block mb-1">Target Statement to Mimic:</span>
          <p className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/70 tracking-tight leading-tight select-all">
            {currentPrompt.targetText}
          </p>
          <span className="text-xs text-white/50 block mt-2 font-medium italic">
            Meaning: "{currentPrompt.translation}"
          </span>
        </div>

        {/* Tip Hint */}
        <div className="bg-white/5 rounded-xl px-4 py-2.5 border border-white/5 text-xs text-white/40 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
          <p><strong>Companion Tip:</strong> {currentPrompt.hint}</p>
        </div>

        <div className="border-t border-white/10 my-1" />

        {/* Practice Mode Layouts */}
        <AnimatePresence mode="wait">
          {mode === 'typing' ? (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono text-white/40">Type your answer here (Case sensitive):</label>
                <textarea
                  value={typedInput}
                  onChange={(e) => setTypedInput(e.target.value)}
                  placeholder={currentPrompt.targetText}
                  className="w-full bg-[#050505] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all font-light text-white font-mono placeholder:opacity-20 resize-none h-20"
                />
              </div>

              {/* Typing Analysis Feedback */}
              {typingResult && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-white/40 uppercase tracking-widest font-bold">Spelling Analysis</span>
                    <span className={`px-2.5 py-1 text-xs font-mono rounded-lg font-bold border ${typingResult.isCorrect ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-pink-500/10 text-pink-400 border-pink-500/25'}`}>
                      Score: {typingResult.score}%
                    </span>
                  </div>

                  {/* Character Highlight Diff */}
                  <div className="flex flex-wrap items-center gap-1.5 p-3 bg-black/40 rounded-lg text-sm font-mono border border-white/5">
                    {typingResult.diff.map((item, idx) => (
                      <span 
                        key={idx} 
                        className={`px-1.5 py-0.5 rounded ${
                          item.correct 
                            ? 'text-emerald-400 bg-emerald-500/5' 
                            : 'text-red-400 bg-red-500/10 line-through'
                        }`}
                      >
                        {item.word}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-white/70 italic leading-relaxed">
                     ✨ <strong>Roxy's Feedback:</strong> "{typingResult.feedback}"
                  </p>
                </div>
              )}

              <div className="flex md:flex-row flex-col gap-2">
                <button
                  type="button"
                  onClick={verifyTyping}
                  disabled={!typedInput.trim()}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:opacity-40 disabled:scale-100 text-white font-bold text-sm tracking-wide py-3 rounded-xl shadow-lg border border-pink-500/20 px-6 active:scale-95 transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> Check Spelling & Grammar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTypedInput('');
                    setTypingResult(null);
                  }}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 p-3 rounded-xl transition-all font-mono text-xs flex items-center justify-center text-white cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="speaking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col items-center justify-center py-6 bg-black/40 rounded-xl border border-white/5 relative overflow-hidden">
                {isRecording && (
                  <div className="absolute inset-x-0 bottom-0 top-0 pointer-events-none flex items-center justify-center">
                    <div className="w-1/2 h-1/2 bg-pink-500/10 blur-2xl rounded-full animate-ping" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg outline-none ${
                    isRecording 
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30 ring-4 ring-red-500/20 animate-pulse' 
                      : 'bg-gradient-to-tr from-pink-500 to-purple-500 hover:opacity-90 text-white shadow-pink-500/40 hover:scale-105 active:scale-95'
                  }`}
                >
                  {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                <p className="text-xs font-mono tracking-wider text-white/50 mt-4 uppercase">
                  {isRecording ? "Recording... Pronounce the sentence nicely" : "Tap speak to start voice analyzer"}
                </p>

                {/* Live micro wave graphics */}
                {isRecording && (
                  <div className="flex gap-1 items-end h-8 mt-2">
                    {[1, 2, 3, 2, 4, 3, 5, 2, 4, 1, 3, 2].map((h, i) => (
                      <motion.span 
                        key={i}
                        animate={{ height: [4, 24, 4][i % 3] }}
                        transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.04 }}
                        className="w-1 bg-pink-500 rounded" 
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Spoken Transcript preview */}
              {spokenTranscript && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3">
                  <span className="text-xs font-mono text-white/40 uppercase tracking-widest font-bold">What You Spoke</span>
                  <p className="text-sm font-light text-white italic">
                    "{spokenTranscript}"
                  </p>
                </div>
              )}

              {/* Pronunciation Feedback Analyzer */}
              {speakingResult && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-white/40 uppercase tracking-widest font-bold">Accent & Accuracy</span>
                    <span className={`px-2.5 py-1 text-xs font-mono rounded-lg font-bold border ${speakingResult.accuracy >= 80 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-pink-500/10 text-pink-400 border-pink-500/25'}`}>
                      Accuracy: {speakingResult.accuracy}%
                    </span>
                  </div>

                  {/* Accented Words analysis */}
                  <div className="flex flex-wrap items-center gap-1.5 p-3 bg-black/40 rounded-lg text-sm font-mono border border-white/5">
                    {speakingResult.matchedWords.map((item, idx) => (
                      <span 
                        key={idx} 
                        className={`px-1.5 py-0.5 rounded ${
                          item.status === 'correct'
                            ? 'text-emerald-400 bg-emerald-500/5' 
                            : 'text-rose-400 bg-rose-500/10 border border-rose-500/10'
                        }`}
                      >
                        {item.word}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-white/70 italic leading-relaxed">
                     📣 <strong>Roxy's Speech Feedback:</strong> "{speakingResult.feedback}"
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Control Buttons for lessons */}
      <div className="flex justify-between items-center mt-2">
        <div className="text-xs font-mono text-white/30">
          Try other presets under {activeCategory.replace('_', ' ')}:
        </div>
        <button
          type="button"
          onClick={nextPrompt}
          className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-pink-400 hover:text-pink-300 transition-colors bg-white/5 border border-white/10 px-4 py-2 rounded-xl cursor-pointer"
        >
          Next Preset <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

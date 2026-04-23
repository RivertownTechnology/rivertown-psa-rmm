import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface TimerState {
  isRunning: boolean;
  startTime: number | null;
  ticketId: string | null;
  ticketNumber: number | null;
  ticketSubject: string | null;
  elapsed: string; // "HH:MM:SS"
}

interface TimerContextType extends TimerState {
  startTimer: (ticketId?: string, ticketNumber?: number, ticketSubject?: string) => void;
  stopTimer: () => Promise<{ durationMinutes: number } | null>;
  clearTimer: () => void;
}

const TimerContext = createContext<TimerContextType | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [isRunning, setIsRunning] = useState(() => {
    try { return localStorage.getItem('timer-running') === 'true'; } catch { return false; }
  });
  const [startTime, setStartTime] = useState<number | null>(() => {
    try { const t = localStorage.getItem('timer-start'); return t ? parseInt(t) : null; } catch { return null; }
  });
  const [ticketId, setTicketId] = useState<string | null>(() => {
    try { return localStorage.getItem('timer-ticketId'); } catch { return null; }
  });
  const [ticketNumber, setTicketNumber] = useState<number | null>(() => {
    try { const n = localStorage.getItem('timer-ticketNumber'); return n ? parseInt(n) : null; } catch { return null; }
  });
  const [ticketSubject, setTicketSubject] = useState<string | null>(() => {
    try { return localStorage.getItem('timer-ticketSubject'); } catch { return null; }
  });
  const [elapsed, setElapsed] = useState('00:00:00');

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('timer-running', String(isRunning));
      if (startTime) localStorage.setItem('timer-start', String(startTime));
      else localStorage.removeItem('timer-start');
      if (ticketId) localStorage.setItem('timer-ticketId', ticketId);
      else localStorage.removeItem('timer-ticketId');
      if (ticketNumber) localStorage.setItem('timer-ticketNumber', String(ticketNumber));
      else localStorage.removeItem('timer-ticketNumber');
      if (ticketSubject) localStorage.setItem('timer-ticketSubject', ticketSubject);
      else localStorage.removeItem('timer-ticketSubject');
    } catch {}
  }, [isRunning, startTime, ticketId, ticketNumber, ticketSubject]);

  // Tick every second
  useEffect(() => {
    if (!isRunning || !startTime) return;
    const interval = setInterval(() => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setElapsed(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, startTime]);

  function startTimer(tId?: string, tNum?: number, tSubject?: string) {
    setIsRunning(true);
    setStartTime(Date.now());
    setTicketId(tId ?? null);
    setTicketNumber(tNum ?? null);
    setTicketSubject(tSubject ?? null);
    setElapsed('00:00:00');
  }

  async function stopTimer() {
    if (!startTime) return null;
    const durationMinutes = Math.max(1, Math.ceil((Date.now() - startTime) / 60000));
    setIsRunning(false);
    setStartTime(null);
    setElapsed('00:00:00');
    return { durationMinutes };
  }

  function clearTimer() {
    setIsRunning(false);
    setStartTime(null);
    setTicketId(null);
    setTicketNumber(null);
    setTicketSubject(null);
    setElapsed('00:00:00');
  }

  return (
    <TimerContext.Provider value={{ isRunning, startTime, ticketId, ticketNumber, ticketSubject, elapsed, startTimer, stopTimer, clearTimer }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within TimerProvider');
  return ctx;
}

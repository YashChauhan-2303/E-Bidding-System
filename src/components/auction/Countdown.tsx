import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface CountdownProps {
  endTime: string;
  onEnd?: () => void;
}

export function Countdown({ endTime, onEnd }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const end = new Date(endTime).getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('Auction Ended');
        onEnd?.();
        return;
      }

      setIsEnding(diff < 1800000); // Less than 30 minutes

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [endTime, onEnd]);

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${
        isEnding ? 'animate-pulse border-warning bg-warning/10 text-warning' : 'border-border'
      }`}
    >
      <Clock className="h-5 w-5" />
      <div>
        <p className="text-xs font-medium opacity-70">Time Remaining</p>
        <p className="text-lg font-bold">{timeLeft}</p>
      </div>
    </div>
  );
}
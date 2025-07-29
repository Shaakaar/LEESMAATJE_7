import { useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';

interface Props {
  onClick: () => void;
  recording: boolean;
  waveLevel: number;
}

export default function MicButton({ onClick, recording, waveLevel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const base = w / 2 - 25;
    const radius = base + waveLevel * 25;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(79,140,255,0.8)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }, [waveLevel]);

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={150}
        height={150}
        aria-hidden="true"
        className={recording ? 'absolute inset-0' : 'hidden'}
      />
      <button
        onClick={onClick}
        aria-label="Opnemen"
        className={`rounded-full w-28 h-28 flex flex-col items-center justify-center bg-primary text-white ${recording ? 'shadow-lg' : ''}`}
      >
        <Mic className="h-8 w-8" />
        <span className="sr-only">Opnemen</span>
      </button>
    </div>
  );
}

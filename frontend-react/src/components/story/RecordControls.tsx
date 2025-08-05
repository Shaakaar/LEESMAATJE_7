interface RecordControlsProps {
  onRecord: () => void;
  onStop: () => void;
  recording: boolean;
  playbackUrl: string | null;
  onPlayback: () => void;
  status: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export function RecordControls({
  onRecord,
  onStop,
  recording,
  playbackUrl,
  onPlayback,
  status,
  canvasRef,
}: RecordControlsProps) {
  return (
    <div className="flex flex-col items-center mt-4">
      <div className="relative w-40 h-40 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={150}
          height={150}
          className={`${recording ? "opacity-100" : "opacity-0"} transition-opacity absolute pointer-events-none`}
        />
        <button
          onClick={recording ? onStop : onRecord}
          className={`w-28 h-28 rounded-full flex flex-col items-center justify-center bg-primary text-white ${recording ? "shadow-inner" : ""}`}
        >
          <i className="lucide lucide-mic text-4xl" />
          <span className="label mt-1 text-sm">
            {recording ? "Stop" : "Opnemen"}
          </span>
        </button>
      </div>
      {playbackUrl && (
        <button
          onClick={onPlayback}
          className="flex items-center gap-1 px-4 py-2 rounded-full bg-primary text-white mt-4"
        >
          <i className="lucide lucide-play-circle" />
          <span className="font-semibold">Afspelen</span>
        </button>
      )}
      <div className="mt-2 font-semibold h-5">{status}</div>
    </div>
  );
}

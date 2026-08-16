import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import logoUrl from "@/assets/logo_kota_tangerang_selatan.png";
import { authService, type CaptchaProof, type CaptchaPurpose } from "@/services/authService";

interface Props {
  purpose: CaptchaPurpose;
  clientKey: string;
  resetKey: number;
  disabled?: boolean;
  onChange: (proof: CaptchaProof | null) => void;
}

const CANVAS_HEIGHT = 150;
const PIECE_SIZE = 46;

function jigsawPath(x: number, y: number, size: number): Path2D {
  const path = new Path2D();
  const third = size / 3;
  const bump = size / 7;
  path.moveTo(x, y);
  path.lineTo(x + third, y);
  path.bezierCurveTo(x + third, y + bump, x + third * 2, y + bump, x + third * 2, y);
  path.lineTo(x + size, y);
  path.lineTo(x + size, y + third);
  path.bezierCurveTo(x + size - bump, y + third, x + size - bump, y + third * 2, x + size, y + third * 2);
  path.lineTo(x + size, y + size);
  path.lineTo(x, y + size);
  path.lineTo(x, y + third * 2);
  path.bezierCurveTo(x + bump, y + third * 2, x + bump, y + third, x, y + third);
  path.closePath();
  return path;
}

export function LogoSliderCaptcha({ purpose, clientKey, resetKey, disabled, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const startedAtRef = useRef(0);
  const trackRef = useRef<number[]>([]);
  const drawRef = useRef<() => void>(() => {});
  const [challengeId, setChallengeId] = useState("");
  const [challengeToken, setChallengeToken] = useState(""); // token server-side dari /issue
  const [target, setTarget] = useState(62);
  const [vertical, setVertical] = useState(48);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const [message, setMessage] = useState("Geser potongan puzzle hingga menjadi logo yang sempurna.");

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !image.complete) return;
    const width = Math.max(160, Math.floor(canvas.clientWidth || 320));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = CANVAS_HEIGHT * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const buffer = document.createElement("canvas");
    buffer.width = width;
    buffer.height = CANVAS_HEIGHT;
    const bufferContext = buffer.getContext("2d");
    if (!bufferContext) return;
    const gradient = bufferContext.createLinearGradient(0, 0, width, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#e0f2fe");
    gradient.addColorStop(1, "#d1fae5");
    bufferContext.fillStyle = gradient;
    bufferContext.fillRect(0, 0, width, CANVAS_HEIGHT);
    bufferContext.globalAlpha = 0.9;
    const logoSize = 124;
    bufferContext.drawImage(image, (width - logoSize) / 2, 13, logoSize, logoSize);
    bufferContext.globalAlpha = 1;
    bufferContext.fillStyle = "rgba(15, 23, 42, 0.08)";
    bufferContext.fillRect(0, 0, width, CANVAS_HEIGHT);

    context.clearRect(0, 0, width, CANVAS_HEIGHT);
    context.drawImage(buffer, 0, 0);
    const travel = Math.max(1, width - PIECE_SIZE);
    
    // Map target (0-100) strictly to the logo's horizontal bounds
    const logoX = (width - logoSize) / 2;
    const minSlotX = logoX;
    const maxSlotX = logoX + logoSize - PIECE_SIZE;
    const slotX = minSlotX + (target / 100) * (maxSlotX - minSlotX);
    
    // Map vertical (0-100) strictly to the logo's vertical bounds
    const logoY = 13;
    const minSlotY = logoY;
    const maxSlotY = logoY + logoSize - PIECE_SIZE;
    const slotY = minSlotY + (vertical / 100) * (maxSlotY - minSlotY);
    
    const pieceX = (position / 100) * travel;

    context.fillStyle = "rgba(15, 23, 42, 0.48)";
    context.strokeStyle = "rgba(255,255,255,0.95)";
    context.lineWidth = 2;
    const slotPath = jigsawPath(slotX, slotY, PIECE_SIZE);
    context.fill(slotPath);
    context.stroke(slotPath);

    context.save();
    const piecePath = jigsawPath(pieceX, slotY, PIECE_SIZE);
    context.clip(piecePath);
    context.drawImage(buffer, slotX, slotY, PIECE_SIZE, PIECE_SIZE, pieceX, slotY, PIECE_SIZE, PIECE_SIZE);
    context.restore();
    context.strokeStyle = verified ? "#10b981" : "#2563eb";
    context.lineWidth = 3;
    context.stroke(piecePath);
  }, [imageVersion, position, target, vertical, verified]);
  drawRef.current = draw;

  const loadChallenge = useCallback(async () => {
    setLoading(true);
    setVerified(false);
    setPosition(0);
    setMessage("Geser potongan puzzle hingga menjadi logo yang sempurna.");
    trackRef.current = [];
    startedAtRef.current = 0;
    setChallengeToken("");
    onChange(null);
    try {
      const result = await authService.challenge(purpose, clientKey);
      setChallengeId(result.challengeId);
      setChallengeToken(result.token ?? ""); // simpan server token
      setTarget(result.target);
      setVertical(result.vertical);
    } catch (error: any) {
      setChallengeId("");
      setChallengeToken("");
      setMessage(error?.message || "Puzzle belum dapat dimuat. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [clientKey, onChange, purpose]);

  useEffect(() => { loadChallenge(); }, [loadChallenge, resetKey]);
  useEffect(() => {
    const image = new Image();
    image.src = logoUrl;
    image.onload = () => {
      imageRef.current = image;
      setImageVersion((value) => value + 1);
    };
  }, []);
  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const redraw = () => drawRef.current();
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, []);

  function handleInput(value: number) {
    if (verified || loading || disabled) return;
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    setPosition(value);
    const track = trackRef.current;
    if (!track.length || Math.abs(track[track.length - 1] - value) >= 1) {
      if (track.length < 80) track.push(Math.round(value * 10) / 10);
    }
  }

  function handleRelease() {
    if (!challengeId || verified || loading || disabled || !startedAtRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(160, Math.floor(canvas.clientWidth || 320));
    const travel = Math.max(1, width - PIECE_SIZE);
    const logoSize = 124;
    const logoX = (width - logoSize) / 2;
    const minSlotX = logoX;
    const maxSlotX = logoX + logoSize - PIECE_SIZE;
    const slotX = minSlotX + (target / 100) * (maxSlotX - minSlotX);
    const requiredPosition = (slotX / travel) * 100;

    if (Math.abs(position - requiredPosition) <= 3.5) {
      if (trackRef.current.length < 3 || Date.now() - startedAtRef.current < 500) {
        setMessage("Geser perlahan hingga potongan tepat pada lubangnya.");
        return;
      }
      const proof: CaptchaProof = {
        challengeId,
        position: Math.round(position * 10) / 10,
        elapsedMs: Date.now() - startedAtRef.current,
        track: trackRef.current.slice(),
        token: challengeToken, // sertakan server token untuk verifikasi server-side
        width: width,
      };
      setVerified(true);
      setMessage("Puzzle terverifikasi.");
      onChange(proof);
    } else {
      // Kunci kontrol segera setelah percobaan gagal agar challenge lama tidak
      // dapat dilepas ulang selama jeda singkat sebelum challenge baru dimuat.
      setLoading(true);
      onChange(null);
      setMessage("Posisi belum tepat. Puzzle diperbarui.");
      window.setTimeout(loadChallenge, 500);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-white/60 dark:border-gray-700/70 bg-white/45 dark:bg-gray-900/45 p-3 shadow-inner">
      <div className="relative overflow-hidden rounded-xl border border-white/80 dark:border-gray-700 bg-sky-50">
        <canvas ref={canvasRef} className="block h-[150px] w-full" aria-label="Puzzle geser Logo SIMOSDA" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-sm font-semibold text-blue-700">
            <RefreshCw className="mr-2 animate-spin" size={17} /> Menyiapkan puzzle...
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ShieldCheck size={17} className={verified ? "text-emerald-600" : "text-blue-600"} />
        <input
          aria-label="Geser puzzle Logo SIMOSDA"
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={position}
          disabled={loading || verified || disabled || !challengeId}
          onChange={(event) => handleInput(Number(event.target.value))}
          onPointerUp={handleRelease}
          onKeyUp={handleRelease}
          className="h-2 flex-1 cursor-grab accent-blue-600 disabled:cursor-not-allowed"
        />
        {verified ? <CheckCircle2 size={20} className="text-emerald-600" /> : (
          <button type="button" onClick={loadChallenge} disabled={loading || disabled} className="rounded-lg p-1.5 text-gray-500 hover:bg-white/80" title="Muat puzzle baru">
            <RefreshCw size={17} />
          </button>
        )}
      </div>
      <p className={`mt-2 text-center text-xs font-semibold ${verified ? "text-emerald-700 dark:text-emerald-400" : "text-gray-600 dark:text-gray-300"}`}>
        {message}
      </p>
    </div>
  );
}

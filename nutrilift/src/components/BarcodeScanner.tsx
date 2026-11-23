import { useEffect, useRef, useState } from "react";
import { Button, Sheet, TextField } from "./ui";

/**
 * Quét mã vạch bằng camera: dùng BarcodeDetector gốc của trình duyệt (Chrome/Android/Edge),
 * nếu không có (Safari/iOS, Firefox) thì tải thư viện ZXing.
 */
export function BarcodeScanner({ open, onClose, onDetected }: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [engine, setEngine] = useState<string>("");
  const cb = useRef(onDetected);
  cb.current = onDetected;

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let raf: ReturnType<typeof setTimeout> | undefined;
    let zxingControls: { stop: () => void } | undefined;
    const done = (code: string) => {
      if (stopped) return;
      stopped = true;
      navigator.vibrate?.(80);
      cb.current(code);
    };
    (async () => {
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt không hỗ trợ camera (cần HTTPS).");
        const BD = (window as any).BarcodeDetector;
        if (BD) {
          setEngine("native");
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
          const v = videoRef.current!;
          v.srcObject = stream;
          await v.play();
          const detector = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(v);
              if (codes?.length) return done(codes[0].rawValue);
            } catch {
              /* frame chưa sẵn sàng */
            }
            raf = setTimeout(tick, 180);
          };
          tick();
        } else {
          setEngine("zxing");
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result) => {
            if (result) done(result.getText());
          });
          if (stopped) zxingControls.stop();
        }
      } catch (e: any) {
        setError(e?.name === "NotAllowedError" ? "Bạn chưa cho phép dùng camera." : e?.message ?? String(e));
      }
    })();
    return () => {
      stopped = true;
      if (raf) clearTimeout(raf);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v?.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      }
    };
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Quét mã vạch">
      <div className="space-y-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-center text-sm text-muted">Đưa mã vạch vào khung{engine === "zxing" ? " (chế độ tương thích)" : ""}</p>}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onDetected(manual.trim());
          }}
        >
          <TextField className="flex-1" label="Hoặc nhập mã" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="893..." />
          <Button type="submit" disabled={!manual.trim()}>
            Tra cứu
          </Button>
        </form>
      </div>
    </Sheet>
  );
}

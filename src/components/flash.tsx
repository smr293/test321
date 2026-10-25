"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

/**
 * Lightweight toast driven by ?ok= / ?error= / ?info= query params written by
 * server actions. Keeps feedback server-rendered and survive redirects.
 */
export function Flash() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ok = params.get("ok");
  const error = params.get("error");
  const info = params.get("info");
  const message = ok ?? error ?? info;
  const tone = ok ? "ok" : error ? "error" : "info";
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    setVisible(Boolean(message));
    if (!message) return;
    const timer = setTimeout(() => {
      setVisible(false);
      const next = new URLSearchParams(params.toString());
      next.delete("ok");
      next.delete("error");
      next.delete("info");
      router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
    }, error ? 7000 : 4500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message || !visible) return null;
  const Icon = tone === "ok" ? CheckCircle2 : tone === "error" ? XCircle : Info;
  const color = tone === "ok" ? "var(--accent)" : tone === "error" ? "var(--danger)" : "var(--info)";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 sm:bottom-6" role="status" aria-live="polite">
      <div
        className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-2xl"
        style={{ background: "var(--surface)", borderColor: color, color: "var(--ink)" }}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden />
        <span className="flex-1 leading-relaxed">{message}</span>
        <button type="button" onClick={() => setVisible(false)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

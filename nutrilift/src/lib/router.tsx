// Router tối giản dựa trên hash (#/duong-dan?x=y) — chạy được trên GitHub Pages không cần cấu hình máy chủ.
import { useEffect, useState } from "react";

export interface Location {
  path: string;
  query: URLSearchParams;
}

function parse(): Location {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(qs || "") };
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(parse);
  useEffect(() => {
    const on = () => setLoc(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return loc;
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = "#" + (to.startsWith("/") ? to : "/" + to);
  if (opts.replace) {
    history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash;
  }
  window.scrollTo({ top: 0 });
}

export function goBack(fallback = "/") {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

/** So khớp mẫu "/training/program/:id". */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { to, ...rest } = props;
  return <a href={"#" + to} {...rest} />;
}

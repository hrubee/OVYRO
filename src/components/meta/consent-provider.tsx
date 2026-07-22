"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type ConsentState,
  type ConsentValue,
  isConsentGranted,
  parseConsentCookie,
  serializeConsentCookie,
} from "./consent";

interface ConsentContextValue {
  state: ConsentState;
  /** Convenience: `state === "granted"`. Gates the Meta Pixel. */
  granted: boolean;
  /** False until the cookie has been read on the client (avoids a UI flash). */
  ready: boolean;
  accept: () => void;
  decline: () => void;
}

/** Fail-safe default: no provider → no consent, so nothing tracks. */
const FALLBACK: ConsentContextValue = {
  state: "unset",
  granted: false,
  ready: false,
  accept: () => {},
  decline: () => {},
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

/**
 * Holds cookie-consent state for the public site (spec §5.2). Starts `"unset"`
 * and not ready so the server render and first client render agree (no
 * hydration mismatch); the real value is read from `document.cookie` on mount.
 */
export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConsentState>("unset");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(parseConsentCookie(document.cookie));
    setReady(true);
  }, []);

  const choose = useCallback((value: ConsentValue) => {
    document.cookie = serializeConsentCookie(value);
    setState(value);
  }, []);

  const accept = useCallback(() => choose("granted"), [choose]);
  const decline = useCallback(() => choose("denied"), [choose]);

  const value = useMemo<ConsentContextValue>(
    () => ({ state, granted: isConsentGranted(state), ready, accept, decline }),
    [state, ready, accept, decline],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  return useContext(ConsentContext) ?? FALLBACK;
}

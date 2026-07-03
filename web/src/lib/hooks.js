import { useEffect, useRef, useState } from "react";

// Fetch-on-deps hook. `enabled: false` short-circuits to empty (used to show
// "Select at least one …" empty states without hitting the API).
export function useApi(fn, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let on = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((d) => on && setState({ data: d, loading: false, error: null }))
      .catch((e) => on && setState({ data: null, loading: false, error: e }));
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Measured content width of a block element (for custom SVG charts).
export function useMeasure() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function useNarrow() {
  const query = "(max-width: 880px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const cb = (e) => setNarrow(e.matches);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, []);
  return narrow;
}

// Close popovers on any click outside an element marked data-pop.
export function usePopover() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!e.target.closest || !e.target.closest("[data-pop]")) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);
  return [open, setOpen];
}

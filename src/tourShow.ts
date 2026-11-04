import { useEffect, useRef } from "react";

// How a help-tour step's `show` reaches the page: a window event the page's
// component listens for, so the tour needn't know who owns which tabs.
export const TOUR_SHOW_EVENT = "waypoint:tour-show";

export function requestTourShow(id: string) {
  window.dispatchEvent(new CustomEvent(TOUR_SHOW_EVENT, { detail: id }));
}

// Pages with tabs or panels subscribe with this so a tour step can land on
// the right one. The handler gets the step's `show` value.
export function useTourShow(handler: (id: string) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<string>).detail);
    window.addEventListener(TOUR_SHOW_EVENT, on);
    return () => window.removeEventListener(TOUR_SHOW_EVENT, on);
  }, []);
}

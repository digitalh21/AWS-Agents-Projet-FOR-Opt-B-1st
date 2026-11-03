"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "tc_niches_open";
const EVENT = "tc:niches-open";

/**
 * "All niches" master toggle state — shared by every component on the page
 * (sidebar, mobile strip, Niche Manager) and remembered across reloads.
 *
 * This is purely a DISPLAY preference: it only shows/hides the niche list and
 * never changes which leads are loaded or filtered.
 */
export function useNichesOpen() {
  const [open, setOpenState] = useState(true);

  useEffect(() => {
    const read = () => setOpenState(window.localStorage.getItem(KEY) !== "0");
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const setOpen = useCallback((next: boolean) => {
    window.localStorage.setItem(KEY, next ? "1" : "0");
    setOpenState(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const toggle = useCallback(() => {
    setOpen(window.localStorage.getItem(KEY) === "0");
  }, [setOpen]);

  return { open, setOpen, toggle };
}

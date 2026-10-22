"use client";

import { useLayoutEffect } from "react";
import type { AnalysisStage } from "./use-demo-analysis";

// Measure content only; write exclusively to the out-of-flow decorative layer.
export function useBackgroundRegions(stage: AnalysisStage, runId: number) {
  useLayoutEffect(() => {
    const background = document.querySelector<HTMLElement>(".page-background");
    const main = document.querySelector("main");
    const outlook = document.querySelector('[aria-labelledby="outlook-title"]');
    if (!background || !main || !outlook) return;

    const update = () => {
      const origin = background.getBoundingClientRect();
      const top = outlook.getBoundingClientRect().top - origin.top;
      const summary = outlook.lastElementChild?.firstElementChild;
      const waterfall = outlook.querySelector('[aria-labelledby="waterfall-title"]');
      const lowerStart = waterfall?.getBoundingClientRect().top
        ?? summary?.getBoundingClientRect().bottom
        ?? outlook.getBoundingClientRect().bottom;
      // Give bk11's upper sculpture room to read, even with a short KPI zone.
      const transition = Math.max(lowerStart - origin.top - top, origin.width * 941 / 1672 * .65);
      background.style.setProperty("--background-top-height", `${top}px`);
      background.style.setProperty("--background-transition-height", `${transition}px`);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    observer.observe(outlook);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      background.style.removeProperty("--background-top-height");
      background.style.removeProperty("--background-transition-height");
    };
  }, [stage, runId]);
}

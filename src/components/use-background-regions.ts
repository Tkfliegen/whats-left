"use client";

import { useLayoutEffect } from "react";
import { backgroundRegions } from "@/lib/background-regions";
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
      const geometry = backgroundRegions(origin.width, origin.height, top, transition);
      const middle = background.children[1] as HTMLElement;
      const closing = background.lastElementChild as HTMLElement;
      middle.className = "background-middle";
      closing.className = "background-closing";
      const layers = background.querySelectorAll<HTMLElement>(".background-repeat");
      // Mutations affect only the absolute decorative layer, never content size.
      for (let i = layers.length; i < geometry.count - 1; i++) {
        const layer = document.createElement("div");
        layer.className = "background-middle background-repeat";
        background.insertBefore(layer, closing);
      }
      for (let i = geometry.count - 1; i < layers.length; i++) layers[i].remove();
      const middles = background.querySelectorAll<HTMLElement>(".background-middle");
      middles.forEach((layer, index) => {
        layer.style.top = `${geometry.opening + index * geometry.step}px`;
        layer.style.height = `${geometry.middleHeight}px`;
      });
      closing.style.top = `${geometry.closing}px`;
      background.style.setProperty("--background-feather", `${geometry.feather}px`);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    observer.observe(outlook);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      background.querySelectorAll(".background-repeat").forEach(layer => layer.remove());
    };
  }, [stage, runId]);
}

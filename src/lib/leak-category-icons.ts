import type { StaticImageData } from "next/image";
import type { LeakResult } from "@/types/leaks";
import labor from "../../pic/what is left icon-01.png";
import ingredients from "../../pic/what is left icon-02.png";
import delivery from "../../pic/what is left-03.png";
import waste from "../../pic/what is left-04.png";
import operations from "../../pic/what is left-05.png";
import pricing from "../../pic/what is left-06.png";
import other from "../../pic/what is left-07.png";

type LeakCategory = LeakResult["leaks"][number]["category"];
export const leakCategoryIcons = Object.freeze({ labor, ingredients, delivery, waste, operations, pricing, other } satisfies Record<LeakCategory, StaticImageData>);

// Display fallback only. Production category acceptance remains server-owned.
export function leakCategoryIcon(category: unknown): StaticImageData {
  return typeof category === "string" && Object.hasOwn(leakCategoryIcons, category)
    ? leakCategoryIcons[category as LeakCategory] : leakCategoryIcons.other;
}

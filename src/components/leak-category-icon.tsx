import Image from "next/image";
import { leakCategoryIcon } from "@/lib/leak-category-icons";

export function LeakCategoryIcon({ category }: { category: unknown }) {
  return <Image src={leakCategoryIcon(category)} alt="" aria-hidden="true"
    width={40} height={40} sizes="(min-width: 640px) 40px, 36px"
    className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />;
}

import Image from "next/image";
import scenario from "../../pic/what is left-section-scenario.png";
import decision from "../../pic/what is left-section-decision.png";

const sectionIcons = { scenario, decision };
export function SectionIcon({ section }: { section: keyof typeof sectionIcons }) {
  return <Image src={sectionIcons[section]} alt="" aria-hidden="true"
    width={48} height={48} sizes="(min-width: 640px) 48px, 40px"
    className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12" />;
}

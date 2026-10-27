// Presentation geometry only. Layers overlap so every leading alpha feather
// reveals existing artwork rather than the page base.
export function backgroundRegions(width: number, height: number, outlookTop: number, transition: number) {
  const imageHeight = Math.max(1, width * 941 / 1672);
  const overlap = Math.min(150, imageHeight * .3);
  const feather = Math.min(60, overlap / 2);
  const middleHeight = imageHeight - Math.min(96, imageHeight * .15);
  const step = middleHeight - overlap;
  const opening = Math.max(0, Math.min(outlookTop - Math.min(120, overlap), imageHeight - overlap));
  const closing = Math.max(opening + step, Math.min(outlookTop + transition - overlap, height - feather), height - (imageHeight - Math.min(72, imageHeight * .12)));
  const count = Math.max(1, Math.ceil((closing + feather - opening - middleHeight) / step) + 1);
  return { opening, closing, middleHeight, step, count, feather };
}

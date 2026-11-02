/** Ink colours the uploaded signature can be rendered in. */
export const SIGNATURE_INKS = {
  black: "#111827",
  blue: "#1d4ed8",
};

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Converts a photographed/uploaded signature into a clean signature image:
 * white paper background and solid ink (black or blue), so it prints like a real signature.
 */
export async function convertSignature(file: any, ink = "black") {
  if (!file) throw new Error("Choose a signature image first.");
  if (!file.type.startsWith("image/")) throw new Error("Upload an image file (PNG or JPG).");
  if (file.size > MAX_BYTES) throw new Error("Signature image must be under 5 MB.");

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image could not be opened."));
    img.src = dataUrl;
  });

  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / (image.width || maxWidth));
  const width = Math.max(1, Math.round((image.width || maxWidth) * scale));
  const height = Math.max(1, Math.round((image.height || width / 2) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot draw signatures.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const inkRgb = hexToRgb((SIGNATURE_INKS as Record<string, any>)[ink] || SIGNATURE_INKS.black);
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Dark pixels become ink; light paper becomes pure white. A gentle curve keeps strokes smooth.
    const strength = Math.min(1, Math.max(0, (1 - luminance) * 1.6));
    data[i] = Math.round(255 - (255 - inkRgb.r) * strength);
    data[i + 1] = Math.round(255 - (255 - inkRgb.g) * strength);
    data[i + 2] = Math.round(255 - (255 - inkRgb.b) * strength);
    data[i + 3] = 255;
  }

  ctx.putImageData(pixels, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not process that signature image.");
  return new File([blob], "signature.png", { type: "image/png" });
}

function hexToRgb(hex: any) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}
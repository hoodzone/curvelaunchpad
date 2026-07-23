export interface LogoResult {
  dataUri: string;
  bytes: number;
}

/**
 * Turn a user-dropped image file into a compact logo data URI, resized and
 * compressed entirely in the browser so it is small enough to store on-chain
 * (the token metadata lives in the contract's `tokenURI`). Prefers WebP and
 * shrinks dimensions/quality until it fits under `maxBytes`.
 *
 * Uses a FileReader data URL (not a blob: URL) so it works under our strict
 * Content-Security-Policy (img-src allows data:, not blob:).
 */
export async function fileToLogoDataUri(
  file: File,
  { maxDim = 128, maxBytes = 10000 }: { maxDim?: number; maxBytes?: number } = {}
): Promise<LogoResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't an image.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Image is too large (max 25 MB).");
  }

  const img = await loadImage(file);

  for (let dim = maxDim; dim >= 48; dim -= 16) {
    const canvas = drawScaled(img, dim);
    for (let q = 0.85; q >= 0.4; q -= 0.15) {
      const uri = encode(canvas, q);
      if (uri.length <= maxBytes) return { dataUri: uri, bytes: uri.length };
    }
  }

  // Smallest possible attempt.
  const uri = encode(drawScaled(img, 48), 0.4);
  if (uri.length > maxBytes * 1.6) {
    throw new Error("Couldn't compress this image small enough — try a simpler one.");
  }
  return { dataUri: uri, bytes: uri.length };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't decode that image."));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function drawScaled(img: HTMLImageElement, dim: number): HTMLCanvasElement {
  const scale = Math.min(1, dim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, quality: number): string {
  // WebP compresses best; fall back to JPEG where it isn't supported.
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", quality);
}

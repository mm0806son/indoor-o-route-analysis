import { jsPDF } from "jspdf";

/**
 * Prepares an SVG string for export by injecting defaults like font-family.
 */
export function prepareSvgForExport(svgString: string): string {
  // Inject sans-serif font to ensure text looks correct when rendered to canvas
  const style = `<style>text { font-family: sans-serif; }</style>`;
  
  // Insert style after the opening svg tag
  return svgString.replace(/<svg[^>]*>/, (match) => `${match}${style}`);
}

/**
 * Exports a canvas and SVG overlay as a PNG image file.
 * Combines the canvas (typically PDF background) with SVG overlay into a single image.
 * 
 * @param canvas - HTML canvas element containing the background (e.g., PDF map)
 * @param svg - SVG element containing the overlay (e.g., routes, controls)
 * @param filename - Name for the downloaded file (without extension)
 * @param options - Export options
 */
export async function exportCanvasAndSvgAsImage(
  canvas: HTMLCanvasElement,
  svg: SVGSVGElement,
  filename: string,
  options: {
    showBackground?: boolean;
    backgroundOpacity?: number;
  } = {},
  abortSignal?: AbortSignal
): Promise<void> {
  const { showBackground = true, backgroundOpacity = 1 } = options;

  if (abortSignal?.aborted) return Promise.reject(new Error("Export cancelled"));

  // Create a combined canvas
  const combinedCanvas = document.createElement("canvas");
  combinedCanvas.width = canvas.width;
  combinedCanvas.height = canvas.height;
  const ctx = combinedCanvas.getContext("2d");
  if (!ctx) {
    console.error("Failed to get canvas context");
    return;
  }

  // Fill with white background
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

  // Draw background (PDF)
  if (showBackground) {
    ctx.save();
    if (backgroundOpacity < 1) {
      ctx.globalAlpha = backgroundOpacity;
    }
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }

  // Serialize and draw SVG
  let svgData = new XMLSerializer().serializeToString(svg);
  svgData = prepareSvgForExport(svgData);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (abortSignal?.aborted) {
        URL.revokeObjectURL(url);
        reject(new Error("Export cancelled"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      // Trigger download
      const link = document.createElement("a");
      link.download = `${filename}.png`;
      link.href = combinedCanvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      resolve();
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

/**
 * Exports a canvas and SVG overlay as a PDF file.
 * Combines the canvas (typically PDF background) with SVG overlay into a single PDF.
 * 
 * @param canvas - HTML canvas element containing the background (e.g., PDF map)
 * @param svg - SVG element containing the overlay (e.g., routes, controls)
 * @param filename - Name for the downloaded file (without extension)
 * @param options - Export options
 */
export async function exportCanvasAndSvgAsPdf(
  canvas: HTMLCanvasElement,
  svg: SVGSVGElement,
  filename: string,
  options: {
    showBackground?: boolean;
    backgroundOpacity?: number;
  } = {},
  abortSignal?: AbortSignal
): Promise<void> {
  const { showBackground = true, backgroundOpacity = 1 } = options;

  if (abortSignal?.aborted) return Promise.reject(new Error("Export cancelled"));

  // Create a combined canvas
  const combinedCanvas = document.createElement("canvas");
  combinedCanvas.width = canvas.width;
  combinedCanvas.height = canvas.height;
  const ctx = combinedCanvas.getContext("2d");
  if (!ctx) {
    console.error("Failed to get canvas context");
    return;
  }

  // Fill with white background
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

  // Draw background (PDF)
  if (showBackground) {
    ctx.save();
    if (backgroundOpacity < 1) {
      ctx.globalAlpha = backgroundOpacity;
    }
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }

  // Serialize and draw SVG
  let svgData = new XMLSerializer().serializeToString(svg);
  svgData = prepareSvgForExport(svgData);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (abortSignal?.aborted) {
        URL.revokeObjectURL(url);
        reject(new Error("Export cancelled"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const imgData = combinedCanvas.toDataURL("image/png");
      const orientation = combinedCanvas.width > combinedCanvas.height ? "l" : "p";

      const pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [combinedCanvas.width, combinedCanvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, combinedCanvas.width, combinedCanvas.height);
      pdf.save(`${filename}.pdf`);
      
      resolve();
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

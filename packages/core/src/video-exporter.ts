
import type { VideoExportSettings } from "./video-export-types";
import { prepareSvgForExport } from "./export-utils";

export interface VideoExportContext {
    getCanvas: () => HTMLCanvasElement | null;
    getSvg: () => SVGSVGElement | null;
    setSimulationTime: (time: number) => Promise<void>;
    getPlayPosition: () => { x: number, y: number } | null;
    getZoom: () => number;
}

/**
 * Check if the File System Access API (showSaveFilePicker) is available.
 */
function hasFileSystemAccess(): boolean {
    return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/**
 * Prompt the user to pick a save location for the video file.
 * Returns the FileSystemWritableFileStream, or null if not supported.
 * Throws if the user cancels the file picker dialog.
 */
async function promptSaveFile(filename: string): Promise<FileSystemWritableFileStream | null> {
    if (!hasFileSystemAccess()) return null;

    const ext = filename.endsWith('.webm') ? '.webm' : '.mp4';
    const mimeType = ext === '.webm' ? 'video/webm' : 'video/mp4';

    try {
        const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
                description: 'Video file',
                accept: { [mimeType]: [ext] },
            }],
        });
        return await handle.createWritable();
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw err; // User cancelled — propagate so callers can handle it
        }
        // API not available or other error — fall back to in-memory buffer
        console.warn('File System Access API failed, falling back to in-memory buffer', err);
        return null;
    }
}

export class VideoExporter {
    private output: any; // mediabunny Output
    private videoSource: any; // mediabunny CanvasSource
    private outputCanvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private settings: VideoExportSettings | null = null;
    private filename: string = "video.mp4";
    private frameCount: number = 0;

    // Source canvas for direct 3D copy
    private sourceCanvas: HTMLCanvasElement | null = null;

    // Streaming state — writes directly to file instead of buffering in memory
    private writableStream: FileSystemWritableFileStream | null = null;
    private isStreaming: boolean = false;

    constructor(options?: { 
        width: number; 
        height: number; 
        fps: number; 
        filename?: string; 
        canvas?: HTMLCanvasElement;
        bitrate?: number;
        scope?: "current-route" | "current-leg" | "all-legs";
    }) {
        if (options) {
            this.settings = { 
                width: options.width, 
                height: options.height, 
                fps: options.fps, 
                duration: 0, 
                bitrate: options.bitrate || 5_000_000,
                scope: options.scope || "current-route"
            };
            this.filename = options.filename || "video.mp4";
            this.sourceCanvas = options.canvas || null;
        }
    }

    async start() {
        if (!this.settings) throw new Error("Settings not initialized");

        try {
            const { Output, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource } = await import("mediabunny");

            // Try streaming directly to file via the File System Access API
            // to avoid filling memory with large video buffers.
            this.writableStream = await promptSaveFile(this.filename);
            this.isStreaming = this.writableStream !== null;

            // Helper to attempt creating and starting the output with given settings.
            // May throw RangeError if buffer allocation fails (e.g. very large resolution).
            const tryStart = async (width: number, height: number, bitrate: number) => {
                let target: any;
                let formatOptions: any;

                if (this.isStreaming && this.writableStream) {
                    // Stream chunks directly to the file on disk.
                    // Use a modest 1 MB chunk size to reduce peak memory pressure.
                    target = new StreamTarget(this.writableStream, { chunked: true, chunkSize: 1024 * 1024 });
                    formatOptions = {};
                } else {
                    // Fallback: buffer the entire video in memory
                    target = new BufferTarget();
                    formatOptions = { fastStart: "in-memory" };
                }

                const output = new Output({
                    target,
                    format: new Mp4OutputFormat(formatOptions),
                });

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("No context");

                const videoSource = new CanvasSource(canvas, {
                    codec: 'avc',
                    width,
                    height,
                    framerate: this.settings!.fps,
                    bitrate,
                    bitrateMode: 'constant',
                } as any);

                output.addVideoTrack(videoSource, { frameRate: this.settings!.fps });
                await output.start();

                return { output, canvas, ctx, videoSource };
            };

            // Try with the requested settings first; if allocation fails, retry at
            // progressively lower resolutions so the export can still succeed.
            const attempts = [
                { width: this.settings.width, height: this.settings.height, bitrate: this.settings.bitrate || 5_000_000 },
                { width: Math.round(this.settings.width * 0.75), height: Math.round(this.settings.height * 0.75), bitrate: Math.min(this.settings.bitrate || 5_000_000, 5_000_000) },
                { width: Math.round(this.settings.width * 0.5), height: Math.round(this.settings.height * 0.5), bitrate: Math.min(this.settings.bitrate || 5_000_000, 2_500_000) },
            ];

            let started = false;
            for (const attempt of attempts) {
                try {
                    const result = await tryStart(attempt.width, attempt.height, attempt.bitrate);
                    this.output = result.output;
                    this.outputCanvas = result.canvas;
                    this.ctx = result.ctx;
                    this.videoSource = result.videoSource;
                    // Update effective settings so addFrame uses correct dimensions
                    this.settings!.width = attempt.width;
                    this.settings!.height = attempt.height;
                    this.settings!.bitrate = attempt.bitrate;
                    started = true;
                    if (attempt !== attempts[0]) {
                        console.warn(`Video export: reduced resolution to ${attempt.width}x${attempt.height} to avoid memory allocation failure`);
                    }
                    break;
                } catch (err) {
                    if (err instanceof RangeError && attempt !== attempts[attempts.length - 1]) {
                        console.warn(`Video export: allocation failed at ${attempt.width}x${attempt.height}, trying smaller resolution…`);
                        continue;
                    }
                    throw err;
                }
            }

            if (!started) {
                throw new Error("Failed to allocate video buffers – try a lower resolution");
            }
            this.frameCount = 0;
        } catch (err) {
            // Clean up writable stream if start failed after opening it
            if (this.writableStream) {
                try { await this.writableStream.abort(); } catch { /* ignore */ }
                this.writableStream = null;
            }
            console.error("VideoExporter.start() failed:", err);
            throw new Error(`Failed to initialize video exporter: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async addFrame(drawCallback?: (ctx: CanvasRenderingContext2D) => Promise<void>) {
        if (!this.ctx || !this.videoSource || !this.settings) {
            throw new Error(`Exporter not properly initialized: ctx=${!!this.ctx}, videoSource=${!!this.videoSource}, settings=${!!this.settings}`);
        }

        if (drawCallback) {
            // Custom drawing (used by 2D export)
            await drawCallback(this.ctx);
        } else if (this.sourceCanvas) {
            // Default: draw source canvas 1:1 (used by 3D export)
            // Clear
            this.ctx.fillStyle = "black"; // Dark background for 3D
            this.ctx.fillRect(0, 0, this.settings.width, this.settings.height);
            
            // Draw
            this.ctx.drawImage(this.sourceCanvas, 0, 0, this.settings.width, this.settings.height);
        }

        const frameDuration = 1 / this.settings.fps;
        await this.videoSource.add(this.frameCount * frameDuration, frameDuration);
        this.frameCount++;
    }

    async cancel() {
        if (!this.output) return;
        // Just discard what we have
        this.output = null;
        this.videoSource = null;
        this.ctx = null;

        // Abort the writable stream if streaming to file
        if (this.writableStream) {
            try { await this.writableStream.abort(); } catch { /* ignore */ }
            this.writableStream = null;
        }
    }

    async stop() {
        if (!this.output) return;

        await this.output.finalize();

        if (this.isStreaming && this.writableStream) {
            // Streaming mode: data already written to file.
            // The StreamTarget closes the WritableStream as part of finalize(),
            // so we must not call close() again ourselves.
            this.writableStream = null;
        } else {
            // Buffer mode: download as blob
            const buffer = this.output.target.buffer;
            if (!buffer) throw new Error("No output buffer");

            const blob = new Blob([buffer], { type: "video/mp4" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = this.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    async export(
        settings: VideoExportSettings,
        filename: string,
        videoDuration: number,
        simulationDuration: number,
        context: VideoExportContext,
        onProgress: (progress: number) => void
    ) {
        try {
            // Initialize using new method
            this.settings = settings;
            this.filename = filename || `route-analysis-video.mp4`;
            await this.start();
            
            // Verify that start() completed successfully
            if (!this.videoSource || !this.output) {
                throw new Error("VideoExporter failed to initialize properly");
            }

            const sourceCanvas = context.getCanvas();
            if (!sourceCanvas) throw new Error("No canvas");

            const totalFrames = Math.ceil(videoDuration * settings.fps);
            const timeStep = simulationDuration / totalFrames;
            
            for (let i = 0; i < totalFrames; i++) {
                if (!this.output) throw new Error("Export cancelled");
                
                if (i % 5 === 0) onProgress(i / totalFrames);

                const simTime = i * timeStep;
                await context.setSimulationTime(simTime);

                const playPos = context.getPlayPosition();
                const zoom = context.getZoom();

                // Use the custom draw callback
                await this.addFrame(async (ctx) => {
                    // Clear canvas
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, settings.width, settings.height);

                    ctx.save();
                    
                    // Camera transform
                    if (playPos) {
                        // Center on runner
                        ctx.translate(settings.width / 2, settings.height / 2);
                        ctx.scale(zoom, zoom);
                        ctx.translate(-playPos.x, -playPos.y);
                    } else {
                        // Center map
                        ctx.translate(settings.width / 2, settings.height / 2);
                        ctx.scale(zoom, zoom);
                        ctx.translate(-sourceCanvas.width / 2, -sourceCanvas.height / 2);
                    }

                    // Draw map canvas
                    ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height);

                    // Draw SVG overlay
                    const svg = context.getSvg();
                    if (svg) {
                        let svgData = new XMLSerializer().serializeToString(svg);
                        svgData = prepareSvgForExport(svgData);
                        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
                        const url = URL.createObjectURL(svgBlob);

                        await new Promise<void>((resolve, reject) => {
                            const img = new Image();
                            img.onload = () => {
                                ctx.drawImage(img, 0, 0, sourceCanvas.width, sourceCanvas.height);
                                URL.revokeObjectURL(url);
                                resolve();
                            };
                            img.onerror = reject;
                            img.src = url;
                        });
                    }

                    ctx.restore();
                });
            }

            if (!this.output) throw new Error("Export cancelled");
            onProgress(1);
            await this.stop();

        } catch (err) {
            console.error("Export failed", err);
            throw err;
        }
    }
}


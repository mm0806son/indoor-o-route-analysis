import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

export interface VideoWriterOptions {
  width: number;
  height: number;
  fps: number;
  outPath: string;
  /** ffmpeg video encoder name, e.g. "libopenh264", "libx264", "h264_nvenc". */
  vcodec?: string;
  bitrate?: string;
}

const DEFAULT_VCODEC = "libopenh264";
const DEFAULT_BITRATE = "10M";
const STDERR_TAIL_LINES = 200;

/** Lists ffmpeg's registered H.264 encoders (name only), or [] if ffmpeg isn't runnable. */
async function listAvailableH264Encoders(): Promise<string[]> {
  return new Promise((resolve) => {
    let out = "";
    const proc = spawn("ffmpeg", ["-hide_banner", "-encoders"]);
    proc.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    proc.on("close", () => {
      const encoders = out
        .split("\n")
        .filter((line) => /\(codec h264\)/.test(line))
        .map((line) => line.trim().split(/\s+/)[1])
        .filter((name): name is string => Boolean(name));
      resolve(encoders);
    });
    proc.on("error", () => resolve([]));
  });
}

/**
 * Encodes a sequence of raw RGBA frames into an .mp4 file by piping them
 * into an ffmpeg subprocess. Frames must be written in order at exactly
 * `width * height * 4` bytes each.
 */
export class FfmpegVideoWriter {
  private readonly options: Required<VideoWriterOptions>;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stderrTail: string[] = [];

  constructor(options: VideoWriterOptions) {
    this.options = {
      width: options.width,
      height: options.height,
      fps: options.fps,
      outPath: options.outPath,
      vcodec: options.vcodec ?? DEFAULT_VCODEC,
      bitrate: options.bitrate ?? DEFAULT_BITRATE,
    };
  }

  /** Probes ffmpeg's available encoders and starts the subprocess. */
  async start(): Promise<void> {
    const available = await listAvailableH264Encoders();
    if (available.length > 0 && !available.includes(this.options.vcodec)) {
      throw new Error(
        `Requested video encoder "${this.options.vcodec}" is not available in this ffmpeg build. ` +
          `Available H.264 encoders: ${available.join(", ")}. Pass --vcodec to select one of these.`
      );
    }

    const { width, height, fps, outPath, vcodec, bitrate } = this.options;
    const args = [
      "-y",
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-s", `${width}x${height}`,
      "-r", String(fps),
      "-i", "pipe:0",
      "-an",
      "-c:v", vcodec,
      "-pix_fmt", "yuv420p",
      "-b:v", bitrate,
      "-movflags", "+faststart",
      outPath,
    ];

    this.proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail.push(...chunk.toString().split("\n"));
      if (this.stderrTail.length > STDERR_TAIL_LINES) {
        this.stderrTail.splice(0, this.stderrTail.length - STDERR_TAIL_LINES);
      }
    });
  }

  /** Writes one raw RGBA frame, awaiting backpressure if the stdin buffer is full. */
  async writeFrame(rgba: Buffer): Promise<void> {
    const proc = this.proc;
    if (!proc?.stdin) throw new Error("FfmpegVideoWriter.start() must be called before writeFrame()");

    const canWriteMore = proc.stdin.write(rgba);
    if (!canWriteMore) {
      await new Promise<void>((resolve) => proc.stdin.once("drain", () => resolve()));
    }
  }

  /** Closes stdin and waits for ffmpeg to finish encoding; rejects with the stderr tail on failure. */
  async finish(): Promise<void> {
    const proc = this.proc;
    if (!proc) throw new Error("FfmpegVideoWriter.start() must be called before finish()");

    const exitCode = await new Promise<number>((resolve, reject) => {
      proc.on("close", (code) => resolve(code ?? -1));
      proc.on("error", reject);
      proc.stdin.end();
    });

    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}:\n${this.stderrTail.join("\n")}`);
    }
  }
}

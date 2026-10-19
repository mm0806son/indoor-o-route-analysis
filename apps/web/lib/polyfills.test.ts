import { afterEach, describe, expect, it, vi } from "vitest";

describe("browser polyfills", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("provides a UUID v4 implementation when randomUUID is unavailable", async () => {
    let nextByte = 0;
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = nextByte;
          nextByte += 1;
        }
        return bytes;
      },
    });

    await import("./polyfills");

    const uuid = globalThis.crypto.randomUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(uuid).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});

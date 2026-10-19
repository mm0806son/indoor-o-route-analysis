import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent, waitFor } from "@testing-library/react";
import { PublishedMap } from "./map";
const renderer = vi.hoisted(() => ({
  drawMutedGraph: vi.fn(),
  drawHighlightedRoutes: vi.fn(),
  drawLegControls: vi.fn(),
}));
vi.mock("@indoor-o-route-analysis/core/render", () => renderer);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("uses shared renderers with graph geometry and prevents native mouse selection", () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const context = { scale: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement["getContext"]>,
  );
  const map = {
    id: "m",
    scale: 1000,
    layout: "horizontal" as const,
    mapPositionTopLeft: { x: 0, y: 0 },
    mapPositionBottomRight: { x: 100, y: 100 },
    image: {
      width: 100,
      height: 100,
      encodedData: "data:image/png;base64,AA",
      mediaType: "image/png",
    },
  };
  const edges = [{ from: "S", to: "F", label: "" }],
    routes = [{ path: ["S", "F"], color: "#c084fc", progress: 1 }];
  const { getByLabelText } = render(
    <PublishedMap
      map={map}
      race={{
        vertices: [
          { id: "S", x: 0, y: 0 },
          { id: "F", x: 100, y: 100 },
        ],
        edges,
      }}
      dataUrl="https://host/published/data.json"
      routes={routes}
      leg={{ fromNodeId: "S", toNodeId: "F" }}
      showGraph
      onNode={() => {}}
      fitToken={0}
      onImage={() => {}}
    />,
  );
  expect(renderer.drawHighlightedRoutes).toHaveBeenCalledWith(
    context,
    routes,
    edges,
    expect.objectContaining({ positions: expect.any(Map) }),
  );
  expect(renderer.drawMutedGraph).toHaveBeenCalled();
  expect(renderer.drawLegControls).toHaveBeenCalled();
  const canvas = getByLabelText("比赛地图，点击节点设置途经点，拖动平移");
  expect(fireEvent.mouseDown(canvas)).toBe(false);
  expect(fireEvent.mouseMove(canvas)).toBe(false);
});

const pdfFixture = vi.hoisted(() => ({
  getDocument: vi.fn(),
  render: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("@/lib/load-pdfjs", () => ({
  loadPdfJs: async () => ({ getDocument: pdfFixture.getDocument }),
}));
it("completes PDF rasterization before exposing downloadable map and clears loading", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const context = { scale: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement["getContext"]>,
  );
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 200 * scale,
      height: 120 * scale,
    }),
    render: pdfFixture.render,
  };
  pdfFixture.render.mockReturnValue({ promise: Promise.resolve() });
  pdfFixture.destroy.mockResolvedValue(undefined);
  pdfFixture.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async () => page,
      destroy: pdfFixture.destroy,
    }),
  });
  const onImage = vi.fn();
  const map = {
    id: "m",
    scale: 1000,
    layout: "horizontal" as const,
    pageCount: 2,
    mapPositionTopLeft: { x: 0, y: 0 },
    mapPositionBottomRight: { x: 400, y: 120 },
    image: {
      width: 200,
      height: 120,
      mediaType: "application/pdf",
      encodedData: "JVBER",
    },
  };
  const screen = render(
    <PublishedMap
      map={map}
      race={{}}
      dataUrl="https://host/published/event.json"
      routes={[]}
      showGraph={false}
      onNode={() => {}}
      fitToken={0}
      onImage={onImage}
    />,
  );
  await waitFor(() => expect(onImage).toHaveBeenCalledOnce());
  const image = onImage.mock.calls[0][0] as HTMLCanvasElement;
  expect(image.width / image.height).toBeCloseTo(400 / 120);
  expect(pdfFixture.render).toHaveBeenCalledTimes(2);
  expect(pdfFixture.destroy).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("正在加载地图…")).toBeNull();
});
it("shows PDF failures and does not expose a blank downloadable map", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
  pdfFixture.getDocument.mockReturnValue({
    promise: Promise.reject(Error("PDF 无法读取")),
  });
  const onImage = vi.fn();
  const screen = render(
    <PublishedMap
      map={{
        id: "m",
        scale: 1000,
        layout: "horizontal",
        mapPositionTopLeft: { x: 0, y: 0 },
        image: {
          width: 200,
          height: 120,
          mediaType: "application/pdf",
          encodedData: "JVBER",
        },
      }}
      race={{}}
      dataUrl="https://host/published/event.json"
      routes={[]}
      showGraph={false}
      onNode={() => {}}
      fitToken={0}
      onImage={onImage}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("PDF 无法读取"),
  );
  expect(onImage).not.toHaveBeenCalled();
});

function touchHarness() {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "touch";
      }
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
  const map = {
    id: "touch-map",
    scale: 1000,
    layout: "horizontal" as const,
    mapPositionTopLeft: { x: 0, y: 0 },
    mapPositionBottomRight: { x: 100, y: 100 },
    image: {
      width: 100,
      height: 100,
      mediaType: "image/png",
      encodedData: "data:image/png;base64,AA",
    },
  };
  const onNode = vi.fn(),
    onImage = vi.fn();
  const props = {
    map,
    race: {
      vertices: [
        { id: "n", x: 50, y: 50 },
        { id: "b", x: 75, y: 50 },
      ],
      edges: [],
    },
    dataUrl: "https://host/data.json",
    routes: [],
    showGraph: true,
    onNode,
    fitToken: 0,
    onImage,
  };
  const result = render(<PublishedMap {...props} />);
  const canvas = result.getByLabelText(
    "比赛地图，点击节点设置途经点，拖动平移",
  );
  Object.defineProperty(canvas, "setPointerCapture", {
    value: vi.fn(),
    configurable: true,
  });
  const position = () =>
    renderer.drawMutedGraph.mock.calls.at(-1)![2].positions.get("n") as {
      x: number;
      y: number;
    };
  const gap = () => {
    const p = renderer.drawMutedGraph.mock.calls.at(-1)![2].positions;
    return p.get("b").x - p.get("n").x;
  };
  const pointer = (type: string, id: number, x: number, y: number) =>
    fireEvent(
      canvas,
      new PointerEvent(type, {
        pointerId: id,
        pointerType: "touch",
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      }),
    );
  return { ...result, canvas, props, onNode, position, gap, pointer };
}
it("touch drag pans even when capture is unavailable, without selecting a node", () => {
  const h = touchHarness(),
    before = h.position();
  Object.defineProperty(h.canvas, "setPointerCapture", {
    value: () => {
      throw new DOMException("capture unavailable", "NotFoundError");
    },
  });
  h.pointer("pointerdown", 1, 400, 300);
  h.pointer("pointermove", 1, 450, 330);
  h.pointer("pointerup", 1, 450, 330);
  expect(h.position()).toEqual({ x: before.x + 50, y: before.y + 30 });
  expect(h.onNode).not.toHaveBeenCalled();
});
it("two fingers translate their midpoint as well as zoom, then a remaining finger keeps panning", () => {
  const h = touchHarness(),
    before = h.position(),
    gap = h.gap();
  h.pointer("pointerdown", 1, 350, 300);
  h.pointer("pointerdown", 2, 450, 300);
  h.pointer("pointermove", 1, 350, 340);
  h.pointer("pointermove", 2, 550, 340);
  expect(h.position().x).toBeCloseTo(before.x + 50);
  expect(h.position().y).toBeCloseTo(before.y + 40);
  expect(h.gap()).toBeCloseTo(gap * 2);
  h.pointer("pointerup", 2, 550, 340);
  h.pointer("pointermove", 1, 370, 350);
  h.pointer("pointerup", 1, 370, 350);
  expect(h.position().x).toBeCloseTo(before.x + 70);
  expect(h.position().y).toBeCloseTo(before.y + 50);
  expect(h.onNode).not.toHaveBeenCalled();
});
it("keeps an in-progress gesture through equivalent map props and cancels lost capture without false selection", () => {
  const h = touchHarness(),
    before = h.position();
  h.pointer("pointerdown", 1, 400, 300);
  h.pointer("pointermove", 1, 420, 310);
  h.rerender(<PublishedMap {...h.props} map={{ ...h.props.map }} />);
  h.pointer("pointermove", 1, 440, 320);
  expect(h.position()).toEqual({ x: before.x + 40, y: before.y + 20 });
  h.pointer("lostpointercapture", 1, 440, 320);
  h.pointer("pointermove", 1, 500, 380);
  h.pointer("pointerup", 1, 500, 380);
  expect(h.position()).toEqual({ x: before.x + 40, y: before.y + 20 });
  expect(h.onNode).not.toHaveBeenCalled();
});
it("selects a tapped node, but pointer cancellation never selects or continues panning", () => {
  const h = touchHarness();
  h.pointer("pointerdown", 1, 400, 300);
  h.pointer("pointerup", 1, 400, 300);
  expect(h.onNode).toHaveBeenCalledWith("n");
  h.onNode.mockClear();
  h.pointer("pointerdown", 2, 400, 300);
  h.pointer("pointercancel", 2, 400, 300);
  h.pointer("pointermove", 2, 450, 350);
  h.pointer("pointerup", 2, 450, 350);
  expect(h.position()).toEqual({ x: 400, y: 300 });
  expect(h.onNode).not.toHaveBeenCalled();
});

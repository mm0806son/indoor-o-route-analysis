import type { ThreeElements } from "@react-three/fiber";

// Augment JSX IntrinsicElements with React Three Fiber elements.
// The R3F module augmentation doesn't merge correctly with React 19's
// JSX namespace under moduleResolution: "bundler", so we do it explicitly.
declare module "react" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends ThreeElements {}
  }
}

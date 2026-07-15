import type React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Renders a ReactNode (or array of nodes) to a DOM subtree so tests can query it structurally. */
export function renderToDom(node: React.ReactNode): HTMLElement {
  const markup = renderToStaticMarkup(createElement("svg", null, node));
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

import HomePage from "../page";

export function generateStaticParams() {
  return [
    { screen: "event-manager" },
    { screen: "course-setting" },
    { screen: "graph-editor" },
    { screen: "stairs" },
    { screen: "route-builder" },
    { screen: "route-analysis" },
    { screen: "event-analysis" },
    { screen: "labs" },
    { screen: "modify-graph" },
    { screen: "model-3d" },
  ];
}

export default function ScreenPage() {
  return <HomePage />;
}

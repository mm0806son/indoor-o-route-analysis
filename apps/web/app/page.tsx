import AppShell from "@/components/app-shell";
import PublishedViewer from "@/components/published-viewer";

export default function HomePage() {
  return process.env.NEXT_PUBLIC_PUBLISHED_VIEWER === "1" ? <PublishedViewer /> : <AppShell />;
}

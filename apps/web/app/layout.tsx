"use client";

import "@/lib/polyfills";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SessionBoundary, isPublishedSession } from "@/components/publication/session-boundary";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const published = isPublishedSession(pathname, process.env.NEXT_PUBLIC_PUBLISHED_VIEWER === "1");

  useEffect(() => {
    // Set page title and meta tags dynamically
    document.title = published ? "赛后路线复盘" : "Indoor Orienteering Route Analysis";

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "Indoor orienteering route analysis tool");
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = "Indoor o route analysis tool";
      document.head.appendChild(meta);
    }

    // Register service worker for PWA (production only)
    let updateInterval: NodeJS.Timeout | null = null;

    if (!published && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('Service Worker registered:', registration);

          // Check for updates periodically (every 30 seconds)
          updateInterval = setInterval(() => {
            registration.update();
          }, 30000);

          // Listen for controller change (new service worker became active)
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('New Service Worker activated - reload for updates');
            // Optionally show a toast/notification to user about updates
          });
        },
        (error) => {
          console.log('Service Worker registration failed:', error);
        }
      );
    }

    // Cleanup function - always consistent
    return () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    };
  }, [published]);

  return (
    <html lang={published ? "zh-CN" : "en"}>
      <head>
        <link rel="icon" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {!published && <link rel="manifest" href="/manifest.json" />}
        {process.env.NEXT_PUBLIC_PUBLISHED_VIEWER === "1" && <meta name="publication-build" content="1" />}
        <meta name="theme-color" content="#000000" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body className={`font-sans antialiased`}>
        <SessionBoundary>{children}</SessionBoundary>
      </body>
    </html>
  );
}

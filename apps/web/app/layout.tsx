"use client";

import "@/lib/polyfills";
import { useEffect } from "react";
import { AppDataProvider } from "@indoor-o-route-analysis/ui";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    // Set page title and meta tags dynamically
    document.title = "Indoor Orienteering Route Analysis";

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

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
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
  }, []);

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body className={`font-sans antialiased`}>
        <AppDataProvider>{children}</AppDataProvider>
      </body>
    </html>
  );
}

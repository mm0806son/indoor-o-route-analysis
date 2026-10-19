"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AppDataProvider } from "@indoor-o-route-analysis/ui";

/** The published viewer must never hydrate the organizer's IndexedDB session. */
export function isPublishedSession(
  pathname: string | null,
  publicationBuild: boolean,
): boolean {
  return publicationBuild || pathname?.replace(/\/+$/, "") === "/viewer";
}

export function SessionBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (
    isPublishedSession(
      pathname,
      process.env.NEXT_PUBLIC_PUBLISHED_VIEWER === "1",
    )
  ) {
    return <>{children}</>;
  }
  return <AppDataProvider>{children}</AppDataProvider>;
}

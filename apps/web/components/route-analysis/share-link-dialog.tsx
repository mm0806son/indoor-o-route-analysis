"use client"

import { X } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";

interface ShareLinkDialogProps {
  isOpen: boolean;
  shareLink: string;
  copyStatus: "idle" | "copied" | "failed";
  onClose: () => void;
  onCopy: () => void;
  onOpenLink: () => void;
}

export default function ShareLinkDialog({
  isOpen,
  shareLink,
  copyStatus,
  onClose,
  onCopy,
  onOpenLink,
}: ShareLinkDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg w-full max-w-xl mx-4 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Share Link</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          Copy this link or open it in a new tab.
        </p>
        <div className="mb-4 rounded border border-border bg-muted/30 p-2">
          <input
            type="text"
            readOnly
            value={shareLink}
            className="w-full bg-transparent text-xs text-foreground outline-none"
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Share link"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
          >
            {copyStatus === "copied" ? "Copied" : "Copy link"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onOpenLink}
          >
            Open link
          </Button>
        </div>

        {copyStatus === "failed" && (
          <p className="mt-2 text-xs text-destructive">Failed to copy link. You can still copy it manually.</p>
        )}
      </div>
    </div>
  );
}
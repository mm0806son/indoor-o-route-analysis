import { Input } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { NO, SE } from 'country-flag-icons/react/3x2';
import { safeHttpUrl } from "@/components/shared";
// import type { EventData } from "@indoor-o-route-analysis/core"; // Unused

interface EventPropertiesTabProps {
  titleInput: string;
  setTitleInput: (value: string) => void;
  handleTitleBlur: () => void;
  dateInput: string;
  setDateInput: (value: string) => void;
  handleDateBlur: () => void;
  eventUrlInput: string;
  setEventUrlInput: (value: string) => void;
  handleEventUrlBlur: () => void;
  eventImageUrlInput: string;
  setEventImageUrlInput: (value: string) => void;
  handleEventImageUrlBlur: () => void;
  mapDownloadUrlInput: string;
  setMapDownloadUrlInput: (value: string) => void;
  handleMapDownloadUrlBlur: () => void;
  countryInput: string;
  handleCountryChange: (value: string) => void;
}

export function EventPropertiesTab({
  titleInput,
  setTitleInput,
  handleTitleBlur,
  dateInput,
  setDateInput,
  handleDateBlur,
  eventUrlInput,
  setEventUrlInput,
  handleEventUrlBlur,
  eventImageUrlInput,
  setEventImageUrlInput,
  handleEventImageUrlBlur,
  mapDownloadUrlInput,
  setMapDownloadUrlInput,
  handleMapDownloadUrlBlur,
  countryInput,
  handleCountryChange,
}: EventPropertiesTabProps) {
  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex gap-8">
        <div className="flex-1 max-w-md space-y-4">
          <div>
            <Label htmlFor="event-title" className="text-xs text-muted-foreground">
              {"Title"}
            </Label>
            <Input
              id="event-title"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleBlur}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-date" className="text-xs text-muted-foreground">
              {"Date (YYYY-MM-DD)"}
            </Label>
            <Input
              id="event-date"
              type="text"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              onBlur={handleDateBlur}
              placeholder="YYYY-MM-DD"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-url" className="text-xs text-muted-foreground">
              {"Event URL"}
            </Label>
            <Input
              id="event-url"
              type="url"
              value={eventUrlInput}
              onChange={(e) => setEventUrlInput(e.target.value)}
              onBlur={handleEventUrlBlur}
              placeholder="https://..."
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-image-url" className="text-xs text-muted-foreground">
              {"Event image URL"}
            </Label>
            <Input
              id="event-image-url"
              type="url"
              value={eventImageUrlInput}
              onChange={(e) => setEventImageUrlInput(e.target.value)}
              onBlur={handleEventImageUrlBlur}
              placeholder="https://..."
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="map-download-url" className="text-xs text-muted-foreground">
              {"Event maps URL"}
            </Label>
            <Input
              id="map-download-url"
              type="url"
              value={mapDownloadUrlInput}
              onChange={(e) => setMapDownloadUrlInput(e.target.value)}
              onBlur={handleMapDownloadUrlBlur}
              placeholder="https://..."
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-country" className="text-xs text-muted-foreground">
              {"Country"}
            </Label>
            <Select value={countryInput || "none"} onValueChange={handleCountryChange}>
              <SelectTrigger id="event-country" className="mt-1">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{"None"}</SelectItem>
                <SelectItem value="norway">
                  <span className="flex items-center gap-2">
                    <NO {...{ className: "w-5", title: "Norway" } as Record<string, string>} />
                    <span>Norway</span>
                  </span>
                </SelectItem>
                <SelectItem value="sweden">
                  <span className="flex items-center gap-2">
                    <SE {...{ className: "w-5", title: "Sweden" } as Record<string, string>} />
                    <span>Sweden</span>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(eventImageUrlInput || eventUrlInput || mapDownloadUrlInput) && (
          <div className="flex-1 max-w-sm">
            {eventImageUrlInput && (
              <>
                <div className="border rounded-md overflow-hidden bg-muted/20">
                  <img
                    src={eventImageUrlInput}
                    alt="Event preview"
                    className="w-full h-auto object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              </>
            )}
            <div className="mt-2 flex flex-col gap-1 text-sm">
              {safeHttpUrl(eventUrlInput) && (
                <a
                  href={safeHttpUrl(eventUrlInput)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline block"
                >
                  {"Event"}
                </a>
              )}
              {safeHttpUrl(mapDownloadUrlInput) && (
                <a
                  href={safeHttpUrl(mapDownloadUrlInput)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline block"
                >
                  {"Event maps"}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


import { format } from "date-fns";

export interface ExportNamingContext {
    eventDate?: Date | string | { date: string } | null;
    eventName?: string | null;
    courseName?: string | null;
    legName?: string | null; // e.g. "Leg 1"
    routeName?: string | null; // e.g. "Route 1"
    suffix?: string | null; // e.g. " - route analysis map"
}

export class ExportNaming {
    static getFilename(context: ExportNamingContext, extension: string = "mp4"): string {
        const parts: string[] = [];

        // Date
        if (context.eventDate) {
            let d: Date | null = null;
            if (context.eventDate instanceof Date) {
               d = context.eventDate;
            } else if (typeof context.eventDate === 'string') {
               d = new Date(context.eventDate);
            } else if (typeof context.eventDate === 'object' && 'date' in context.eventDate) {
               d = new Date(context.eventDate.date);
            }
            
            if (d && !isNaN(d.getTime())) {
                parts.push(format(d, "yyyy-MM-dd"));
            }
        }

        // Event Name
        if (context.eventName) {
            parts.push(ExportNaming.sanitize(context.eventName));
        }

        // Course
        if (context.courseName) {
             parts.push(ExportNaming.sanitize(context.courseName));
        }

        // Leg
        if (context.legName) {
             parts.push(ExportNaming.sanitize(context.legName));
        }

        // Route
        if (context.routeName) {
             parts.push(ExportNaming.sanitize(context.routeName));
        }

        // Suffix
        if (context.suffix) {
             parts.push(context.suffix);
        }
        
        return `${parts.join(" ")}.${extension}`;
    }

    private static sanitize(str: string): string {
        // Replace invalid filesystem characters with -
        // Keep spaces
        return str.replace(/[\\/:*?"<>|]+/g, "-").trim();
    }
}

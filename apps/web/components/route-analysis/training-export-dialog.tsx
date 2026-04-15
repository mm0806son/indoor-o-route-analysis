"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"

import { Button } from "@indoor-o-route-analysis/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@indoor-o-route-analysis/ui"
import { Label } from "@indoor-o-route-analysis/ui"
import { RadioGroup, RadioGroupItem } from "@indoor-o-route-analysis/ui"
import { Progress } from "@indoor-o-route-analysis/ui"

import { RouteAnalyzer, type RouteInfo } from "@indoor-o-route-analysis/core"
import { analyzeCourseLegsGenerator, type Leg } from "@indoor-o-route-analysis/core"
import { TrainingDataIO, type TrainingCourse } from "@indoor-o-route-analysis/core"
import { TrainingDataXmlGenerator } from "@indoor-o-route-analysis/core"
import type { EventData, Course } from "@indoor-o-route-analysis/core"
import type { ScoringModel } from "@indoor-o-route-analysis/core"

interface TrainingExportDialogProps {
  isOpen: boolean
  onClose: () => void
  courses: Course[]
  selectedCourseId: string | null
  event: EventData
  mapScale: number
  scoringModel: ScoringModel
  runningSpeed: number
  // Pre-calculated data for the selected course
  selectedCourseLegs?: Leg[]
  selectedCourseRoutes?: (leg: Leg) => RouteInfo[]
}

export function TrainingExportDialog({
  isOpen,
  onClose,
  courses,
  selectedCourseId,
  event,
  mapScale,
  scoringModel,
  selectedCourseLegs,
  selectedCourseRoutes,
}: TrainingExportDialogProps) {
  const [format, setFormat] = useState<"json" | "xml">("json")
  const [scope, setScope] = useState<"selected" | "all">("selected")
  
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState("")

  const handleExport = async () => {
    if (!event) return
    
    setIsExporting(true)
    setProgress(0)

    try {
      const coursesToExport = scope === "selected" 
        ? courses.filter(c => c.id === selectedCourseId)
        : courses

      if (coursesToExport.length === 0) {
        setStatusMessage("No course selected")
        setIsExporting(false)
        return
      }

      const totalOperations = coursesToExport.length
      let completedOperations = 0
      
      const routeAnalyzer = new RouteAnalyzer(
        event.raceCourses?.[0]?.controls || [],
        event.raceCourses?.[0]?.vertices || [],
        event.raceCourses?.[0]?.edges || [],
        mapScale,
        scoringModel,
        event.raceCourses?.[0]?.polygons || []
      )
      
      const analyzedCourses: TrainingCourse[] = []

      for (const course of coursesToExport) {
        setStatusMessage(`Analyzing ${course.name}...`)
        
        let legs: Leg[] = []
        let getRoutes: (leg: Leg) => RouteInfo[] = () => []

        // Use pre-calculated data if available and we are processing the selected course
        if (course.id === selectedCourseId && selectedCourseLegs && selectedCourseRoutes) {
          legs = selectedCourseLegs
          getRoutes = selectedCourseRoutes
        } else {
          // Perform analysis
          // Always find all routes including minor variations for training export
          const generator = analyzeCourseLegsGenerator(course, event, routeAnalyzer, true)
          let routesRecord: Record<number, RouteInfo[]> = {}
          
           
          for await (const _update of generator) {
            // Optional: update inner progress for long courses?
          }
          
          const finalResult = await (async () => {
             const gen = analyzeCourseLegsGenerator(course, event, routeAnalyzer, true)
             let lastYield = { legs: [] as Leg[], routes: {} as Record<number, RouteInfo[]> }
             for await (const val of gen) {
               lastYield = val
             }
             return lastYield
          })()
          
          legs = finalResult.legs
          routesRecord = finalResult.routes
          getRoutes = (leg: Leg) => routesRecord[leg.id] || []
        }

        // Store analyzed data
        const courseData = TrainingDataIO.generateCourseData(
          event,
          course,
          legs,
          routeAnalyzer,
        )
        analyzedCourses.push(courseData)

        // For XML, we export individually because the XML structure likely expects one course (based on IOF standard)
        // Or if we can combine, that would be distinct. 
        // Current XML generator TrainingDataXmlGenerator.generateXml takes single course.
        // The previous implementation loops and downloads.
        if (format === "xml") {
           setStatusMessage(`Exporting ${course.name} (XML)...`)
           const filename = buildExportFilename(event, course, "xml")
           const content = TrainingDataXmlGenerator.generateXml(
             event,
             course,
             legs,
             getRoutes as any // eslint-disable-line @typescript-eslint/no-explicit-any
           )
           downloadFile(content, filename, "application/xml")
           
           // Delay between downloads
           await new Promise(r => setTimeout(r, 200))
        }

        completedOperations++
        setProgress((completedOperations / totalOperations) * 100)
      }
      
      // If JSON, we combine all into one event file
      if (format === "json") {
        setStatusMessage("Generating Event JSON...")
        const eventExport = TrainingDataIO.generateEventExport(event, analyzedCourses)
        
        // Use event name for filename if multiple/all courses, otherwise specific course name
        // But since format wraps everything in TrainingEvent, maybe event name is best default?
        // If single course, we might still want that course name in filename for clarity
        
        let filename: string;
        if (scope === "selected" && selectedCourseId) {
             const course = courses.find(c => c.id === selectedCourseId);
             filename = buildExportFilename(event, course!, "json");
        } else {
             const eventDate = event.startTime?.date ? new Date(event.startTime.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
             const eventName = sanitizeNamePart(event.name || "event");
             filename = `${eventDate} ${eventName} - training.json`;
        }

        const content = JSON.stringify(eventExport, null, 2)
        downloadFile(content, filename, "application/json")
      }
      
      setStatusMessage("Export complete")
      // Close after a brief delay
      setTimeout(() => {
        setIsExporting(false)
        onClose()
      }, 1000)

    } catch (error) {
      console.error("Export failed", error)
      setStatusMessage("Export failed")
      setIsExporting(false)
    }
  }

  const canExport = scope === "all" || (scope === "selected" && selectedCourseId)

  return (
    <Dialog open={isOpen} onOpenChange={() => !isExporting && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export for Training App</DialogTitle>
          <DialogDescription>
            Export course and route data for the training app.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-3">
            <Label>File Format</Label>
            <RadioGroup 
              value={format} 
              onValueChange={(v) => setFormat(v as "json" | "xml")}
              disabled={isExporting}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="format-json" />
                <Label htmlFor="format-json">JSON</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="xml" id="format-xml" />
                <Label htmlFor="format-xml">XML (IOF Extension)</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label>Scope</Label>
            <RadioGroup 
              value={scope} 
              onValueChange={(v) => setScope(v as "selected" | "all")}
              disabled={isExporting}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="selected" id="scope-selected" disabled={!selectedCourseId} />
                <Label htmlFor="scope-selected" className={!selectedCourseId ? "text-muted-foreground" : ""}>
                  Selected Course Only
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all">All Courses ({courses.length})</Label>
              </div>
            </RadioGroup>
          </div>

          {isExporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{statusMessage}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!canExport || isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function sanitizeNamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

function buildExportFilename(event: EventData, course: Course, format: "json" | "xml") {
    const eventDate = event.startTime?.date ? new Date(event.startTime.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    const eventName = sanitizeNamePart(event.name || "event");
    const courseName = sanitizeNamePart(course.name || "course");
    return `${eventDate} ${eventName} ${courseName} - training.${format}`;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

"use client";

import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import type { ClassCourseAssignment } from "@indoor-o-route-analysis/core";
import type { Course } from "@indoor-o-route-analysis/core";

interface ClassAssignmentsTabProps {
  classAssignments: ClassCourseAssignment[];
  courses: Course[];
  onAddAssignment: () => void;
  onUpdateClassName: (index: number, className: string) => void;
  onUpdateCourseName: (index: number, courseName: string) => void;
  onUpdateNumberOfCompetitors: (index: number, numberOfCompetitors: number) => void;
  onDeleteAssignment: (index: number) => void;
  onUpdateCourseRunners: () => void;
}

export function ClassAssignmentsTab({
  classAssignments,
  courses,
  onAddAssignment,
  onUpdateClassName,
  onUpdateCourseName,
  onUpdateNumberOfCompetitors,
  onDeleteAssignment,
  onUpdateCourseRunners,
}: ClassAssignmentsTabProps) {
  return (
    <div className="flex-1 p-6 min-h-0">
      <div className="max-w-4xl mx-auto flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <Button size="sm" className="gap-2" onClick={onAddAssignment}>
              <Plus className="h-4 w-4" />
              {"Add class assignment"}
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={onUpdateCourseRunners} disabled={classAssignments.length === 0}>
              <RefreshCw className="h-4 w-4" />
              {"Update course runners"}
            </Button>
          </div>
        </div>

        {classAssignments.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {"No class assignments yet. Add one to assign classes to courses."}
          </div>
        ) : (
          <div className="flex-1 overflow-auto rounded-md border border-border/60 bg-background shadow-sm min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium bg-muted/50">{"Class Name"}</th>
                  <th className="text-left px-3 py-2 font-medium bg-muted/50">{"Course"}</th>
                  <th className="text-right px-3 py-2 font-medium w-28 bg-muted/50">{"Runners"}</th>
                  <th className="text-right px-3 py-2 font-medium w-20 bg-muted/50">{"Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {classAssignments.map((assignment, index) => (
                  <tr key={index} className="border-t border-border/60">
                    <td className="px-3 py-2 align-middle">
                      <Input
                        value={assignment.className}
                        onChange={(e) => onUpdateClassName(index, e.target.value)}
                        placeholder="Enter class name"
                        className="h-8"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <Select
                        value={assignment.courseName}
                        onValueChange={(value) => onUpdateCourseName(index, value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select a course" />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.name}>
                              {course.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <Input
                        type="number"
                        min={0}
                        value={assignment.numberOfCompetitors ?? 0}
                        onChange={(e) => onUpdateNumberOfCompetitors(index, parseInt(e.target.value) || 0)}
                        className="h-8 w-20 text-right ml-auto"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          title="Delete assignment"
                          onClick={() => onDeleteAssignment(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                          <span className="sr-only">{"Delete"}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

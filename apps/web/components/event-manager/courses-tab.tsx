import { Plus, Copy, Trash2 } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import type { Course } from "@indoor-o-route-analysis/core";
import type { ClassCourseAssignment } from "@indoor-o-route-analysis/core";
import { DIFFICULTY_CATEGORIES } from "@indoor-o-route-analysis/core";

// Define CourseItem locally or import if available
type CourseItem = Course;

interface CoursesTabProps {
  selectedEventCourses: CourseItem[];
  classAssignments: ClassCourseAssignment[];
  addCourse: () => void;
  editingCourseId: string | null;
  setEditingCourseId: (value: string | null) => void;
  updateCourseName: (id: string, name: string) => void;
  updateCourseRunners: (id: string, runners: number) => void;
  updateCourseTargetDifficulty: (id: string, targetDifficulty: string | undefined) => void;
  duplicateCourse: (id: string) => void;
  deleteCourse: (id: string) => void;
}

export function CoursesTab({
  selectedEventCourses,
  classAssignments,
  addCourse,
  editingCourseId,
  setEditingCourseId,
  updateCourseName,
  updateCourseRunners,
  updateCourseTargetDifficulty,
  duplicateCourse,
  deleteCourse,
}: CoursesTabProps) {
  return (
    <div className="flex-1 p-6 min-h-0">
      <div className="max-w-4xl mx-auto flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <Button size="sm" className="gap-2" onClick={addCourse}>
              <Plus className="h-4 w-4" />
              {"Add course"}
            </Button>
          </div>
        </div>

        {selectedEventCourses.length === 0 ? (
          <div className="text-sm text-muted-foreground">{"No courses yet. Add one to get started."}</div>
        ) : (
          <div className="flex-1 overflow-auto rounded-md border border-border/60 bg-background shadow-sm min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium bg-muted/50">{"Course"}</th>
                  <th className="text-left px-3 py-2 font-medium bg-muted/50">{"Classes"}</th>
                  <th className="text-left px-3 py-2 font-medium w-36 bg-muted/50">{"Target Difficulty"}</th>
                  <th className="text-right px-3 py-2 font-medium w-24 bg-muted/50">{"Runners"}</th>
                  <th className="text-right px-3 py-2 font-medium w-28 bg-muted/50">{"Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {selectedEventCourses.map((course) => {
                  const isEditing = editingCourseId === course.id;
                  return (
                    <tr key={course.id} className="border-t border-border/60">
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <Input
                              value={course.name}
                              autoFocus
                              onChange={(e) => updateCourseName(course.id, e.target.value)}
                              onBlur={() => setEditingCourseId(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                }
                              }}
                              className="h-8"
                            />
                          ) : (
                            <button
                              className="text-left w-full truncate hover:text-foreground focus:outline-none"
                              onClick={() => setEditingCourseId(course.id)}
                              title="Click to edit name"
                            >
                              {course.name}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className="text-muted-foreground text-xs">
                          {classAssignments
                            .filter((a) => a.courseName === course.name)
                            .map((a) => a.className)
                            .join(", ") || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <Select
                          value={course.targetDifficulty ?? "_none"}
                          onValueChange={(value) =>
                            updateCourseTargetDifficulty(course.id, value === "_none" ? undefined : value)
                          }
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue placeholder="Not set" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Not set</SelectItem>
                            {DIFFICULTY_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.label} value={cat.label.toLowerCase()}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="inline-block w-3 h-3 rounded-sm border border-border"
                                    style={{ backgroundColor: cat.color }}
                                  />
                                  {cat.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 align-middle text-right">
                        <Input
                          type="number"
                          min={0}
                          value={course.numberOfCompetitors ?? 0}
                          onChange={(e) => updateCourseRunners(course.id, parseInt(e.target.value) || 0)}
                          className="h-8 w-20 text-right ml-auto"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            title="Duplicate course"
                            onClick={() => duplicateCourse(course.id)}
                          >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">{"Duplicate"}</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Delete course"
                            onClick={() => deleteCourse(course.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                            <span className="sr-only">{"Delete"}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

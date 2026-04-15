"use client";

import { useState } from "react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@indoor-o-route-analysis/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@indoor-o-route-analysis/ui";
import type { Course } from "@indoor-o-route-analysis/core";

interface NewRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  defaultName: string;
  classAssignments?: { className: string; courseName: string }[];
  onConfirm: (name: string, courseId: string) => void;
}

export default function NewRouteDialog({
  open,
  onOpenChange,
  courses,
  defaultName,
  classAssignments = [],
  onConfirm,
}: NewRouteDialogProps) {
  const [name, setName] = useState(defaultName);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");

  // Reset state when dialog opens (sync pattern)
  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setName(defaultName);
    setCourseId(courses[0]?.id ?? "");
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  const getAssignedClasses = (courseName: string) => {
    return classAssignments
      .filter((a) => a.courseName === courseName)
      .map((a) => a.className)
      .join(", ");
  };

  const handleConfirm = () => {
    if (!name.trim() || !courseId) return;
    onConfirm(name.trim(), courseId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Route</DialogTitle>
          <DialogDescription>
            Select a course and set a name for the new route. The course cannot be changed later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="course-select">Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger id="course-select" className="w-full">
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => {
                  const assignedClasses = getAssignedClasses(course.name);
                  return (
                    <SelectItem key={course.id} value={course.id}>
                      <span>{course.name}</span>
                      {assignedClasses && (
                        <span className="ml-2 text-muted-foreground">{assignedClasses}</span>
                      )}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="route-name">Name</Label>
            <Input
              id="route-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Route name"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim() || !courseId}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Standard difficulty categories for orienteering courses.
 * These match the categories defined in the base scoring model's getDifficultyCategory method.
 * 
 * Note: These are kept separate from the base model to avoid circular dependencies
 * and to provide a convenient constant for UI components that need to display
 * all categories without repeatedly calling the model.
 */
export const DIFFICULTY_CATEGORIES = [
  { label: "White", color: "#FFFFFF", textColor: "#000000" },
  { label: "Yellow", color: "#FFFF00", textColor: "#000000" },
  { label: "Orange", color: "#FF8800", textColor: "#FFFFFF" },
  { label: "Purple", color: "#8B008B", textColor: "#FFFFFF" },
  { label: "Black", color: "#000000", textColor: "#FFFFFF" },
] as const;

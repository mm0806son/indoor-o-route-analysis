# Guidelines for Claude

Always start response with "Indoor-o rocks!".

## Clarifications

- For major features, first write a brief design document before writing code. The design document should outline the overall architecture, main components, data flow, and any important algorithms or data structures that will be used. This helps ensure a clear plan before implementation and allows for feedback on the design before coding begins.

## General
- Follow best practices for security, performance, and maintainability in the code.
- Use descriptive variable and function names to improve readability.
- Follow a consistent coding style and formatting throughout the codebase.

## Important
- Do not add tracking, analytics, or any form of user data collection in the code.
- The web app shall run entirely client-side with no server-side components, and all data must be stored locally in the browser or on the user's device.
- The CLI tools shall also run entirely locally with no external data transmission.

## Maintainability
- Isolate indoor orienteering-specific logic in dedicated modules to allow for future reuse in other tools.
- Avoid duplication by creating shared utility functions for common operations, such as route analysis, rendering courses, calculating difficulties, and managing state.
- Do not keep copies of the same data in multiple places; instead, use references and shared state management to ensure consistency.

## Testing
- Write unit tests for all major functions and components, especially the route analysis, route difficulty calculations and data persistence logic.
- Use Vitest for testing, and ensure tests can be run in watch mode for development and in a single run for CI.
- Include tests for edge cases
- Include tests for the JSON and IOF XML import/export functionality using real example files.
- Include regression tests to ensure that changes do not break existing functionality.
- Include end-to-end tests for critical user flows.

## User Interface

- Focus on a clean, functional, expert UI. Keep it compact and information-dense.
- Use screen estate for displaying the map and analysis results, with minimal chrome. 
- Toolbars and side panels have fixed placement, and the main map area should be as large as possible. 
- The toolbars shall be compact with icon-only buttons. Always provide tooltips. Use Lucide React icons.
- Provide shortcut keys for all major actions. 
- Explain all features and shortcut keys in info dialogs.
- Use a dark theme with purple as a selection color.

### Documentation
- Keep all domain specificdocumentation in the docs/ folder.
- Keep a project README overview in the root folder.
- Always keep the documentation up to date with the current state of the code. Whenever functionality is added or changed, consider if changes are needed in the docs/ folder. 
- Always update the info dialogs and tooltips to reflect the current shortcut keys and features, so they are always accurate.
- Always update the info dialogs with changes in functionality.

### Rendering 

- Render the map/course/route elements on a <canvas> element with user-select: none. Do NOT use contenteditable or CSS ::selection on the canvas.

- Re-use rendering logic by keeping code in shared functions. Separate logic for 2D map rendering (Canvas) and 3D model rendering (Three.js). Always use the shared rendering functions when rendering courses, controls, routes, graph nodes/edges, and polygons. Also use common functions to render highlighted/selected elements, using consistent outline, colors, z-indexing, and hover effects.

### Mouse Interactions

- All mouse interactions (draw, select, move) must use JS event listeners with e.preventDefault() on mousedown/mousemove — browser-native text highlighting must never appear while drawing or dragging.

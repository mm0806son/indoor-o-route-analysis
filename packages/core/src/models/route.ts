// Custom route model for route builder

/**
 * Represents a node in a route leg path
 */
export interface RouteLegNode {
  /** Node ID */
  nodeId: string;
  /** Optional time at this node (in seconds from leg start) */
  legTime?: number;
}

/**
 * Represents a custom route leg with intermediate nodes
 */
export interface RouteLeg {
  /** Control ID this leg starts from */
  fromControlId: string;
  /** Control ID this leg ends at */
  toControlId: string;
  /** Sequence of nodes that form the path (includes from/to controls) */
  path: RouteLegNode[];
}

/**
 * Represents a complete custom route for a course
 */
export interface CustomRoute {
  /** Unique identifier for the route */
  id: string;
  /** Human-readable name for the route */
  name: string;
  /** Course ID this route belongs to */
  courseId: string;
  /** List of legs with their custom paths */
  legs: RouteLeg[];
  /** When this route was created/modified */
  timestamp?: string;
}

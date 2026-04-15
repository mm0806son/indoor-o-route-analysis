# Coordinate Systems

This document explains the different coordinate systems used in the application and how transformations are performed between them.

The Typescript interfaces for these coordinates are defined in `packages/core/src/models/coordinates.ts`.

## Map coordinates

This is the `MapPosition` element type in the IOF XML spec.
Depends on the top-left and bottom-right corner coordinates, defined in the event data.

## Screen Coordinates

The coordinates used when rendering on the HTML canvas.
The unit is pixels, and the origin is the top-left of the canvas. 

## World Coordinates

For 3D visualization and route analysis (length calculation), we use a real-world coordinate system in meters.
X and Y are positive to the right and down (to match the map image), and Z is elevation (height). The origin of X and Y is defined by the polygons of the event/map.

## Geo Coordinates (latitude and longitude)

For GPX export we convert to approximated geographic coordinates (latitude and longitude). This is done using a simple equirectangular approximation based on the map's georeference point.

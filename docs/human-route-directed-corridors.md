# Directed corridors in human route planning

Unlabeled one-way corridors extend the stairs visible from a search position without merging regions that cannot be traversed both ways. Forward search follows outgoing corridor connections; backward search follows incoming connections. The two stair chains may meet through a directed corridor, with final stitching validating the complete walking direction.

Corridor segments remain in the route and candidate paths but do not add stair labels or thinking-effort counts. Regression tests cover corridors before, after and between stairs, cycles, multiple entrances, backward search and prohibited reverse travel. All fixtures are synthetic and run in the normal core Vitest suite.

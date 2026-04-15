import { describe, it, expect } from 'vitest';
import { ScoringModelRegistry } from './registry';
import { oneRouteContexts } from './test-fixtures';

/**
 * Shared test: every scoring model must return difficulty 0 for one-route
 * graphs (linear corridors with no branching and no level changes).
 *
 * When new models are registered in the ScoringModelRegistry, they
 * automatically get covered by these tests.
 */
const allModels = ScoringModelRegistry.getAllModels();

for (const model of allModels) {
  describe(`One-route graphs: ${model.name} (${model.getFullId()})`, () => {
    for (const [name, context] of Object.entries(oneRouteContexts)) {
      it(`should score 0 for ${name}`, () => {
        const difficulty = model.calculateDifficulty(context);
        expect(difficulty).toBe(0);
      });
    }
  });
}

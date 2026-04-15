import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseEventFromJSON } from "./json-io";

describe('TrainingDataIO', () => {
  it('should export correct training data for Stockholm Indoor Cup E1', async () => {
    // Load the example file
    const filePath = path.join(process.cwd(), 'public/examples/2025-02-01 Stockholm Indoor Cup E1.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const _eventData = parseEventFromJSON(fileContent);

    // Run generateEventExport on the first course in the file

    // Verify number of controls, floors, stairs, and valid routes
   
  }, 20000); // Increased timeout for route analysis
});

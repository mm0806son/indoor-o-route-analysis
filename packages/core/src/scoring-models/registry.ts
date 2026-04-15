import { ScoringModel } from "./base";
import { AlphaScoringModel } from "./alpha-model";

/**
 * Registry of all available scoring models
 */
export class ScoringModelRegistry {
  private static models = new Map<string, ScoringModel>();
  private static defaultModelId = "alpha@0.1";

  static {
    // Register all available models
    this.register(new AlphaScoringModel());
  }

  /**
   * Register a scoring model
   */
  static register(model: ScoringModel): void {
    this.models.set(model.getFullId(), model);
  }

  /**
   * Get a scoring model by its full ID (id@version)
   */
  static getModel(fullId: string): ScoringModel | undefined {
    return this.models.get(fullId);
  }

  /**
   * Get the default scoring model
   */
  static getDefaultModel(): ScoringModel {
    const model = this.models.get(this.defaultModelId);
    if (!model) {
      throw new Error(`Default scoring model ${this.defaultModelId} not found`);
    }
    return model;
  }

  /**
   * Get all available scoring models
   */
  static getAllModels(): ScoringModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Get model or fall back to default
   */
  static getModelOrDefault(fullId: string | undefined): ScoringModel {
    if (!fullId) return this.getDefaultModel();
    return this.getModel(fullId) ?? this.getDefaultModel();
  }
}

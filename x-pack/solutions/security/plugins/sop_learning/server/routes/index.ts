import { IRouter, Logger, KibanaRequest } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { WorkflowsManagementApi } from '@kbn/workflows-management-plugin/server';
import { registerSessionsRoutes } from './sessions';
import { registerRecordingRoutes } from './recording';
import { registerSynthesizeRoutes } from './synthesize';
import { registerSopRoutes } from './sops';
import { registerDeployRoutes } from './deploy';
import { registerGapRoutes } from './gaps';
import { registerPreviewRoutes } from './preview';
import { registerMediaRoutes } from './media';
import { registerEmbeddingsRoutes } from './embeddings';
import { registerOverviewRoutes } from './overview';

export interface RouteDeps {
  getInferenceStart: () => Promise<InferenceServerStart>;
  /** Resolves the OPTIONAL Agent Builder start contract (undefined if disabled). */
  getAgentBuilderStart: () => Promise<AgentBuilderPluginStart | undefined>;
  /**
   * Resolves the OPTIONAL Workflows Management API (undefined if the plugin is
   * disabled). Captured from the workflowsManagement SETUP contract; used by the
   * NL workflow-authoring capability for connector/validation lookups.
   */
  getWorkflowsManagementApi: () => WorkflowsManagementApi | undefined;
  /** Resolves the current space id for the request (defaults to the default space). */
  getSpaceId: (request: KibanaRequest) => string;
}

export function registerRoutes(router: IRouter, logger: Logger, deps: RouteDeps) {
  registerSessionsRoutes(router, logger);
  registerRecordingRoutes(router, logger);
  registerSynthesizeRoutes(router, logger, deps);
  registerSopRoutes(router, logger, deps);
  registerDeployRoutes(router, logger, deps);
  registerGapRoutes(router, logger, deps);
  registerPreviewRoutes(router, logger, deps);
  registerMediaRoutes(router, logger);
  registerEmbeddingsRoutes(router, logger);
  registerOverviewRoutes(router, logger);
}

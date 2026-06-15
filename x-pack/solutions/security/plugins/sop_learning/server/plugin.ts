import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
  KibanaRequest,
} from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type {
  WorkflowsServerPluginSetup,
  WorkflowsManagementApi,
} from '@kbn/workflows-management-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { registerRoutes } from './routes';
import { registerSopLearningFeature } from './features';

export interface SopLearningPluginSetup {}
export interface SopLearningPluginStart {}

export interface SopLearningSetupDeps {
  features: FeaturesPluginSetup;
  inference?: unknown;
  /**
   * Workflows Management is an OPTIONAL dependency. Its SETUP contract exposes
   * the `management` API used by the NL workflow-authoring capability for
   * connector/validation lookups. Captured here at setup and read lazily by the
   * synthesize route.
   */
  workflowsManagement?: WorkflowsServerPluginSetup;
}

export interface SopLearningStartDeps {
  inference: InferenceServerStart;
  /**
   * Agent Builder is an OPTIONAL dependency. When present, synthesis is grounded
   * in the real Agent Builder agent (tool-aware reasoning), and the Elastic
   * Workflow is authored by the real NL workflow-authoring capability. When
   * absent (plugin disabled), synthesis transparently falls back to a direct LLM
   * call and the workflow falls back to the local YAML builder.
   */
  agentBuilder?: AgentBuilderPluginStart;
  /** OPTIONAL Spaces plugin, used to resolve the current space id. */
  spaces?: SpacesPluginStart;
}

export class SopLearningPlugin
  implements
    Plugin<
      SopLearningPluginSetup,
      SopLearningPluginStart,
      SopLearningSetupDeps,
      SopLearningStartDeps
    >
{
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(
    core: CoreSetup<SopLearningStartDeps>,
    deps: SopLearningSetupDeps
  ): SopLearningPluginSetup {
    this.logger.info('SOP Learning plugin: setup');

    // Register the `sopLearning` API privilege so the route-level
    // `requiredPrivileges: ['sopLearning']` guards are actually honored
    // (otherwise every route returns 400 "not available with the current
    // configuration").
    registerSopLearningFeature(deps.features);

    const router = core.http.createRouter();

    // Lazily resolve the inference plugin's start contract for routes that need
    // to call an LLM connector. We use getStartServices() so the inference
    // client is available by the time any request handler runs.
    const getInferenceStart = async (): Promise<InferenceServerStart> => {
      const [, startDeps] = await core.getStartServices();
      return startDeps.inference;
    };

    // Lazily resolve the OPTIONAL Agent Builder start contract. Returns
    // undefined when the plugin is disabled so synthesis can fall back to a
    // direct LLM call.
    const getAgentBuilderStart = async (): Promise<AgentBuilderPluginStart | undefined> => {
      const [, startDeps] = await core.getStartServices();
      return startDeps.agentBuilder;
    };

    // Capture the OPTIONAL Workflows Management API from the SETUP contract.
    // Its `management` API is what the NL workflow-authoring capability
    // (`generateWorkflow`) uses for connector/validation lookups. Undefined when
    // the plugin is disabled so workflow authoring can fall back to the local
    // YAML builder.
    const workflowsManagementApi: WorkflowsManagementApi | undefined =
      deps.workflowsManagement?.management;
    const getWorkflowsManagementApi = (): WorkflowsManagementApi | undefined =>
      workflowsManagementApi;

    // Resolve the current space id for a request. Spaces is optional; default
    // space when absent. Cached lazily because start services aren't ready yet.
    let spacesStart: SpacesPluginStart | undefined;
    let spacesResolved = false;
    core.getStartServices().then(([, startDeps]) => {
      spacesStart = startDeps.spaces;
      spacesResolved = true;
    });
    const getSpaceId = (request: KibanaRequest): string => {
      if (!spacesResolved) return DEFAULT_SPACE_ID;
      return spacesStart?.spacesService?.getSpaceId(request) ?? DEFAULT_SPACE_ID;
    };

    registerRoutes(router, this.logger, {
      getInferenceStart,
      getAgentBuilderStart,
      getWorkflowsManagementApi,
      getSpaceId,
    });

    return {};
  }

  public start(core: CoreStart): SopLearningPluginStart {
    this.logger.info('SOP Learning plugin: started');
    return {};
  }

  public stop() {}
}

import { IRouter, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { API_BASE } from '../../common';
import type { RouteDeps } from '.';

export function registerDeployRoutes(router: IRouter, logger: Logger, deps: RouteDeps) {
  // Deploy as Agent Builder Skill
  router.post(
    {
      path: `${API_BASE}/deploy/skill`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          id: schema.string(),
          name: schema.string(),
          description: schema.string(),
          content: schema.string(),
          tool_ids: schema.maybe(schema.arrayOf(schema.string())),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const agentBuilder = await deps.getAgentBuilderStart();
        if (!agentBuilder) {
          return response.ok({
            body: {
              deployed: false,
              pending: true,
              message:
                'Agent Builder plugin is not available in this environment. ' +
                'Skill spec saved. Deploy manually via POST /api/agent_builder/skills',
              spec: request.body,
            },
          });
        }

        const toolIds = request.body.tool_ids ?? [
          'security.alerts',
          'security.get_entity',
          'platform.core.execute_esql',
          'platform.core.cases',
        ];

        await agentBuilder.skills.register({
          id: request.body.id,
          name: request.body.id,
          basePath: 'skills/security/alerts',
          description: request.body.description,
          content: request.body.content,
          getRegistryTools: () => toolIds,
        });

        logger.info(`Skill deployed: ${request.body.id}`);
        return response.ok({ body: { deployed: true, skill_id: request.body.id } });
      } catch (error: any) {
        logger.error(`Skill deploy failed: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );

  // Deploy as Elastic Workflow
  router.post(
    {
      path: `${API_BASE}/deploy/workflow`,
      security: { authz: { requiredPrivileges: ['sopLearning'] } },
      validate: {
        body: schema.object({
          id: schema.maybe(schema.string()),
          yaml: schema.string(),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const workflowsApi = deps.getWorkflowsManagementApi();
        if (!workflowsApi) {
          return response.ok({
            body: {
              deployed: false,
              pending: true,
              message:
                'Workflows Management plugin is not available in this environment. ' +
                'Workflow YAML saved. Deploy manually via POST /api/workflows/workflow',
              yaml: request.body.yaml,
            },
          });
        }

        const spaceId = deps.getSpaceId(request);
        const result = await workflowsApi.createWorkflow(
          { yaml: request.body.yaml },
          spaceId,
          request
        );

        logger.info(`Workflow deployed: ${result.id}`);
        return response.ok({ body: { deployed: true, result } });
      } catch (error: any) {
        logger.error(`Workflow deploy failed: ${error.message}`);
        return response.customError({
          statusCode: 500,
          body: { message: error.message },
        });
      }
    }
  );
}

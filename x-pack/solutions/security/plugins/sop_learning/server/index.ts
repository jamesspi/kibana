import { PluginInitializerContext } from '@kbn/core/server';
import { SopLearningPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new SopLearningPlugin(initializerContext);
}

export type { SopLearningPluginSetup, SopLearningPluginStart } from './plugin';

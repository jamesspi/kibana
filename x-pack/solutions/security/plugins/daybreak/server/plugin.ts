/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '@kbn/core/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import { registerRoutes } from './routes';
import { registerDaybreakFeature } from './features';

export interface DaybreakPluginSetup {}
export interface DaybreakPluginStart {}

export interface DaybreakSetupDeps {
  features: FeaturesPluginSetup;
}

export class DaybreakPlugin
  implements Plugin<DaybreakPluginSetup, DaybreakPluginStart, DaybreakSetupDeps>
{
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup, deps: DaybreakSetupDeps): DaybreakPluginSetup {
    this.logger.info('Daybreak plugin: setup');

    registerDaybreakFeature(deps.features);

    const router = core.http.createRouter();
    registerRoutes(router, this.logger);

    return {};
  }

  public start(_core: CoreStart): DaybreakPluginStart {
    this.logger.info('Daybreak plugin: started');
    return {};
  }

  public stop() {}
}

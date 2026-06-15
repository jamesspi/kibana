/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppMountParameters, CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import { PLUGIN_ID, PLUGIN_NAME } from '../common';

export class DaybreakPlugin implements Plugin {
  public setup(core: CoreSetup) {
    core.application.register({
      id: PLUGIN_ID,
      title: PLUGIN_NAME,
      category: DEFAULT_APP_CATEGORIES.security,
      euiIconType: 'securityAnalyticsApp',
      order: 100,
      visibleIn: ['globalSearch', 'classicSideNav', 'projectSideNav', 'home', 'kibanaOverview'],
      async mount(params: AppMountParameters) {
        const { renderApp } = await import('./application');
        const [coreStart] = await core.getStartServices();
        return renderApp(coreStart, params);
      },
    });
  }

  public start(_core: CoreStart) {
    return {};
  }

  public stop() {}
}

export function plugin() {
  return new DaybreakPlugin();
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import { PLUGIN_ID } from '../common';

export const registerDaybreakFeature = (features: FeaturesPluginSetup) => {
  features.registerKibanaFeature({
    id: PLUGIN_ID,
    name: i18n.translate('xpack.daybreak.feature.name', {
      defaultMessage: 'Daybreak',
    }),
    order: 8900,
    category: DEFAULT_APP_CATEGORIES.security,
    app: [PLUGIN_ID],
    catalogue: [PLUGIN_ID],
    privileges: {
      all: {
        app: [PLUGIN_ID],
        catalogue: [PLUGIN_ID],
        api: [PLUGIN_ID],
        savedObject: { all: [], read: [] },
        ui: ['all'],
      },
      read: {
        app: [PLUGIN_ID],
        catalogue: [PLUGIN_ID],
        api: [PLUGIN_ID],
        savedObject: { all: [], read: [] },
        ui: ['read'],
      },
    },
  });
};

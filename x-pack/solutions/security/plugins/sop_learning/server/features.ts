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

/**
 * Every SOP Learning server route is guarded by
 * `security: { authz: { requiredPrivileges: ['sopLearning'] } }`. In Kibana's
 * route authorization model that privilege string is only honored if it is
 * registered as a feature API privilege — otherwise the authorization layer
 * treats the route as unavailable and rejects every request with
 * `400 "uri [...] exists but is not available with the current configuration"`.
 *
 * Registering the feature here makes the `sopLearning` API privilege real and
 * grantable. We expose it under BOTH `all` and `read` so any role that has
 * either privilege on this feature (including the reserved `viewer`/`editor`
 * roles and `superuser`) can use the recording/synthesis/deploy APIs.
 */
export const registerSopLearningFeature = (features: FeaturesPluginSetup) => {
  features.registerKibanaFeature({
    id: PLUGIN_ID,
    name: i18n.translate('xpack.sopLearning.feature.name', {
      defaultMessage: 'Protégé',
    }),
    order: 9000,
    category: DEFAULT_APP_CATEGORIES.security,
    app: [PLUGIN_ID],
    catalogue: [PLUGIN_ID],
    privileges: {
      all: {
        app: [PLUGIN_ID],
        catalogue: [PLUGIN_ID],
        // Grants the `sopLearning` API privilege referenced by every route's
        // `requiredPrivileges`.
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

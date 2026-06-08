import React from 'react';
import ReactDOM from 'react-dom';
import { AppMountParameters, CoreSetup, CoreStart, Plugin, DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';
import { PLUGIN_ID, PLUGIN_NAME } from '../common';
import { SopLearningService } from './services/api';

export interface SopLearningPluginSetupDeps {}
export interface SopLearningPluginStartDeps {
  navigation: NavigationPublicPluginStart;
}

export class SopLearningPlugin implements Plugin {
  public setup(core: CoreSetup) {
    core.application.register({
      id: PLUGIN_ID,
      title: PLUGIN_NAME,
      // Use the shared Security solution category so the app groups under the
      // "Security" section of the classic side navigation. The default
      // `visibleIn` already includes the side nav surfaces, but we set it
      // explicitly so the link always renders a clickable nav item.
      category: DEFAULT_APP_CATEGORIES.security,
      euiIconType: 'videoPlayer',
      order: 9000,
      visibleIn: ['globalSearch', 'classicSideNav', 'projectSideNav', 'home', 'kibanaOverview'],
      async mount(params: AppMountParameters) {
        const { renderApp } = await import('./application');
        const [coreStart, depsStart] = await core.getStartServices();
        return renderApp(coreStart, depsStart as SopLearningPluginStartDeps, params);
      },
    });
  }

  public start(core: CoreStart) {
    // Persistent "Record SOP" widget mounted into the Kibana chrome header so
    // recording continues across page navigations (it lives in chrome, not the
    // app bundle).
    const service = new SopLearningService(core.http);
    core.chrome.navControls.registerRight({
      order: 1000,
      mount: (element) => {
        let unmounted = false;
        import('./components/RecordingWidget').then(({ RecordingWidget }) => {
          if (unmounted) return;
          ReactDOM.render(
            core.rendering.addContext(React.createElement(RecordingWidget, { service })),
            element
          );
        });
        return () => {
          unmounted = true;
          ReactDOM.unmountComponentAtNode(element);
        };
      },
    });
  }

  public stop() {}
}

export function plugin() {
  return new SopLearningPlugin();
}

import React from 'react';
import ReactDOM from 'react-dom';
import { AppMountParameters, CoreStart } from '@kbn/core/public';
import { SopLearningPluginStartDeps } from './plugin';
import { SopLearningApp } from './components/App';

export const renderApp = (
  core: CoreStart,
  deps: SopLearningPluginStartDeps,
  { element, history }: AppMountParameters
) => {
  ReactDOM.render(
    core.rendering.addContext(
      <SopLearningApp core={core} navigation={deps.navigation} history={history} />
    ),
    element
  );

  return () => ReactDOM.unmountComponentAtNode(element);
};

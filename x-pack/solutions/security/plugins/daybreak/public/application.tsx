/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { DaybreakApp } from './components/app';

export const renderApp = (core: CoreStart, { element }: AppMountParameters) => {
  // Start in Daybreak mode (chrome hidden) — user can toggle back
  core.chrome.setIsVisible(false);

  // Dramatic slow transition overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: #080a10;
    z-index: 99999;
    opacity: 1;
    transition: opacity 1.8s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  `;

  // Teal glow that pulses once during transition
  const glow = document.createElement('div');
  glow.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    width: 600px;
    height: 600px;
    transform: translate(-50%, -50%) scale(0.3);
    border-radius: 50%;
    background: radial-gradient(circle, rgba(72, 239, 207, 0.15) 0%, transparent 70%);
    z-index: 100000;
    opacity: 0;
    transition: opacity 0.8s ease, transform 2s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(glow);

  // Phase 1: Glow appears and expands
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      glow.style.opacity = '1';
      glow.style.transform = 'translate(-50%, -50%) scale(2.5)';

      // Phase 2: After a beat, fade everything away
      setTimeout(() => {
        overlay.style.opacity = '0';
        glow.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          glow.remove();
        }, 2000);
      }, 600);
    });
  });

  ReactDOM.render(core.rendering.addContext(<DaybreakApp core={core} />), element);

  return () => {
    core.chrome.setIsVisible(true);
    ReactDOM.unmountComponentAtNode(element);
  };
};

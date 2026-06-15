/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import type { WatchType } from '../../../common';
import { WATCH_CONFIGS } from '../../../common';

interface Props {
  watchType: WatchType;
  size?: 'small' | 'default';
}

export const WatchBadge: React.FC<Props> = ({ watchType, size = 'default' }) => {
  const config = WATCH_CONFIGS[watchType];

  return (
    <span
      css={css`
        font-size: ${size === 'small' ? '11px' : '12px'};
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: ${size === 'small' ? '2px 8px' : '4px 12px'};
        border-radius: 5px;
        background: ${config.color}18;
        color: ${config.color};
        border: 1px solid ${config.color}40;
        white-space: nowrap;
      `}
    >
      {config.name}
    </span>
  );
};

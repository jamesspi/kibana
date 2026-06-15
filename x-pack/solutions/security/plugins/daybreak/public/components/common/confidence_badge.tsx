/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';

interface Props {
  confidence: number;
  color?: string;
}

export const ConfidenceBadge: React.FC<Props> = ({ confidence, color = '#48EFCF' }) => {
  return (
    <div css={css`display: flex; align-items: center; gap: 8px;`}>
      <span
        css={css`
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
          letter-spacing: 0.04em;
        `}
      >
        Confidence
      </span>
      <span
        css={css`
          font-size: 16px;
          font-weight: 800;
          color: ${color};
          padding: 4px 14px;
          background: ${color}14;
          border: 1.5px solid ${color}40;
          border-radius: 6px;
          font-family: 'JetBrains Mono', 'SF Mono', monospace;
        `}
      >
        {confidence}%
      </span>
    </div>
  );
};

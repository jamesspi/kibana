/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import type { AutonomyLevel } from '../../../common';

interface Props {
  level: AutonomyLevel;
  color: string;
}

const LEVELS: Array<{ id: AutonomyLevel; label: string; position: number }> = [
  { id: 'human_in_loop', label: 'Human-in-loop', position: 15 },
  { id: 'human_on_loop', label: 'Human-on-loop', position: 50 },
  { id: 'supervised_auto', label: 'Supervised auto', position: 85 },
];

export const AutonomyDial: React.FC<Props> = ({ level, color }) => {
  const activeLevel = LEVELS.find((l) => l.id === level) || LEVELS[0];

  return (
    <div css={css`width: 100%;`}>
      {/* Track */}
      <div
        css={css`
          height: 6px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 3px;
          position: relative;
          margin-bottom: 8px;
        `}
      >
        {/* Fill */}
        <div
          css={css`
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            width: ${activeLevel.position}%;
            background: linear-gradient(90deg, ${color}88, ${color});
            border-radius: 3px;
            transition: width 0.3s ease;
          `}
        />
        {/* Thumb */}
        <div
          css={css`
            position: absolute;
            top: 50%;
            left: ${activeLevel.position}%;
            transform: translate(-50%, -50%);
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: ${color};
            border: 2px solid #0a0e1a;
            box-shadow: 0 0 8px ${color}60;
            transition: left 0.3s ease;
          `}
        />
      </div>

      {/* Labels */}
      <div
        css={css`
          display: flex;
          justify-content: space-between;
        `}
      >
        {LEVELS.map((l) => (
          <span
            key={l.id}
            css={css`
              font-size: 10px;
              color: ${l.id === level ? color : 'rgba(255, 255, 255, 0.3)'};
              font-weight: ${l.id === level ? 600 : 400};
              transition: color 0.2s ease;
            `}
          >
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
};

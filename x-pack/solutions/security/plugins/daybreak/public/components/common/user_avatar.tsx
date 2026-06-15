/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { css } from '@emotion/react';

interface UserAvatarProps {
  name: string;
  size?: number;
}

const getSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const getInitials = (name: string): string =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const AVATAR_COLORS: Record<string, string> = {
  'James Spiteri': '#6AADFF',
  'Sarah Chen': '#48EFCF',
  'Marcus Rivera': '#F04E98',
  'Dima Kozlov': '#FEC514',
};

const getAvatarColor = (name: string): string =>
  AVATAR_COLORS[name] ?? 'rgba(255, 255, 255, 0.3)';

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, size = 32 }) => {
  const [imgError, setImgError] = useState(false);
  const slug = getSlug(name);
  const initials = getInitials(name);
  const color = getAvatarColor(name);

  if (imgError) {
    return (
      <div
        css={css`
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${color}20;
          border: 1px solid ${color}40;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        `}
      >
        <span
          css={css`
            font-size: ${size * 0.38}px;
            font-weight: 700;
            color: ${color};
            line-height: 1;
          `}
        >
          {initials}
        </span>
      </div>
    );
  }

  return (
    <img
      src={`https://i.pravatar.cc/${size}?u=${slug}`}
      alt={name}
      onError={() => setImgError(true)}
      css={css`
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.08);
      `}
    />
  );
};

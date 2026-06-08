/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiLoadingChart,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiHorizontalRule,
  EuiBadge,
  EuiToolTip,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import type { SopLearningService } from '../services/api';
import type { OverviewMetrics } from '../../common';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const DS_ICONS: Record<string, string> = {
  videoPlayer:
    '<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Zm4.3 1.9a.5.5 0 0 0-.8.4v4.4a.5.5 0 0 0 .8.4l3.4-2.2a.5.5 0 0 0 0-.84L6.3 5.4Z"/>',
  dot: '<circle cx="8" cy="8" r="4"/>',
  play: '<path d="M5 3.9a.6.6 0 0 1 .9-.5l6.2 3.6a.6.6 0 0 1 0 1.04L5.9 11.6a.6.6 0 0 1-.9-.52V3.9Z"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1.2"/>',
  image:
    '<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Zm1 7.4 2.6-2.6a.5.5 0 0 1 .7 0L9 12h3.5a.5.5 0 0 0 .5-.5V8l-1.6-1.6a.5.5 0 0 0-.7 0L7 10.1 5.4 8.5a.5.5 0 0 0-.7 0L3 10.2v.7ZM6 6a1.2 1.2 0 1 0 0-2.4A1.2 1.2 0 0 0 6 6Z"/>',
  quote:
    '<path d="M3 4.5C3 3.7 3.7 3 4.5 3H6v3H4v1.5C4 9 5 10 6 10v1c-1.7 0-3-1.6-3-3.5v-3Zm6 0C9 3.7 9.7 3 10.5 3H12v3h-2v1.5C10 9 11 10 12 10v1c-1.7 0-3-1.6-3-3.5v-3Z"/>',
  sparkles:
    '<path d="M8 1.5 9.1 5 12.5 6 9.1 7 8 10.5 6.9 7 3.5 6 6.9 5 8 1.5Zm4.5 6 .6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Zm-9 2 .5 1.4 1.4.5-1.4.5L3.5 14 3 12.6l-1.4-.5 1.4-.5.5-1.4Z"/>',
  bolt: '<path d="M9 1.5 4 8.6h3.2L6.4 14.5 11.6 7H8.3L9 1.5Z"/>',
  compute:
    '<path d="M5 1.5h6a.5.5 0 0 1 .5.5v3.5h2a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5v-6a.5.5 0 0 1 .5-.5h2V2a.5.5 0 0 1 .5-.5Zm.5 1v8.5h5V2.5h-5ZM4.5 6.5h-1.5v5h1.5v-5Zm7 0v5h1.5v-5h-1.5Z"/>',
  branch:
    '<path d="M5 3a1.5 1.5 0 1 0-2 1.41V11.6a1.5 1.5 0 1 0 1 0V8.9c.6.4 1.3.6 2 .6h1A2.5 2.5 0 0 0 9.5 7V5.4a1.5 1.5 0 1 0-1 0V7A1.5 1.5 0 0 1 7 8.5H6c-.7 0-1.4-.3-2-.8V4.4A1.5 1.5 0 0 0 5 3Z"/>',
  push: '<path d="M7.6 1.7a.6.6 0 0 1 .8 0l3.5 3.2a.5.5 0 0 1-.34.87H9.5V9a.5.5 0 0 1-.5.5H7A.5.5 0 0 1 6.5 9V5.74H4.44a.5.5 0 0 1-.34-.87L7.6 1.7ZM3 11.5h10a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V12a.5.5 0 0 1 .5-.5Z"/>',
  stats:
    '<path d="M2 13V3a.5.5 0 0 1 1 0v9.5h11a.5.5 0 0 1 0 1H2.5A.5.5 0 0 1 2 13Zm3-1V8a.5.5 0 0 1 1 0v4H5Zm3 0V5a.5.5 0 0 1 1 0v7H8Zm3 0V6.5a.5.5 0 0 1 1 0V12h-1Z"/>',
  visGauge:
    '<path d="M8 3a5 5 0 0 0-4.33 7.5.5.5 0 0 0 .43.25h7.8a.5.5 0 0 0 .43-.25A5 5 0 0 0 8 3Zm0 1.5a3.5 3.5 0 0 1 3 5.25H8.9a1 1 0 1 0-1.45-1.2L5.3 6.7a.5.5 0 0 0-.6.8l2.06 1.6A1 1 0 0 0 8 9.75h2.96A3.5 3.5 0 0 1 8 4.5Z"/>',
  visPie:
    '<path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5.5.5 0 0 0-.5-.5H8.5V2a.5.5 0 0 0-.5-.5Zm-.5 1.04V8a.5.5 0 0 0 .5.5h5.46A5.5 5.5 0 1 1 7.5 2.54Z"/>',
  storage:
    '<path d="M3 3.5C3 2.4 5.2 1.5 8 1.5s5 .9 5 2v9c0 1.1-2.2 2-5 2s-5-.9-5-2v-9Zm1 0c0 .5 1.6 1.2 4 1.2s4-.7 4-1.2S10.4 2.5 8 2.5 4 3 4 3.5Zm8 2.1c-1 .5-2.5.8-4 .8s-3-.3-4-.8V8c0 .5 1.6 1.2 4 1.2S12 8.5 12 8V5.6Zm0 3.5c-1 .5-2.5.8-4 .8s-3-.3-4-.8v2.4c0 .5 1.6 1.2 4 1.2s4-.7 4-1.2V9.1Z"/>',
  clickLeft:
    '<path d="M6.5 2a.5.5 0 0 1 .5.5V4h-1V2.5a.5.5 0 0 1 .5-.5ZM3.6 3.6a.5.5 0 0 1 .7 0l1 1-.7.7-1-1a.5.5 0 0 1 0-.7ZM2 6.5a.5.5 0 0 1 .5-.5H4v1H2.5a.5.5 0 0 1-.5-.5Zm5.3.1 6 2.3a.5.5 0 0 1 .03.92l-2.4 1.06 1.8 1.8a.5.5 0 0 1 0 .7l-.7.7a.5.5 0 0 1-.7 0l-1.8-1.8-1.06 2.4a.5.5 0 0 1-.92-.03l-2.3-6a.5.5 0 0 1 .65-.65Z"/>',
  refresh:
    '<path d="M8 3a5 5 0 1 0 4.6 3.05.5.5 0 1 0-.92.4A4 4 0 1 1 8 4c.9 0 1.74.3 2.4.8L9 6.2a.5.5 0 0 0 .35.85H13a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.85-.35l-1.3 1.3A5 5 0 0 0 8 3Z"/>',
  search:
    '<path d="M7 2.5a4.5 4.5 0 0 1 3.6 7.2l3.1 3.1a.6.6 0 0 1-.85.85l-3.1-3.1A4.5 4.5 0 1 1 7 2.5Zm0 1a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/>',
  boxesVertical:
    '<path d="M8 2.5a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm0 4.1a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm0 4.1a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Z"/>',
  apps: '<path d="M3 3h3v3H3V3Zm3.5-.5h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5Zm3.5.5h3v3h-3V3Zm3.5-.5h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5ZM3 10h3v3H3v-3Zm3.5-.5h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5Zm3.5.5h3v3h-3v-3Zm3.5-.5h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5Z"/>',
  arrowDown:
    '<path d="M8 11.2 3.9 7.1a.6.6 0 0 1 .85-.85L8 9.5l3.25-3.25a.6.6 0 0 1 .85.85L8 11.2Z"/>',
  arrowRight:
    '<path d="M9.5 8 5.4 3.9a.6.6 0 0 1 .85-.85L11 7.8a.6.6 0 0 1 0 .4L6.25 12.95a.6.6 0 0 1-.85-.85L9.5 8Z"/>',
  cross:
    '<path d="m8 7.1 3.2-3.2a.6.6 0 0 1 .9.85L8.9 8l3.2 3.2a.6.6 0 0 1-.85.9L8 8.9l-3.2 3.2a.6.6 0 0 1-.9-.85L7.1 8 3.9 4.8a.6.6 0 0 1 .85-.9L8 7.1Z"/>',
  plus: '<path d="M7.4 7.4V3.5a.6.6 0 0 1 1.2 0v3.9h3.9a.6.6 0 0 1 0 1.2H8.6v3.9a.6.6 0 0 1-1.2 0V8.6H3.5a.6.6 0 0 1 0-1.2h3.9Z"/>',
  plusInCircle:
    '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.6 6V5a.6.6 0 0 0-1.2 0v2.4H5a.6.6 0 0 0 0 1.2h2.4V11a.6.6 0 0 0 1.2 0V8.6H11a.6.6 0 0 0 0-1.2H8.6Z"/>',
  pencil:
    '<path d="M11.4 2.1a.6.6 0 0 1 .85 0l1.65 1.65a.6.6 0 0 1 0 .85l-7.3 7.3a.6.6 0 0 1-.27.16l-2.7.75a.6.6 0 0 1-.74-.74l.75-2.7a.6.6 0 0 1 .16-.27l7.3-7.3Zm.42 1.28L5.1 10.1l-.4 1.45 1.45-.4 6.72-6.72-1.05-1.05Z"/>',
  trash:
    '<path d="M6 1.5h4a.5.5 0 0 1 .5.5v1H13a.5.5 0 0 1 0 1h-.6l-.5 8.06a1.5 1.5 0 0 1-1.5 1.4H5.6a1.5 1.5 0 0 1-1.5-1.4L3.6 4H3a.5.5 0 0 1 0-1h2.5V2a.5.5 0 0 1 .5-.5Zm.5 1.5v.5h3V3h-3Zm-1.9 1 .5 7.99a.5.5 0 0 0 .5.47h4.8a.5.5 0 0 0 .5-.47L11.4 4H4.6Z"/>',
  inspect:
    '<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5V8a.5.5 0 0 1-1 0V3.5a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H7a.5.5 0 0 1 0 1H3.5A1.5 1.5 0 0 1 2 10.5v-7Zm7.5 4a2.5 2.5 0 0 1 2 4l1.85 1.85a.5.5 0 0 1-.7.7L9.8 12a2.5 2.5 0 1 1-.3-4.5Zm0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>',
  copy: '<path d="M5 2.5A1.5 1.5 0 0 1 6.5 1h5A1.5 1.5 0 0 1 13 2.5v7A1.5 1.5 0 0 1 11.5 11H11v.5A1.5 1.5 0 0 1 9.5 13h-5A1.5 1.5 0 0 1 3 11.5v-7A1.5 1.5 0 0 1 4.5 3H5v-.5Zm1 .5H4.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V11H6.5A1.5 1.5 0 0 1 5 9.5V3h1ZM6 2.5v7a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5Z"/>',
  download:
    '<path d="M7.4 2.5a.6.6 0 0 1 1.2 0v5.3l1.65-1.65a.6.6 0 0 1 .85.85L8.42 9.9a.6.6 0 0 1-.84 0L4.9 7.2a.6.6 0 0 1 .85-.85L7.4 7.8V2.5ZM3 11a.5.5 0 0 1 1 0v1.5h8V11a.5.5 0 0 1 1 0v2a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13v-2Z"/>',
  wrench:
    '<path d="M10.5 1.5a4 4 0 0 0-3.86 5.06L2.3 10.9a1.5 1.5 0 0 0 2.12 2.12l4.34-4.34A4 4 0 0 0 13.9 4.6a.5.5 0 0 0-.83-.2l-1.5 1.5-1.2-.27-.27-1.2 1.5-1.5a.5.5 0 0 0-.2-.83 4 4 0 0 0-.9-.1Z"/>',
  lock: '<path d="M5 6V4.5a3 3 0 1 1 6 0V6h.5A1.5 1.5 0 0 1 13 7.5v4A1.5 1.5 0 0 1 11.5 13h-7A1.5 1.5 0 0 1 3 11.5v-4A1.5 1.5 0 0 1 4.5 6H5Zm1 0h4V4.5a2 2 0 1 0-4 0V6Zm2 2.5a1 1 0 0 0-.5 1.87V11a.5.5 0 0 0 1 0v-.63A1 1 0 0 0 8 8.5Z"/>',
  globe:
    '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.43 4.5H9.78a8.3 8.3 0 0 0-.9-2.65A5.52 5.52 0 0 1 11.43 6ZM8 2.6c.5.6 1 1.6 1.27 3.4H6.73C7 4.2 7.5 3.2 8 2.6ZM2.6 8c0-.52.07-1.02.2-1.5h2.1a13 13 0 0 0 0 3H2.8A5.5 5.5 0 0 1 2.6 8Zm.97 2.5h1.65c.2 1 .5 1.9.9 2.65A5.52 5.52 0 0 1 3.57 10.5Zm1.65-5H3.57A5.52 5.52 0 0 1 6.12 3.35a8.3 8.3 0 0 0-.9 2.65ZM8 13.4c-.5-.6-1-1.6-1.27-3.4h2.54C9 11.8 8.5 12.8 8 13.4Zm1.4-4.4H6.6a11.6 11.6 0 0 1 0-3h2.8a11.6 11.6 0 0 1 0 3Zm-.52 4.05c.4-.75.7-1.65.9-2.65h1.65a5.52 5.52 0 0 1-2.55 2.65Zm2.32-3.55a13 13 0 0 0 0-3h2.1c.13.48.2.98.2 1.5s-.07 1.02-.2 1.5h-2.1Z"/>',
  warning:
    '<path d="M7.13 2.4a1 1 0 0 1 1.74 0l5.3 9.1A1 1 0 0 1 13.3 13H2.7a1 1 0 0 1-.87-1.5l5.3-9.1ZM8 5.5a.6.6 0 0 0-.6.6v3a.6.6 0 0 0 1.2 0v-3a.6.6 0 0 0-.6-.6Zm0 5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>',
  check:
    '<path d="M13.3 4.3a.6.6 0 0 1 0 .85l-6.4 6.4a.6.6 0 0 1-.85 0L2.7 8.2a.6.6 0 0 1 .85-.85l2.93 2.93 5.97-5.98a.6.6 0 0 1 .85 0Z"/>',
  checkInCircle:
    '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.1 4.6L7.3 9.9a.6.6 0 0 1-.85 0L4.9 8.35a.6.6 0 0 1 .85-.85l1.13 1.12 3.37-3.37a.6.6 0 0 1 .85.85Z"/>',
  info: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 4a.85.85 0 1 1 0 1.7A.85.85 0 0 1 8 4Zm.75 7.5h-1.5a.5.5 0 0 1 0-1h.25V8h-.25a.5.5 0 0 1 0-1H8a.5.5 0 0 1 .5.5v3h.25a.5.5 0 0 1 0 1Z"/>',
};

function DsIcon({
  type,
  size = 16,
  color = 'currentColor',
}: {
  type: string;
  size?: number;
  color?: string;
}) {
  const path = DS_ICONS[type];
  if (!path) return <EuiIcon type={type} size="l" color={color as any} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color}
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: 'text-bottom' }}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

const SHADOW_S =
  '0 0.7px 1.4px rgba(0,0,0,0.07), 0 1.9px 4px rgba(0,0,0,0.05), 0 4.5px 10px rgba(0,0,0,0.04)';
const SHADOW_M =
  '0 0.9px 4px -1px rgba(0,0,0,0.08), 0 2.6px 8px -1px rgba(0,0,0,0.06), 0 5.7px 12px -1px rgba(0,0,0,0.05), 0 15px 15px -1px rgba(0,0,0,0.04)';
const VIS_PALETTE = ['#16C5C0', '#61A2FF', '#EE72A6', '#EAAE01', '#F6726A', '#A6EDEA', '#BFDBFF'];

interface DonutDatum {
  label: string;
  value: number;
}

interface AreaDatum {
  d: string;
  s: number;
  o: number;
}

interface SopTypeDatum {
  label: string;
  value: number;
  color: string;
}

function Section({
  title,
  subtitle,
  action,
  children,
  bodyStyle,
  isDark,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyStyle?: React.CSSProperties;
  isDark: boolean;
}) {
  const borderColor = isDark ? '#1F2C3E' : '#E3E8F2';
  const headingColor = isDark ? '#EDF1F8' : '#111C2C';
  const subduedColor = isDark ? '#8E9FBC' : '#516381';
  const bgColor = isDark ? '#16202E' : '#FFFFFF';
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background: bgColor,
        boxShadow: SHADOW_S,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '15px 20px 14px',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: headingColor,
              letterSpacing: '.005em',
              lineHeight: 1.3,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11.5, color: subduedColor, marginTop: 3, lineHeight: 1.4 }}>
              {subtitle}
            </div>
          )}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      <div style={{ borderTop: `1px solid ${borderColor}` }} />
      <div style={{ flex: 1, padding: '18px 20px 20px', ...bodyStyle }}>{children}</div>
    </div>
  );
}

function HeroStat({
  icon,
  tint,
  soft,
  label,
  value,
  caption,
  first,
  isDark,
}: {
  icon: string;
  tint: string;
  soft: string;
  label: string;
  value: React.ReactNode;
  caption: React.ReactNode;
  first?: boolean;
  isDark: boolean;
}) {
  const borderColor = isDark ? '#1F2C3E' : '#E3E8F2';
  const headingColor = isDark ? '#EDF1F8' : '#111C2C';
  const subduedColor = isDark ? '#8E9FBC' : '#516381';
  return (
    <div
      style={{
        padding: '0 22px',
        borderLeft: first ? 'none' : `1px solid ${borderColor}`,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 4,
            background: soft,
          }}
        >
          <DsIcon type={icon} size={14} color={tint} />
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '.07em',
            textTransform: 'uppercase' as const,
            color: subduedColor,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: headingColor,
          lineHeight: 1,
          letterSpacing: '-.02em',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: subduedColor, marginTop: 8, lineHeight: 1.4 }}>
        {caption}
      </div>
    </div>
  );
}

function SvgAreaChart({ data, h = 234, isDark }: { data: AreaDatum[]; h?: number; isDark: boolean }) {
  const borderColor = isDark ? '#1F2C3E' : '#E3E8F2';
  const subduedColor = isDark ? '#8E9FBC' : '#516381';
  const bgPlain = isDark ? '#16202E' : '#FFFFFF';
  const sessionsColor = '#61A2FF';
  const sopsColor = '#16C5C0';

  if (data.length === 0) return null;

  const w = 560;
  const padX = 8;
  const padTop = 16;
  const padBot = 26;
  const max = Math.max(...data.map((d) => d.s)) * 1.18;
  const xs = (i: number) => padX + (i / (data.length - 1)) * (w - padX * 2);
  const ys = (v: number) => h - padBot - (v / max) * (h - padBot - padTop);

  const smooth = (key: 's' | 'o') => {
    const p = data.map((d, i) => [xs(i), ys(d[key])] as [number, number]);
    let path = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, y0] = p[i];
      const [x1, y1] = p[i + 1];
      const cx = (x0 + x1) / 2;
      path += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return path;
  };

  const area = (key: 's' | 'o') =>
    `${smooth(key)} L${xs(data.length - 1)},${h - padBot} L${xs(0)},${h - padBot} Z`;

  const last = data.length - 1;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="sopGradS" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sessionsColor} stopOpacity={0.26} />
          <stop offset="100%" stopColor={sessionsColor} stopOpacity={0} />
        </linearGradient>
        <linearGradient id="sopGradO" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sopsColor} stopOpacity={0.22} />
          <stop offset="100%" stopColor={sopsColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
        const y = padTop + g * (h - padBot - padTop);
        return (
          <line
            key={i}
            x1={padX}
            x2={w - padX}
            y1={y}
            y2={y}
            stroke={borderColor}
            strokeWidth="1"
            strokeDasharray={i === 4 ? 'none' : '2 5'}
            opacity={i === 4 ? 1 : 0.7}
          />
        );
      })}
      <path d={area('s')} fill="url(#sopGradS)" />
      <path d={area('o')} fill="url(#sopGradO)" />
      <path
        d={smooth('s')}
        fill="none"
        stroke={sessionsColor}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={smooth('o')}
        fill="none"
        stroke={sopsColor}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={xs(last)}
        cy={ys(data[last].s)}
        r={5}
        fill={bgPlain}
        stroke={sessionsColor}
        strokeWidth={2.25}
      />
      <circle
        cx={xs(last)}
        cy={ys(data[last].o)}
        r={5}
        fill={bgPlain}
        stroke={sopsColor}
        strokeWidth={2.25}
      />
      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text
            key={i}
            x={xs(i)}
            y={h - 6}
            fontSize="10"
            fill={subduedColor}
            textAnchor="middle"
          >
            {d.d}
          </text>
        ) : null
      )}
    </svg>
  );
}

function SvgDonut({
  data,
  size = 150,
  isDark,
}: {
  data: DonutDatum[];
  size?: number;
  isDark: boolean;
}) {
  const headingColor = isDark ? '#EDF1F8' : '#111C2C';
  const subduedColor = isDark ? '#8E9FBC' : '#516381';
  const bgPlain = isDark ? '#16202E' : '#FFFFFF';

  if (data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2;
  const inner = r * 0.62;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += d.value;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const fraction = d.value / total;
    if (fraction >= 0.9999) {
      return (
        <g key={i}>
          <circle cx={r} cy={r} r={r} fill={VIS_PALETTE[i % VIS_PALETTE.length]} />
          <circle cx={r} cy={r} r={inner} fill={bgPlain} />
        </g>
      );
    }
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = r + r * Math.cos(a0),
      y0 = r + r * Math.sin(a0);
    const x1 = r + r * Math.cos(a1),
      y1 = r + r * Math.sin(a1);
    const xi0 = r + inner * Math.cos(a1),
      yi0 = r + inner * Math.sin(a1);
    const xi1 = r + inner * Math.cos(a0),
      yi1 = r + inner * Math.sin(a0);
    return (
      <path
        key={i}
        fill={VIS_PALETTE[i % VIS_PALETTE.length]}
        d={`M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi0},${yi0} A${inner},${inner} 0 ${large} 0 ${xi1},${yi1} Z`}
      />
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          {arcs}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: headingColor }}>
            {total.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: subduedColor }}>total</div>
        </div>
      </div>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center' }}
      >
        {data.map((d, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              color: subduedColor,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: VIS_PALETTE[i % VIS_PALETTE.length],
              }}
            />
            {d.label} <b style={{ color: headingColor }}>{d.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function SvgGauge({
  pct,
  label,
  sublabel,
  accent,
  isDark,
}: {
  pct: number;
  label: string;
  sublabel?: string;
  accent: string;
  isDark: boolean;
}) {
  const headingColor = isDark ? '#EDF1F8' : '#111C2C';
  const subduedColor = isDark ? '#8E9FBC' : '#516381';
  const bgStroke = isDark ? '#34435C' : '#CAD3E2';
  const gaugeSize = 92;
  const r = gaugeSize / 2;
  const inner = r * 0.72;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const a = (clampedPct / 100) * Math.PI * 2 - Math.PI / 2;
  const x0 = r;
  const y0 = 0;
  const large = a > Math.PI / 2 ? 1 : 0;
  const x1 = r + r * Math.cos(a),
    y1 = r + r * Math.sin(a);
  const xi0 = r + inner * Math.cos(a),
    yi0 = r + inner * Math.sin(a);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: gaugeSize, height: gaugeSize }}>
        <svg width={gaugeSize} height={gaugeSize}>
          <circle
            cx={r}
            cy={r}
            r={(r + inner) / 2}
            fill="none"
            stroke={bgStroke}
            strokeWidth={r - inner}
          />
          {clampedPct > 0 && clampedPct >= 100 ? (
            <circle
              cx={r}
              cy={r}
              r={(r + inner) / 2}
              fill="none"
              stroke={accent}
              strokeWidth={r - inner}
            />
          ) : clampedPct > 0 ? (
            <path
              fill={accent}
              d={`M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi0},${yi0} A${inner},${inner} 0 ${large} 0 ${r},${r - inner} Z`}
            />
          ) : null}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 16,
            color: headingColor,
          }}
        >
          {pct}%
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: headingColor }}>{label}</div>
        {sublabel && <div style={{ fontSize: 11, color: subduedColor }}>{sublabel}</div>}
      </div>
    </div>
  );
}

// PLACEHOLDER_SEGBAR
function SegmentedBar({
  segments,
  isDark,
}: {
  segments: SopTypeDatum[];
  isDark: boolean;
}) {
  const headingColor = isDark ? '#EDF1F8' : '#111C2C';
  const subduedColor = isDark ? '#8E9FBC' : '#516381';
  const bgSubdued = isDark ? '#0F1A28' : '#F6F9FC';
  const bgPlain = isDark ? '#16202E' : '#FFFFFF';
  const total = segments.reduce((s, t) => s + t.value, 0);
  if (total === 0) return null;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 12,
          borderRadius: 9999,
          overflow: 'hidden',
          background: bgSubdued,
        }}
      >
        {segments.map((t, i) => (
          <div
            key={i}
            title={`${t.label}: ${t.value}`}
            style={{
              width: `${(t.value / total) * 100}%`,
              background: t.color,
              borderRight:
                i < segments.length - 1 ? `2px solid ${bgPlain}` : 'none',
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${segments.length}, 1fr)`,
          gap: 12,
          marginTop: 18,
        }}
      >
        {segments.map((t, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              paddingLeft: 12,
              borderLeft: `2px solid ${t.color}`,
            }}
          >
            <div style={{ fontSize: 12, color: subduedColor }}>{t.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: headingColor,
                  letterSpacing: '-.01em',
                }}
              >
                {t.value}
              </span>
              <span style={{ fontSize: 12, color: subduedColor }}>
                {Math.round((t.value / total) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewView({ service }: { service: SopLearningService }) {
  const { colorMode } = useEuiTheme();
  const isDark = colorMode === 'DARK';
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    service
      .getOverview()
      .then(setMetrics)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  const activityData: AreaDatum[] = useMemo(() => {
    if (!metrics) return [];
    return metrics.activity.map((a) => ({
      d: new Date(`${a.date}T00:00:00Z`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      s: a.sessions,
      o: a.sops,
    }));
  }, [metrics]);

  if (loading && !metrics) {
    return (
      <EuiPanel paddingSize="l">
        <EuiFlexGroup justifyContent="center" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingChart size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  }

  if (error) {
    return (
      <EuiCallOut title="Could not load metrics" color="danger" iconType="warning">
        {error}
      </EuiCallOut>
    );
  }

  if (!metrics) return null;

  const confidencePct = Math.round((metrics.sops.avg_confidence ?? 0) * 100);
  const multimodalCoverage =
    metrics.sessions.total > 0
      ? Math.round((metrics.embedded_sessions / metrics.sessions.total) * 100)
      : 0;

  const eventsByCategory = Object.entries(metrics.events.by_category)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: titleCase(k), value: v }));
  const sopsByVia = Object.entries(metrics.sops.by_generated_via)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: titleCase(k), value: v }));
  const mediaComposition = [
    { label: 'Screen video', value: metrics.media.video_count },
    { label: 'Voice audio', value: metrics.media.audio_count },
    { label: 'Screen frames', value: metrics.media.frame_count },
  ].filter((d) => d.value > 0);

  const confidenceAccent = isDark
    ? confidencePct >= 70
      ? '#24C292'
      : '#F3D371'
    : confidencePct >= 70
    ? '#008A5E'
    : '#FACB3D';
  const coverageAccent = isDark ? '#19C6C1' : '#008B87';

  const sopTypeEntries = Object.entries(metrics.sessions.by_type);
  const sopTypeColors = ['#61A2FF', '#16C5C0', '#EAAE01', '#EE72A6', '#F6726A', '#A6EDEA'];
  const sopTypeSegments: SopTypeDatum[] = sopTypeEntries.map(([k, v], i) => ({
    label: titleCase(k),
    value: v as number,
    color: sopTypeColors[i % sopTypeColors.length],
  }));
  const sopTypeTotal = sopTypeSegments.reduce((s, t) => s + t.value, 0);

  const headingColor = isDark ? '#EDF1F8' : '#111C2C';
  const subduedColor = isDark ? '#8E9FBC' : '#516381';
  const primaryColor = isDark ? '#62A9FF' : '#1750BA';
  const borderColor = isDark ? '#1F2C3E' : '#E3E8F2';
  const successColor = isDark ? '#24C292' : '#008A5E';
  const successBgColor = isDark ? '#0E2A24' : '#E9FFF7';
  const heroSurface = isDark
    ? `linear-gradient(180deg, #16202E 0%, #0F1A28 100%)`
    : `linear-gradient(180deg, #FFFFFF 0%, #F6F9FC 100%)`;
  const heroGlow = isDark
    ? 'radial-gradient(120% 130% at 100% -10%, #112A45 0%, rgba(17,42,69,0) 60%)'
    : 'radial-gradient(120% 130% at 100% -10%, #F1F6FF 0%, rgba(241,246,255,0) 60%)';

  return (
    <div>
      {/* Elevated masthead */}
      <div
        style={{
          position: 'relative',
          borderRadius: 6,
          background: heroSurface,
          boxShadow: SHADOW_M,
          border: `1px solid ${borderColor}`,
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: heroGlow, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', padding: '26px 28px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 20,
              flexWrap: 'wrap' as const,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase' as const,
                  color: primaryColor,
                }}
              >
                SOP Learning Program
              </div>
              <div
                style={{
                  fontSize: 29,
                  fontWeight: 700,
                  color: headingColor,
                  letterSpacing: '-.02em',
                  lineHeight: 1.1,
                  marginTop: 8,
                }}
              >
                Program metrics
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: subduedColor,
                  marginTop: 7,
                  maxWidth: 480,
                  lineHeight: 1.5,
                }}
              >
                A live view of everything captured, synthesized, and deployed across your security
                operations.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: successColor,
                    boxShadow: `0 0 0 4px ${successBgColor}`,
                  }}
                />
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: headingColor }}>Live</div>
                  <div style={{ fontSize: 10.5, color: subduedColor }}>Updated just now</div>
                </div>
              </div>
              <EuiButton size="s" iconType="refresh" onClick={load} isLoading={loading} fill>
                Refresh
              </EuiButton>
            </div>
          </div>

          <div style={{ height: 1, background: borderColor, margin: '24px 0 22px' }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', margin: '0 -22px' }}>
            <HeroStat
              first
              isDark={isDark}
              icon="videoPlayer"
              tint={isDark ? '#36A2EF' : '#0B64DD'}
              soft={isDark ? '#112A45' : '#F1F6FF'}
              label="Sessions recorded"
              value={metrics.sessions.total}
              caption={
                <>
                  <b style={{ color: headingColor, fontWeight: 600 }}>
                    {metrics.sessions.by_status.completed ?? 0}
                  </b>{' '}
                  completed &middot;{' '}
                  <b style={{ color: headingColor, fontWeight: 600 }}>
                    {metrics.sessions.by_status.synthesized ?? 0}
                  </b>{' '}
                  synthesized
                </>
              }
            />
            <HeroStat
              isDark={isDark}
              icon="clickLeft"
              tint={isDark ? '#19C6C1' : '#008B87'}
              soft={isDark ? '#0E2D2C' : '#EAFBFA'}
              label="Interactions"
              value={metrics.events.total.toLocaleString()}
              caption={
                <>
                  <b style={{ color: headingColor, fontWeight: 600 }}>
                    {metrics.events.esql_queries}
                  </b>{' '}
                  ES|QL &middot;{' '}
                  <b style={{ color: headingColor, fontWeight: 600 }}>
                    {metrics.events.voice_segments.toLocaleString()}
                  </b>{' '}
                  voice
                </>
              }
            />
            <HeroStat
              isDark={isDark}
              icon="bolt"
              tint={successColor}
              soft={successBgColor}
              label="SOPs synthesized"
              value={metrics.sops.total}
              caption={
                <>
                  <b style={{ color: headingColor, fontWeight: 600 }}>
                    {metrics.sops.distinct_tools}
                  </b>{' '}
                  tools &middot;{' '}
                  <b style={{ color: headingColor, fontWeight: 600 }}>{confidencePct}%</b> avg
                  confidence
                </>
              }
            />
            <HeroStat
              isDark={isDark}
              icon="push"
              tint={isDark ? '#F68FBE' : '#BC1E70'}
              soft={isDark ? '#2C1726' : '#FFF0F8'}
              label="Deployments"
              value={metrics.deployments.total}
              caption={
                <>
                  <b style={{ color: headingColor, fontWeight: 600 }}>
                    {metrics.deployments.by_type.skill ?? 0}
                  </b>{' '}
                  skills &middot;{' '}
                  <b style={{ color: headingColor, fontWeight: 600 }}>
                    {metrics.deployments.by_type.workflow ?? 0}
                  </b>{' '}
                  workflows
                </>
              }
            />
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ height: 24 }} />

      {/* Activity + Quality */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.45fr', gap: 16 }}>
        <Section
          isDark={isDark}
          title="Activity over time"
          subtitle="Sessions recorded and SOPs synthesized per day"
          action={
            <div style={{ display: 'flex', gap: 14 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  color: subduedColor,
                }}
              >
                <span
                  style={{ width: 9, height: 9, borderRadius: '50%', background: '#61A2FF' }}
                />
                Sessions
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  color: subduedColor,
                }}
              >
                <span
                  style={{ width: 9, height: 9, borderRadius: '50%', background: '#16C5C0' }}
                />
                SOPs
              </span>
            </div>
          }
        >
          {activityData.length === 0 ? (
            <EuiText size="s" color="subdued">
              <em>No activity recorded yet.</em>
            </EuiText>
          ) : (
            <SvgAreaChart data={activityData} h={234} isDark={isDark} />
          )}
        </Section>

        <Section
          isDark={isDark}
          title="Quality &amp; coverage"
          subtitle="Synthesis confidence and search readiness"
        >
          <SvgGauge
            pct={confidencePct}
            label="Average SOP confidence"
            sublabel="Across all synthesized SOPs"
            accent={confidenceAccent}
            isDark={isDark}
          />
          <EuiHorizontalRule margin="m" />
          <SvgGauge
            pct={multimodalCoverage}
            label="Multimodal coverage"
            sublabel="Sessions vectorized for search"
            accent={coverageAccent}
            isDark={isDark}
          />
          <EuiHorizontalRule margin="m" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <EuiToolTip content="Periodic screen keyframes sent to the vision model.">
              <EuiBadge color="warning" iconType="image">
                {metrics.media.frame_count} frames
              </EuiBadge>
            </EuiToolTip>
            <EuiBadge color="hollow" iconType="storage">
              {formatBytes(metrics.media.total_bytes)} stored
            </EuiBadge>
          </div>
        </Section>
      </div>

      {/* Spacer */}
      <div style={{ height: 24 }} />

      {/* Distribution donuts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <Section
          isDark={isDark}
          title="Interactions by category"
          subtitle="Where captured signal comes from"
          bodyStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <SvgDonut data={eventsByCategory} isDark={isDark} />
        </Section>
        <Section
          isDark={isDark}
          title="SOPs by synthesis engine"
          subtitle="Which engine produced each SOP"
          bodyStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <SvgDonut data={sopsByVia} isDark={isDark} />
        </Section>
        <Section
          isDark={isDark}
          title="Multimodal capture mix"
          subtitle="Video, audio, and vision frames"
          bodyStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <SvgDonut data={mediaComposition} isDark={isDark} />
        </Section>
      </div>

      {/* Spacer */}
      <div style={{ height: 24 }} />

      {/* SOP type distribution bar */}
      {sopTypeSegments.length > 0 && (
        <Section
          isDark={isDark}
          title="SOP types recorded"
          subtitle={`${sopTypeTotal} sessions across ${sopTypeSegments.length} runbook categories`}
        >
          <SegmentedBar segments={sopTypeSegments} isDark={isDark} />
        </Section>
      )}
    </div>
  );
}

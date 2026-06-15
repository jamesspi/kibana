/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css, keyframes } from '@emotion/react';
import { WATCH_CONFIGS } from '../../../common';
import type { WatchType } from '../../../common';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const HOURLY_RATE = 100;

interface WatchPerf {
  watchType: WatchType;
  proposalsTotal: number;
  approvalRate: number;
  avgConfidence: number;
  timeSavedHours: number;
  tokenCost: number;
  model: string;
  topActions: Array<{ action: string; count: number }>;
  invocationsToday: number;
  successRate: number;
}

interface Analyst {
  name: string;
  role: string;
  initials: string;
  avatar: string;
  gradient: string;
  decisions: number;
  approvalRate: number;
  hoursSaved: number;
}

const ANALYSTS: Analyst[] = [
  {
    name: 'James Spiteri',
    role: 'SOC Lead',
    initials: 'JS',
    avatar: 'https://i.pravatar.cc/80?u=james-spiteri',
    gradient: 'linear-gradient(135deg, #48EFCF, #36b8a0)',
    decisions: 342,
    approvalRate: 89,
    hoursSaved: 24,
  },
  {
    name: 'Sarah Chen',
    role: 'Senior Analyst',
    initials: 'SC',
    avatar: 'https://i.pravatar.cc/80?u=sarah-chen',
    gradient: 'linear-gradient(135deg, #6AADFF, #4a8ad4)',
    decisions: 287,
    approvalRate: 92,
    hoursSaved: 18,
  },
  {
    name: 'Marcus Rivera',
    role: 'IR Lead',
    initials: 'MR',
    avatar: 'https://i.pravatar.cc/80?u=marcus-rivera',
    gradient: 'linear-gradient(135deg, #FEC514, #d4a312)',
    decisions: 156,
    approvalRate: 78,
    hoursSaved: 34,
  },
  {
    name: 'Dima Kozlov',
    role: 'Detection Eng',
    initials: 'DK',
    avatar: 'https://i.pravatar.cc/80?u=dima-kozlov',
    gradient: 'linear-gradient(135deg, #F04E98, #c43d7a)',
    decisions: 98,
    approvalRate: 95,
    hoursSaved: 12,
  },
];

const WEEKLY_TREND = [42, 67, 54, 89, 73, 96, 81];
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const WATCH_PERF: WatchPerf[] = [
  {
    watchType: 'watch_floor',
    proposalsTotal: 1247,
    approvalRate: 89,
    avgConfidence: 91,
    timeSavedHours: 2156,
    tokenCost: 384.2,
    model: 'Claude Sonnet 4',
    topActions: [
      { action: 'Alert triaged as FP', count: 8934 },
      { action: 'Alert enriched & routed', count: 4521 },
      { action: 'Detection rule tuned', count: 312 },
    ],
    invocationsToday: 847,
    successRate: 96.7,
  },
  {
    watchType: 'watch_officer',
    proposalsTotal: 423,
    approvalRate: 94,
    avgConfidence: 87,
    timeSavedHours: 1048,
    tokenCost: 612.8,
    model: 'Claude Opus 4',
    topActions: [
      { action: 'Case investigation complete', count: 312 },
      { action: 'Containment executed', count: 89 },
      { action: 'Case closed (benign)', count: 156 },
    ],
    invocationsToday: 34,
    successRate: 94.2,
  },
  {
    watchType: 'dark_watch',
    proposalsTotal: 189,
    approvalRate: 78,
    avgConfidence: 74,
    timeSavedHours: 834,
    tokenCost: 456.9,
    model: 'Claude Opus 4',
    topActions: [
      { action: 'Threat hunt completed', count: 156 },
      { action: 'Detection rule proposed', count: 89 },
      { action: 'TTP attributed', count: 34 },
    ],
    invocationsToday: 12,
    successRate: 89.1,
  },
  {
    watchType: 'deep_watch',
    proposalsTotal: 67,
    approvalRate: 96,
    avgConfidence: 91,
    timeSavedHours: 468,
    tokenCost: 892.4,
    model: 'Claude Opus 4',
    topActions: [
      { action: 'Forensic report generated', count: 34 },
      { action: 'Binary analysis complete', count: 21 },
      { action: 'AI threat blocked', count: 12 },
    ],
    invocationsToday: 8,
    successRate: 97.8,
  },
];

const containerStyles = css`
  animation: ${fadeIn} 0.4s ease both;
  font-variant-numeric: tabular-nums;
`;

const sectionTitleStyles = css`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.25);
  margin-bottom: 20px;
`;

const cardStyles = css`
  padding: 28px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition: border-color 0.15s ease, background 0.15s ease;
`;

export const PerformanceView: React.FC = () => {
  const totalTimeSaved = WATCH_PERF.reduce((a, w) => a + w.timeSavedHours, 0);
  const totalCost = WATCH_PERF.reduce((a, w) => a + w.tokenCost, 0);
  const totalProposals = WATCH_PERF.reduce((a, w) => a + w.proposalsTotal, 0);
  const costPerHour = totalCost / totalTimeSaved;
  const maxTrend = Math.max(...WEEKLY_TREND);

  return (
    <div css={containerStyles}>
      {/* Hero Stats */}
      <div
        css={css`
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 56px;
        `}
      >
        {[
          { label: 'Analyst hours saved', value: '4,506', color: '#48EFCF' },
          { label: 'Total proposals', value: '1,926', color: '#6AADFF' },
          { label: 'Token cost 30d', value: `$${totalCost.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, color: '#FEC514' },
          { label: 'Cost per hour saved', value: `$${costPerHour.toFixed(2)}`, color: '#F04E98' },
        ].map((stat, i) => (
          <div
            key={stat.label}
            css={css`
              ${cardStyles};
              padding: 32px;
              animation: ${fadeIn} 0.5s ease both;
              animation-delay: ${i * 100}ms;
              &:hover {
                background: rgba(255, 255, 255, 0.025);
              }
            `}
          >
            <div
              css={css`
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.3);
                margin-bottom: 12px;
              `}
            >
              {stat.label}
            </div>
            <div
              css={css`
                font-size: 38px;
                font-weight: 800;
                letter-spacing: -0.02em;
                color: ${stat.color};
                line-height: 1;
              `}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Team Section */}
      <div css={css`margin-bottom: 56px;`}>
        <div css={sectionTitleStyles}>Top Analysts</div>
        <div
          css={css`
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
          `}
        >
          {ANALYSTS.map((analyst, i) => (
            <div
              key={analyst.initials}
              css={css`
                ${cardStyles};
                padding: 24px;
                animation: ${fadeIn} 0.5s ease both;
                animation-delay: ${200 + i * 80}ms;
                &:hover {
                  background: rgba(255, 255, 255, 0.025);
                }
              `}
            >
              <div css={css`display: flex; align-items: center; gap: 12px; margin-bottom: 20px;`}>
                <div
                  css={css`
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background: ${analyst.gradient};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    font-weight: 700;
                    color: #080a10;
                    flex-shrink: 0;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                  `}
                >
                  <img
                    src={analyst.avatar}
                    alt={analyst.name}
                    css={css`width: 100%; height: 100%; object-fit: cover;`}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <div>
                  <div css={css`font-size: 14px; font-weight: 600; color: #fff;`}>
                    {analyst.name}
                  </div>
                  <div css={css`font-size: 11px; color: rgba(255, 255, 255, 0.35);`}>
                    {analyst.role}
                  </div>
                </div>
              </div>
              <div css={css`display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;`}>
                <div>
                  <div css={css`font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.25); margin-bottom: 4px;`}>
                    Decisions
                  </div>
                  <div css={css`font-size: 16px; font-weight: 700; color: #fff;`}>
                    {analyst.decisions}
                  </div>
                </div>
                <div>
                  <div css={css`font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.25); margin-bottom: 4px;`}>
                    Approval
                  </div>
                  <div css={css`font-size: 16px; font-weight: 700; color: ${analyst.approvalRate >= 90 ? '#48EFCF' : '#FEC514'};`}>
                    {analyst.approvalRate}%
                  </div>
                </div>
                <div>
                  <div css={css`font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.25); margin-bottom: 4px;`}>
                    Saved
                  </div>
                  <div css={css`font-size: 16px; font-weight: 700; color: #fff;`}>
                    {analyst.hoursSaved}h
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Trend Sparkline */}
      <div css={css`margin-bottom: 56px;`}>
        <div css={sectionTitleStyles}>Proposal Volume — Last 7 Days</div>
        <div
          css={css`
            ${cardStyles};
            padding: 24px 28px;
            display: flex;
            align-items: flex-end;
            gap: 8px;
            height: 140px;
          `}
        >
          {WEEKLY_TREND.map((val, i) => (
            <div
              key={WEEK_LABELS[i]}
              css={css`
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                height: 100%;
                justify-content: flex-end;
              `}
            >
              <div
                css={css`
                  font-size: 11px;
                  font-weight: 600;
                  color: rgba(255, 255, 255, 0.5);
                `}
              >
                {val}
              </div>
              <div
                css={css`
                  width: 100%;
                  max-width: 48px;
                  height: ${(val / maxTrend) * 70}%;
                  min-height: 4px;
                  background: linear-gradient(180deg, #6AADFF 0%, rgba(106, 173, 255, 0.3) 100%);
                  border-radius: 4px 4px 2px 2px;
                  animation: ${fadeIn} 0.4s ease both;
                  animation-delay: ${400 + i * 60}ms;
                `}
              />
              <div
                css={css`
                  font-size: 10px;
                  color: rgba(255, 255, 255, 0.25);
                  letter-spacing: 0.02em;
                `}
              >
                {WEEK_LABELS[i]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Watch Performance */}
      <div css={css`margin-bottom: 56px;`}>
        <div css={sectionTitleStyles}>Watch Performance</div>
        <div css={css`display: flex; flex-direction: column; gap: 20px;`}>
          {WATCH_PERF.map((perf, i) => {
            const config = WATCH_CONFIGS[perf.watchType];
            const roi = ((perf.timeSavedHours * HOURLY_RATE) / perf.tokenCost).toFixed(0);

            return (
              <div
                key={perf.watchType}
                css={css`
                  ${cardStyles};
                  animation: ${fadeIn} 0.5s ease both;
                  animation-delay: ${600 + i * 100}ms;
                  &:hover {
                    border-color: ${config.color}22;
                    background: rgba(255, 255, 255, 0.02);
                  }
                `}
              >
                {/* Header */}
                <div css={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;`}>
                  <div css={css`display: flex; align-items: center; gap: 12px;`}>
                    <div
                      css={css`
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        background: ${config.color};
                        box-shadow: 0 0 8px ${config.color}40;
                      `}
                    />
                    <span css={css`font-size: 17px; font-weight: 700; color: #fff;`}>
                      {config.name}
                    </span>
                    <span
                      css={css`
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.4);
                        background: rgba(255, 255, 255, 0.04);
                        padding: 3px 10px;
                        border-radius: 6px;
                        font-weight: 500;
                      `}
                    >
                      {perf.model}
                    </span>
                  </div>
                  <div css={css`display: flex; align-items: center; gap: 16px;`}>
                    <span
                      css={css`
                        font-size: 12px;
                        font-weight: 600;
                        color: #48EFCF;
                        background: rgba(72, 239, 207, 0.06);
                        padding: 4px 10px;
                        border-radius: 6px;
                      `}
                    >
                      {roi}x ROI
                    </span>
                    <span css={css`font-size: 12px; color: rgba(255, 255, 255, 0.3);`}>
                      {perf.invocationsToday} invocations today
                    </span>
                  </div>
                </div>

                {/* Metrics row */}
                <div
                  css={css`
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 24px;
                    margin-bottom: 20px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                  `}
                >
                  <div>
                    <div css={css`font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.25); margin-bottom: 6px;`}>
                      Proposals
                    </div>
                    <div css={css`font-size: 20px; font-weight: 700; color: #fff;`}>
                      {perf.proposalsTotal.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div css={css`font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.25); margin-bottom: 6px;`}>
                      Success Rate
                    </div>
                    <div css={css`font-size: 20px; font-weight: 700; color: ${perf.successRate > 90 ? '#48EFCF' : '#FEC514'};`}>
                      {perf.successRate}%
                    </div>
                  </div>
                  <div>
                    <div css={css`font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.25); margin-bottom: 6px;`}>
                      Time Saved
                    </div>
                    <div css={css`font-size: 20px; font-weight: 700; color: #fff;`}>
                      {perf.timeSavedHours.toLocaleString()}h
                    </div>
                  </div>
                  <div>
                    <div css={css`font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.25); margin-bottom: 6px;`}>
                      Token Cost
                    </div>
                    <div css={css`font-size: 20px; font-weight: 700; color: rgba(255, 255, 255, 0.5);`}>
                      ${perf.tokenCost.toFixed(0)}
                    </div>
                  </div>
                  <div>
                    <div css={css`font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.25); margin-bottom: 6px;`}>
                      Value Generated
                    </div>
                    <div css={css`font-size: 20px; font-weight: 700; color: ${config.color};`}>
                      ${(perf.timeSavedHours * HOURLY_RATE).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Top actions with bar chart */}
                <div css={css`display: flex; flex-direction: column; gap: 8px;`}>
                  {perf.topActions.map((action) => {
                    const maxCount = Math.max(...perf.topActions.map((a) => a.count));
                    const width = (action.count / maxCount) * 100;
                    return (
                      <div
                        key={action.action}
                        css={css`
                          display: flex;
                          align-items: center;
                          gap: 14px;
                        `}
                      >
                        <span
                          css={css`
                            font-size: 12px;
                            color: rgba(255, 255, 255, 0.5);
                            width: 240px;
                            flex-shrink: 0;
                          `}
                        >
                          {action.action}
                        </span>
                        <div
                          css={css`
                            flex: 1;
                            height: 8px;
                            background: rgba(255, 255, 255, 0.03);
                            border-radius: 4px;
                            overflow: hidden;
                          `}
                        >
                          <div
                            css={css`
                              height: 100%;
                              width: ${width}%;
                              background: linear-gradient(90deg, ${config.color}70, ${config.color}30);
                              border-radius: 4px;
                              transition: width 0.6s ease;
                            `}
                          />
                        </div>
                        <span
                          css={css`
                            font-size: 12px;
                            font-weight: 600;
                            color: rgba(255, 255, 255, 0.4);
                            width: 56px;
                            text-align: right;
                          `}
                        >
                          {action.count.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

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

interface Attachment {
  type: 'timeline' | 'rules' | 'hosts' | 'stats';
  data: Record<string, unknown>;
}

export interface InvestigationMessage {
  id: string;
  sender: {
    type: 'user' | 'watch' | 'analyst';
    name: string;
    watchType?: WatchType;
    avatarUrl?: string;
  };
  text: string;
  timestamp: string;
  attachments?: Attachment[];
}

interface InvestigationThreadProps {
  messages: InvestigationMessage[];
  participants: InvestigationMessage['sender'][];
  incidentTitle: string;
}

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#F04E98',
  high: '#FEC514',
  medium: 'rgba(255, 255, 255, 0.3)',
};

const STATUS_COLORS: Record<string, string> = {
  compromised: '#F04E98',
  source: '#FEC514',
  attempted: 'rgba(255, 255, 255, 0.3)',
};

const Avatar: React.FC<{ sender: InvestigationMessage['sender']; size?: number }> = ({
  sender,
  size = 32,
}) => {
  if (sender.type === 'watch' && sender.watchType) {
    return (
      <div
        css={css`
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${WATCH_CONFIGS[sender.watchType].color}18;
          border: 1.5px solid ${WATCH_CONFIGS[sender.watchType].color}40;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        `}
      >
        <span
          css={css`
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: ${WATCH_CONFIGS[sender.watchType].color};
            box-shadow: 0 0 8px ${WATCH_CONFIGS[sender.watchType].color}60;
          `}
        />
      </div>
    );
  }

  if (sender.avatarUrl) {
    return (
      <img
        src={sender.avatarUrl}
        alt={sender.name}
        css={css`
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          flex-shrink: 0;
          object-fit: cover;
        `}
      />
    );
  }

  const initials = sender.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);
  return (
    <div
      css={css`
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: rgba(72, 239, 207, 0.12);
        border: 1.5px solid rgba(72, 239, 207, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: ${size * 0.38}px;
        font-weight: 600;
        color: #48efcf;
      `}
    >
      {initials}
    </div>
  );
};

const ThreadAttachment: React.FC<{ attachment: Attachment; watchColor: string }> = ({
  attachment,
  watchColor,
}) => {
  const { type, data } = attachment;
  const containerCss = css`
    padding: 14px 18px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
  `;

  if (type === 'timeline') {
    const events = data.events as Array<{ time: string; action: string; severity: string }>;
    return (
      <div css={containerCss}>
        <div
          css={css`
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.3);
            margin-bottom: 10px;
          `}
        >
          {data.title as string}
        </div>
        <div css={css`display: flex; flex-direction: column;`}>
          {events.map((evt, i) => (
            <div
              key={i}
              css={css`
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 6px 0;
                position: relative;
                transition: background 0.12s ease;
                border-radius: 4px;
                &:hover {
                  background: rgba(255, 255, 255, 0.02);
                }
                &::before {
                  content: '';
                  position: absolute;
                  left: 3px;
                  top: 18px;
                  bottom: -6px;
                  width: 1px;
                  background: ${i < events.length - 1
                    ? 'rgba(255, 255, 255, 0.04)'
                    : 'transparent'};
                }
              `}
            >
              <span
                css={css`
                  width: 7px;
                  height: 7px;
                  border-radius: 50%;
                  background: ${SEVERITY_COLORS[evt.severity] || 'rgba(255, 255, 255, 0.2)'};
                  flex-shrink: 0;
                  margin-top: 4px;
                `}
              />
              <span
                css={css`
                  font-size: 12px;
                  color: rgba(255, 255, 255, 0.3);
                  font-variant-numeric: tabular-nums;
                  flex-shrink: 0;
                  width: 52px;
                `}
              >
                {evt.time}
              </span>
              <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.55); line-height: 1.3;`}>
                {evt.action}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'hosts') {
    const items = data.items as Array<{ name: string; status: string; action: string }>;
    return (
      <div css={containerCss}>
        <div
          css={css`
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.3);
            margin-bottom: 10px;
          `}
        >
          {data.title as string}
        </div>
        <div css={css`display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px;`}>
          {items.map((item, i) => (
            <div
              key={i}
              css={css`
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 5px 8px;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.12s ease;
                &:hover {
                  background: rgba(255, 255, 255, 0.04);
                }
              `}
            >
              <span
                css={css`
                  width: 6px;
                  height: 6px;
                  border-radius: 50%;
                  background: ${STATUS_COLORS[item.status] || 'rgba(255, 255, 255, 0.2)'};
                  flex-shrink: 0;
                `}
              />
              <span
                css={css`
                  font-size: 12px;
                  color: rgba(255, 255, 255, 0.55);
                  font-family: 'JetBrains Mono', monospace;
                `}
              >
                {item.name}
              </span>
              <span css={css`font-size: 10px; color: rgba(255, 255, 255, 0.25); margin-left: auto;`}>
                {item.action}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'stats') {
    const items = data.items as Array<{ label: string; value: string }>;
    return (
      <div css={containerCss}>
        <div
          css={css`
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.3);
            margin-bottom: 10px;
          `}
        >
          {data.title as string}
        </div>
        <div css={css`display: flex; gap: 24px;`}>
          {items.map((item, i) => (
            <div key={i}>
              <div css={css`font-size: 18px; font-weight: 700; color: #fff;`}>{item.value}</div>
              <div css={css`font-size: 11px; color: rgba(255, 255, 255, 0.3);`}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'rules') {
    const items = data.items as Array<{
      name: string;
      alerts: number;
      fpRate: number;
      note?: string;
    }>;
    return (
      <div css={containerCss}>
        <div
          css={css`
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.3);
            margin-bottom: 10px;
          `}
        >
          {data.title as string}
        </div>
        <div css={css`display: flex; flex-direction: column; gap: 6px;`}>
          {items.map((item, i) => (
            <div
              key={i}
              css={css`
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 6px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.02);
                &:last-child {
                  border-bottom: none;
                }
              `}
            >
              <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.55); flex: 1;`}>
                {item.name}
              </span>
              {item.alerts > 0 && (
                <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.25);`}>
                  {item.alerts} alerts/day
                </span>
              )}
              {item.fpRate > 0 && (
                <span css={css`font-size: 11px; color: rgba(255, 149, 125, 0.6);`}>
                  {item.fpRate}% FP
                </span>
              )}
              {item.note && (
                <span css={css`font-size: 11px; color: ${watchColor}88;`}>{item.note}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export const InvestigationThread: React.FC<InvestigationThreadProps> = ({
  messages,
  participants,
  incidentTitle,
}) => {
  const isSameSender = (idx: number): boolean => {
    if (idx === 0) return false;
    const prev = messages[idx - 1];
    const curr = messages[idx];
    return prev.sender.name === curr.sender.name;
  };

  return (
    <div css={css`display: flex; flex-direction: column; height: 100%;`}>
      {/* Incident header */}
      <div
        css={css`
          padding: 16px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          margin-bottom: 20px;
        `}
      >
        <div css={css`display: flex; align-items: center; gap: 10px; margin-bottom: 12px;`}>
          <span
            css={css`
              padding: 3px 8px;
              border-radius: 4px;
              background: rgba(240, 78, 152, 0.12);
              border: 1px solid rgba(240, 78, 152, 0.3);
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: #f04e98;
            `}
          >
            Active Incident
          </span>
          <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.25);`}>
            Investigation thread
          </span>
        </div>
        <h3
          css={css`
            font-size: 16px;
            font-weight: 600;
            color: #fff;
            margin: 0 0 14px 0;
          `}
        >
          {incidentTitle}
        </h3>
        {/* Participants bar */}
        <div css={css`display: flex; align-items: center; gap: 12px;`}>
          <span
            css={css`
              font-size: 11px;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: rgba(255, 255, 255, 0.25);
            `}
          >
            Participants
          </span>
          <div css={css`display: flex; align-items: center; gap: -4px;`}>
            {participants.map((p, i) => (
              <div
                key={p.name}
                css={css`
                  margin-left: ${i > 0 ? '-6px' : '0'};
                  position: relative;
                  z-index: ${participants.length - i};
                `}
                title={p.name}
              >
                <Avatar sender={p} size={26} />
              </div>
            ))}
          </div>
          <span css={css`font-size: 12px; color: rgba(255, 255, 255, 0.35);`}>
            {participants.length} in thread
          </span>
        </div>
      </div>

      {/* Thread messages */}
      <div css={css`display: flex; flex-direction: column; gap: 4px; flex: 1; overflow-y: auto;`}>
        {messages.map((msg, idx) => {
          const grouped = isSameSender(idx);
          const watchColor =
            msg.sender.type === 'watch' && msg.sender.watchType
              ? WATCH_CONFIGS[msg.sender.watchType].color
              : undefined;

          return (
            <div
              key={msg.id}
              css={css`
                animation: ${fadeIn} 0.25s ease both;
                animation-delay: ${idx * 0.05}s;
                padding: ${grouped ? '4px 0 4px 44px' : '14px 0 4px 0'};
              `}
            >
              {!grouped && (
                <div css={css`display: flex; align-items: center; gap: 10px; margin-bottom: 6px;`}>
                  <Avatar sender={msg.sender} />
                  <div css={css`display: flex; flex-direction: column;`}>
                    <span
                      css={css`
                        font-size: 13px;
                        font-weight: 600;
                        color: ${watchColor || '#fff'};
                      `}
                    >
                      {msg.sender.name}
                    </span>
                    <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.2);`}>
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              )}
              <div
                css={css`
                  margin-left: ${grouped ? '0' : '44px'};
                  font-size: 14px;
                  color: rgba(255, 255, 255, 0.6);
                  line-height: 1.7;
                  white-space: pre-wrap;
                  max-width: 680px;
                `}
              >
                {msg.text}
              </div>
              {msg.attachments && (
                <div
                  css={css`
                    margin-left: 44px;
                    margin-top: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                  `}
                >
                  {msg.attachments.map((att, i) => (
                    <ThreadAttachment
                      key={i}
                      attachment={att}
                      watchColor={watchColor || '#48efcf'}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

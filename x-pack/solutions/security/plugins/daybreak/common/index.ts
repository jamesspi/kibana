/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PLUGIN_ID = 'daybreak';
export const PLUGIN_NAME = 'Daybreak';
export const API_BASE = '/api/daybreak';

export type WatchType = 'watch_floor' | 'watch_officer' | 'dark_watch' | 'deep_watch';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'escalated';

export type AutonomyLevel = 'human_in_loop' | 'human_on_loop' | 'supervised_auto';

export interface WatchConfig {
  id: WatchType;
  name: string;
  tagline: string;
  tier: string;
  color: string;
  description: string;
  autonomyLevel: AutonomyLevel;
}

export interface ImpactMetrics {
  label: string;
  value: string;
  unit?: string;
}

export interface EvidenceSummary {
  rulesAnalyzed?: number;
  alertsProcessed?: number;
  groundTruthLabels?: number;
  mitreCoverage?: boolean;
  hostsInvestigated?: number;
  iocMatches?: number;
  timelineEvents?: number;
  queriesRun?: number;
}

export interface Proposal {
  id: string;
  watchType: WatchType;
  number: number;
  title: string;
  summary: string;
  confidence: number;
  status: ProposalStatus;
  createdAt: string;
  recommendation: string;
  impactMetrics: ImpactMetrics[];
  evidence: EvidenceSummary;
  reasoning?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface WatchStatus {
  id: WatchType;
  config: WatchConfig;
  state: 'active' | 'idle' | 'awaiting_approval';
  currentTask?: string;
  proposalsGenerated24h: number;
  proposalsApproved24h: number;
  proposalsRejected24h: number;
  lastActivity: string;
}

export const WATCH_CONFIGS: Record<WatchType, WatchConfig> = {
  watch_floor: {
    id: 'watch_floor',
    name: 'Watch Floor',
    tagline: 'The floor never sleeps.',
    tier: 'Augments Tier 1',
    color: '#48EFCF',
    description: 'Alert triage, FP reduction, enrichment & routing',
    autonomyLevel: 'human_on_loop',
  },
  watch_officer: {
    id: 'watch_officer',
    name: 'Watch Officer',
    tagline: 'Builds the case. You make the call.',
    tier: 'Augments Tier 2',
    color: '#6AADFF',
    description: 'Case investigation, incident response, detection tuning',
    autonomyLevel: 'human_in_loop',
  },
  dark_watch: {
    id: 'dark_watch',
    name: 'Dark Watch',
    tagline: 'Hunts while you sleep.',
    tier: 'Augments Tier 3',
    color: '#FEC514',
    description: 'Autonomous threat hunting, detection engineering, adversary attribution',
    autonomyLevel: 'supervised_auto',
  },
  deep_watch: {
    id: 'deep_watch',
    name: 'Deep Watch',
    tagline: 'Specialist capability, always.',
    tier: 'Augments Specialist',
    color: '#F04E98',
    description: 'Forensic investigation, AI threat detection, attack simulation',
    autonomyLevel: 'human_in_loop',
  },
};

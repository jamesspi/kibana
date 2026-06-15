/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IRouter, Logger } from '@kbn/core/server';
import { API_BASE } from '../../common';
import type { Proposal, ProposalStatus, WatchStatus } from '../../common';

export const registerProposalRoutes = (router: IRouter, logger: Logger) => {
  router.get(
    {
      path: `${API_BASE}/proposals`,
      security: { authz: { requiredPrivileges: ['daybreak'] } },
      validate: {},
    },
    async (_context, _request, response) => {
      return response.ok({ body: { proposals: MOCK_PROPOSALS } });
    }
  );

  router.get(
    {
      path: `${API_BASE}/proposals/{id}`,
      security: { authz: { requiredPrivileges: ['daybreak'] } },
      validate: {
        params: schema.object({ id: schema.string() }),
      },
    },
    async (_context, request, response) => {
      const proposal = MOCK_PROPOSALS.find((p) => p.id === request.params.id);
      if (!proposal) {
        return response.notFound();
      }
      return response.ok({ body: proposal });
    }
  );

  router.post(
    {
      path: `${API_BASE}/proposals/{id}/action`,
      security: { authz: { requiredPrivileges: ['daybreak'] } },
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          action: schema.oneOf([
            schema.literal('approve'),
            schema.literal('reject'),
            schema.literal('modify'),
            schema.literal('escalate'),
          ]),
        }),
      },
    },
    async (_context, request, response) => {
      const proposal = MOCK_PROPOSALS.find((p) => p.id === request.params.id);
      if (!proposal) {
        return response.notFound();
      }

      const statusMap: Record<string, ProposalStatus> = {
        approve: 'approved',
        reject: 'rejected',
        modify: 'modified',
        escalate: 'escalated',
      };

      proposal.status = statusMap[request.body.action];
      logger.info(`Proposal ${proposal.id} action: ${request.body.action}`);

      return response.ok({ body: proposal });
    }
  );

  router.get(
    {
      path: `${API_BASE}/watches`,
      security: { authz: { requiredPrivileges: ['daybreak'] } },
      validate: {},
    },
    async (_context, _request, response) => {
      return response.ok({ body: { watches: MOCK_WATCH_STATUSES } });
    }
  );
};

const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 'prop-001',
    watchType: 'watch_floor',
    number: 3429,
    title: 'Suppress 12 noisy detection rules',
    summary:
      '12 rules across endpoint and identity generate 340 alerts/day. Over 90 days, 99.4% were false positives from a known background scanning service. Tuning recovers ~6.5 hrs of analyst time per week with zero observed coverage loss in MITRE TTPs.',
    confidence: 94,
    status: 'pending',
    createdAt: '4m ago',
    recommendation:
      'Apply tuning with 30-day rollback window. Watch Floor will monitor for regressions and auto-revert if coverage drops.',
    impactMetrics: [
      { label: 'Alerts/day', value: '-340' },
      { label: 'Hours/wk recovered', value: '~6.5' },
      { label: 'Coverage delta', value: '0' },
    ],
    evidence: { rulesAnalyzed: 12, alertsProcessed: 30600, groundTruthLabels: 18, mitreCoverage: true },
    severity: 'medium',
  },
  {
    id: 'prop-002',
    watchType: 'watch_floor',
    number: 3430,
    title: 'Escalate credential stuffing campaign to Tier 2',
    summary:
      'Detected coordinated credential stuffing against Azure AD from 47 source IPs across 3 ASNs. 2,341 failed auth attempts in 4 hours targeting 89 unique accounts. 3 accounts show successful login followed by MFA bypass attempt.',
    confidence: 91,
    status: 'pending',
    createdAt: '12m ago',
    recommendation:
      'Escalate to Watch Officer for incident response. Recommend immediate conditional access policy enforcement and affected account review.',
    impactMetrics: [
      { label: 'Accounts targeted', value: '89' },
      { label: 'Compromised (likely)', value: '3' },
      { label: 'Source IPs', value: '47' },
    ],
    evidence: { alertsProcessed: 2341, hostsInvestigated: 3, iocMatches: 47 },
    severity: 'high',
  },
  {
    id: 'prop-003',
    watchType: 'watch_officer',
    number: 3431,
    title: 'Contain lateral movement from compromised service account',
    summary:
      'Service account svc-backup-prod authenticated to 14 hosts it has never accessed before, executed PowerShell encoded commands on 6, and attempted to access the domain controller.',
    confidence: 88,
    status: 'pending',
    createdAt: '28m ago',
    recommendation:
      'Disable svc-backup-prod immediately. Isolate the 6 hosts with confirmed code execution. Begin forensic timeline on DC access attempt.',
    impactMetrics: [
      { label: 'Hosts accessed', value: '14' },
      { label: 'Code execution', value: '6' },
      { label: 'Time to contain', value: '~8 min' },
    ],
    evidence: { hostsInvestigated: 14, timelineEvents: 847, alertsProcessed: 23, queriesRun: 12 },
    severity: 'critical',
  },
  {
    id: 'prop-005',
    watchType: 'dark_watch',
    number: 3433,
    title: 'New threat hunt finding: SolarWinds-style supply chain staging',
    summary:
      'Autonomous hunt based on latest CISA advisory found 2 hosts with DLL side-loading patterns matching supply chain technique. Binary analysis shows modified legitimate updater with injected reflective loader.',
    confidence: 76,
    status: 'pending',
    createdAt: '2h ago',
    recommendation:
      'Immediately isolate both affected hosts. Collect forensic images before remediation. Escalate to Deep Watch for binary analysis.',
    impactMetrics: [
      { label: 'Hosts affected', value: '2' },
      { label: 'Dwell time (est.)', value: '~14 days' },
      { label: 'MITRE techniques', value: '4' },
    ],
    evidence: { hostsInvestigated: 2, iocMatches: 7, timelineEvents: 2341, queriesRun: 34 },
    severity: 'critical',
  },
  {
    id: 'prop-007',
    watchType: 'deep_watch',
    number: 3435,
    title: 'Forensic report: Root cause of March 2 breach identified',
    summary:
      'Full forensic analysis complete. Root cause: compromised third-party VPN appliance (CVE-2024-21762). Attacker exfiltrated 2.3GB over DNS tunneling attributed to APT41.',
    confidence: 92,
    status: 'pending',
    createdAt: '5h ago',
    recommendation:
      'Publish incident report. Patch remaining FortiGate appliances. Deploy DNS tunneling detection rule. Add APT41 indicators to blocklist.',
    impactMetrics: [
      { label: 'Data exfiltrated', value: '2.3 GB' },
      { label: 'Dwell time', value: '23 days' },
      { label: 'Systems affected', value: '7' },
    ],
    evidence: { hostsInvestigated: 7, timelineEvents: 14832, iocMatches: 23, queriesRun: 67 },
    severity: 'critical',
  },
];

const MOCK_WATCH_STATUSES: WatchStatus[] = [
  {
    id: 'watch_floor',
    config: {
      id: 'watch_floor',
      name: 'Watch Floor',
      tagline: 'The floor never sleeps.',
      tier: 'Augments Tier 1',
      color: '#48EFCF',
      description: 'Alert triage, FP reduction, enrichment & routing',
      autonomyLevel: 'human_on_loop',
    },
    state: 'active',
    currentTask: 'Triaging 23 new alerts from endpoint detection rules',
    proposalsGenerated24h: 12,
    proposalsApproved24h: 9,
    proposalsRejected24h: 1,
    lastActivity: '2m ago',
  },
  {
    id: 'watch_officer',
    config: {
      id: 'watch_officer',
      name: 'Watch Officer',
      tagline: 'Builds the case. You make the call.',
      tier: 'Augments Tier 2',
      color: '#6AADFF',
      description: 'Case investigation, incident response, detection tuning',
      autonomyLevel: 'human_in_loop',
    },
    state: 'awaiting_approval',
    currentTask: 'Awaiting approval on lateral movement containment (Proposal #3431)',
    proposalsGenerated24h: 4,
    proposalsApproved24h: 2,
    proposalsRejected24h: 0,
    lastActivity: '28m ago',
  },
  {
    id: 'dark_watch',
    config: {
      id: 'dark_watch',
      name: 'Dark Watch',
      tagline: 'Hunts while you sleep.',
      tier: 'Augments Tier 3',
      color: '#FEC514',
      description: 'Autonomous threat hunting, detection engineering, adversary attribution',
      autonomyLevel: 'supervised_auto',
    },
    state: 'active',
    currentTask: 'Running hypothesis hunt: Living-off-the-land binaries in CI/CD pipelines',
    proposalsGenerated24h: 3,
    proposalsApproved24h: 2,
    proposalsRejected24h: 0,
    lastActivity: '45m ago',
  },
  {
    id: 'deep_watch',
    config: {
      id: 'deep_watch',
      name: 'Deep Watch',
      tagline: 'Specialist capability, always.',
      tier: 'Augments Specialist',
      color: '#F04E98',
      description: 'Forensic investigation, AI threat detection, attack simulation',
      autonomyLevel: 'human_in_loop',
    },
    state: 'active',
    currentTask: 'Analyzing memory dump from isolated host dev-ws-14',
    proposalsGenerated24h: 2,
    proposalsApproved24h: 1,
    proposalsRejected24h: 0,
    lastActivity: '1h ago',
  },
];

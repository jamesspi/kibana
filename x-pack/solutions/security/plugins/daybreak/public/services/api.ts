/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';
import type { Proposal, WatchStatus } from '../../common';
import { API_BASE } from '../../common';

export class DaybreakService {
  constructor(private readonly http: HttpStart) {}

  async getProposals(): Promise<Proposal[]> {
    const { proposals } = await this.http.get<{ proposals: Proposal[] }>(
      `${API_BASE}/proposals`
    );
    return proposals;
  }

  async getProposal(id: string): Promise<Proposal> {
    return await this.http.get<Proposal>(`${API_BASE}/proposals/${id}`);
  }

  async actionProposal(
    id: string,
    action: 'approve' | 'reject' | 'modify' | 'escalate'
  ): Promise<Proposal> {
    return await this.http.post<Proposal>(`${API_BASE}/proposals/${id}/action`, {
      body: JSON.stringify({ action }),
    });
  }

  async getWatches(): Promise<WatchStatus[]> {
    const { watches } = await this.http.get<{ watches: WatchStatus[] }>(
      `${API_BASE}/watches`
    );
    return watches;
  }
}

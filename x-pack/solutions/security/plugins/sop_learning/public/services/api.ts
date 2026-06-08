/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import type {
  RecordingSession,
  RecordedEvent,
  SynthesizedSOP,
  SimilarSOP,
  OverviewMetrics,
  WorkflowToolProposal,
} from '../../common';
import { API_BASE } from '../../common';

/** A skill PREVIEW dry-run result returned by POST /sops/{id}/preview. */
export interface SkillPreviewResult {
  dry_run: boolean;
  read_only: boolean;
  tools_used: string[];
  tools_excluded_for_safety: string[];
  sample_input: string;
  tool_calls: Array<{ tool_id: string; params?: unknown; result_summary?: string }>;
  final_message: string;
}

export class SopLearningService {
  constructor(private http: HttpSetup) {}

  // Sessions
  async getSessions(status?: string): Promise<RecordingSession[]> {
    const query = status ? { status } : {};
    const resp = await this.http.get<{ sessions: RecordingSession[] }>(`${API_BASE}/sessions`, {
      query,
    });
    return resp.sessions;
  }

  async getSession(
    sessionId: string
  ): Promise<{ session: RecordingSession; events: RecordedEvent[] }> {
    return this.http.get(`${API_BASE}/sessions/${sessionId}`);
  }

  /** Update editable session metadata (workflow label / type). */
  async updateSession(
    sessionId: string,
    patch: { workflow_label?: string; workflow_type?: string }
  ): Promise<RecordingSession> {
    const resp = await this.http.patch<{ session: RecordingSession }>(
      `${API_BASE}/sessions/${sessionId}`,
      { body: JSON.stringify(patch) }
    );
    return resp.session;
  }

  /**
   * Delete a session AND cascade-delete its events, media, and embedding.
   * Returns the per-index deletion counts the server reports.
   */
  async deleteSession(
    sessionId: string
  ): Promise<{ deleted: boolean; events_deleted: number; media_deleted: number }> {
    return this.http.delete(`${API_BASE}/sessions/${sessionId}`);
  }

  /**
   * Bulk-delete sessions AND cascade-delete their events, media, and embeddings.
   * Uses POST `_bulk_delete` (DELETE bodies are unreliable across HTTP layers).
   */
  async bulkDeleteSessions(
    ids: string[]
  ): Promise<{ deleted: number; events_deleted: number; media_deleted: number }> {
    return this.http.post(`${API_BASE}/sessions/_bulk_delete`, {
      body: JSON.stringify({ ids }),
    });
  }

  async getAuditSessions(hours = 24, user?: string): Promise<any[]> {
    const query: any = { hours };
    if (user) query.user = user;
    const resp = await this.http.get<{ sessions: any[] }>(`${API_BASE}/sessions/from-audit`, {
      query,
    });
    return resp.sessions;
  }

  // Recording
  async startRecording(workflowType: string, workflowLabel: string): Promise<RecordingSession> {
    const resp = await this.http.post<{ session: RecordingSession }>(
      `${API_BASE}/recording/start`,
      {
        body: JSON.stringify({ workflow_type: workflowType, workflow_label: workflowLabel }),
      }
    );
    return resp.session;
  }

  async recordEvent(
    sessionId: string,
    event: {
      event_type: string;
      category: string;
      description: string;
      details?: Record<string, unknown>;
      narration?: string;
    }
  ): Promise<void> {
    await this.http.post(`${API_BASE}/recording/event`, {
      body: JSON.stringify({ session_id: sessionId, ...event }),
    });
  }

  async stopRecording(sessionId: string): Promise<void> {
    await this.http.post(`${API_BASE}/recording/stop`, {
      body: JSON.stringify({ session_id: sessionId }),
    });
    // Fire-and-forget: kick off automatic vectorization of the session. Never
    // let an embedding failure surface to the user or block the stop flow.
    this.embedSession(sessionId).catch(() => {});
  }

  async addNarration(sessionId: string, text: string, contextEventType?: string): Promise<void> {
    await this.http.post(`${API_BASE}/recording/narrate`, {
      body: JSON.stringify({ session_id: sessionId, text, context_event_type: contextEventType }),
    });
  }

  /**
   * Record a browser-transcribed voice segment. `text` is the recognized
   * speech; `audioStartMs`/`audioEndMs` are offsets (ms) from the start of the
   * recording so synthesis can cite "voice 5s–20s". Stored as a narration-type
   * event with source 'voice'.
   */
  async addVoiceTranscript(
    sessionId: string,
    text: string,
    audioStartMs: number,
    audioEndMs: number
  ): Promise<void> {
    await this.http.post(`${API_BASE}/recording/narrate`, {
      body: JSON.stringify({
        session_id: sessionId,
        text,
        source: 'voice',
        audio_start_ms: audioStartMs,
        audio_end_ms: audioEndMs,
      }),
    });
  }

  // Synthesis
  async synthesize(
    sessionIds: string[],
    name: string,
    connectorId: string,
    description?: string
  ): Promise<SynthesizedSOP> {
    const resp = await this.http.post<{ sop: SynthesizedSOP }>(`${API_BASE}/synthesize`, {
      body: JSON.stringify({
        session_ids: sessionIds,
        name,
        description,
        connector_id: connectorId,
      }),
    });
    return resp.sop;
  }

  async getSOPs(): Promise<SynthesizedSOP[]> {
    const resp = await this.http.get<{ sops: SynthesizedSOP[] }>(`${API_BASE}/sops`);
    return resp.sops;
  }

  /** Fetch a single SOP (used to refresh detail after an edit / re-synthesis). */
  async getSOP(sopId: string): Promise<SynthesizedSOP> {
    const resp = await this.http.get<{ sop: SynthesizedSOP }>(`${API_BASE}/sops/${sopId}`);
    return resp.sop;
  }

  /** Update a SOP's name and/or description (steps/outputs are preserved). */
  async updateSOP(
    sopId: string,
    patch: { name?: string; description?: string }
  ): Promise<SynthesizedSOP> {
    const resp = await this.http.patch<{ sop: SynthesizedSOP }>(`${API_BASE}/sops/${sopId}`, {
      body: JSON.stringify(patch),
    });
    return resp.sop;
  }

  /** Delete a SOP (its in-doc embedding vector goes with it). */
  async deleteSOP(sopId: string): Promise<{ deleted: boolean }> {
    return this.http.delete(`${API_BASE}/sops/${sopId}`);
  }

  /** Bulk-delete SOPs (each SOP's in-doc embedding vector goes with it). */
  async bulkDeleteSOPs(ids: string[]): Promise<{ deleted: number }> {
    return this.http.post(`${API_BASE}/sops/_bulk_delete`, {
      body: JSON.stringify({ ids }),
    });
  }

  /**
   * Re-run synthesis from the SOP's source sessions with a (possibly new)
   * connector, replacing the SOP in place. Returns the freshly synthesized SOP.
   */
  async resynthesizeSOP(
    sopId: string,
    body: { connector_id: string; name?: string; description?: string }
  ): Promise<SynthesizedSOP> {
    const resp = await this.http.post<{ sop: SynthesizedSOP }>(
      `${API_BASE}/sops/${sopId}/resynthesize`,
      { body: JSON.stringify(body) }
    );
    return resp.sop;
  }

  /**
   * Propose gap-filling workflow tools for a SOP's capability-gap steps
   * (non-destructive — nothing is created). Each proposal carries the Workflow
   * YAML and the tool_id it would be registered under.
   */
  async proposeGapFills(sopId: string): Promise<WorkflowToolProposal[]> {
    const resp = await this.http.post<{ proposals: WorkflowToolProposal[] }>(
      `${API_BASE}/sops/${sopId}/gap-fills`
    );
    return resp.proposals;
  }

  /**
   * Create a chosen gap fill: saves the Workflow and registers it as an Agent
   * Builder workflow tool, then points the gap step at the new tool_id.
   */
  async createGapFill(
    sopId: string,
    proposal: WorkflowToolProposal
  ): Promise<{ created: boolean; workflow_id: string; tool_id: string; step_id: string }> {
    return this.http.post(`${API_BASE}/sops/${sopId}/gap-fills/create`, {
      body: JSON.stringify({
        step_id: proposal.step_id,
        workflow_id: proposal.workflow_id,
        tool_id: proposal.tool_id,
        yaml: proposal.yaml,
        description: proposal.description,
      }),
    });
  }

  /**
   * Run a READ-ONLY skill dry-run via the Agent Builder converse engine. Only
   * the SOP's read-only tools are enabled, so no write/isolate/case-create tool
   * can fire. Returns the agent's tool calls + final message.
   */
  async previewSkill(
    sopId: string,
    connectorId: string,
    sampleInput?: string
  ): Promise<SkillPreviewResult> {
    return this.http.post(`${API_BASE}/sops/${sopId}/preview`, {
      body: JSON.stringify({ connector_id: connectorId, sample_input: sampleInput }),
    });
  }

  /**
   * List AI/generative connectors the user can pick for synthesis. Hits
   * Kibana's standard Actions connectors API and filters to connector types
   * that can drive an LLM (gen-ai, bedrock, inference). Vision-capable
   * connectors (the OpenAI-compatible inference path) are flagged so the UI
   * can indicate which support screen-frame analysis.
   */
  async getConnectors(): Promise<
    Array<{ id: string; name: string; connectorTypeId: string; visionCapable: boolean }>
  > {
    const all = await this.http.get<
      Array<{ id: string; name: string; connector_type_id: string }>
    >(`/api/actions/connectors`);
    const AI_TYPES = ['.gen-ai', '.bedrock', '.inference'];
    // The OpenAI-compatible inference path forwards image content parts, so
    // .gen-ai (OpenAI/Azure/other) and .inference (EIS) connectors can carry
    // screen frames to a vision model. Native .bedrock expects bare base64 and
    // is treated as non-vision here.
    const VISION_TYPES = ['.gen-ai', '.inference'];
    return (all ?? [])
      .filter((c) => AI_TYPES.includes(c.connector_type_id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        connectorTypeId: c.connector_type_id,
        visionCapable: VISION_TYPES.includes(c.connector_type_id),
      }));
  }

  /** Aggregated metrics for the Overview dashboard. */
  async getOverview(): Promise<OverviewMetrics> {
    return this.http.get<OverviewMetrics>(`${API_BASE}/overview`);
  }


  // Embeddings / similarity
  async embedSession(sessionId: string): Promise<{ embedded: boolean; reason?: string }> {
    return this.http.post(`${API_BASE}/embed/auto`, {
      body: JSON.stringify({ session_id: sessionId }),
    });
  }

  async searchSessions(
    query: string,
    size = 10
  ): Promise<{
    results: Array<{
      session_id: string;
      workflow_type?: string;
      workflow_label?: string;
      summary?: string;
      score?: number;
    }>;
    embedding_available: boolean;
  }> {
    return this.http.post(`${API_BASE}/search/sessions`, {
      body: JSON.stringify({ query, size }),
    });
  }

  async findSimilarSOPs(
    sessionIds: string[],
    size = 5
  ): Promise<{
    similar: SimilarSOP[];
    embedding_available: boolean;
  }> {
    return this.http.post(`${API_BASE}/similar`, {
      body: JSON.stringify({ session_ids: sessionIds, size }),
    });
  }

  // Deploy
  async deploySkill(skill: {
    id: string;
    name: string;
    description: string;
    content: string;
    tool_ids?: string[];
  }): Promise<any> {
    return this.http.post(`${API_BASE}/deploy/skill`, {
      body: JSON.stringify(skill),
    });
  }

  async deployWorkflow(yaml: string, id?: string): Promise<any> {
    return this.http.post(`${API_BASE}/deploy/workflow`, {
      body: JSON.stringify({ id, yaml }),
    });
  }

  // Media
  // A screen recording can be many MB; base64-encoding inflates it ~33% more.
  // We split the encoded payload into ~4MB chunks and upload each as its own
  // request/document so neither Kibana's HTTP payload limit nor a single ES
  // document is ever exceeded. The server reassembles the chunks on read.
  async uploadMedia(sessionId: string, blob: Blob, mediaType: 'video' | 'audio'): Promise<void> {
    const data_base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read media blob'));
      reader.readAsDataURL(blob);
    });

    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB of base64 per request
    const totalChunks = Math.max(1, Math.ceil(data_base64.length / CHUNK_SIZE));
    const mediaId = `${sessionId}-${mediaType}-${Date.now()}`;

    for (let i = 0; i < totalChunks; i++) {
      const chunk = data_base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await this.http.post(`${API_BASE}/media/upload`, {
        body: JSON.stringify({
          session_id: sessionId,
          media_type: mediaType,
          data_base64: chunk,
          media_id: mediaId,
          chunk_index: i,
          total_chunks: totalChunks,
        }),
      });
    }
  }

  async getMedia(
    sessionId: string
  ): Promise<Array<{ media_type: string; size_bytes: number; data_base64: string }>> {
    const resp = await this.http.get<{ media: any[] }>(`${API_BASE}/media/${sessionId}`);
    return resp.media;
  }

  /**
   * Upload a single screen keyframe (downscaled JPEG data URL) captured during
   * recording. `timestampMs` is the offset from recording start so synthesis can
   * correlate the frame with event timestamps and cite "screen frame @ MM:SS".
   * Frames are small enough to fit in one request, so no chunking is needed.
   */
  async uploadFrame(sessionId: string, dataUrl: string, timestampMs: number): Promise<void> {
    // dataUrl looks like "data:image/jpeg;base64,<...>". Split off the prefix so
    // we store raw base64 (matching how video/audio chunks are stored) plus the
    // mime type separately for the synthesis route to rebuild a data URL.
    const commaIdx = dataUrl.indexOf(',');
    const header = dataUrl.slice(0, commaIdx);
    const data_base64 = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+);/);
    const mime_type = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    await this.http.post(`${API_BASE}/media/upload`, {
      body: JSON.stringify({
        session_id: sessionId,
        media_type: 'frame',
        data_base64,
        media_id: `${sessionId}-frame-${timestampMs}`,
        chunk_index: 0,
        total_chunks: 1,
        timestamp_ms: timestampMs,
        mime_type,
      }),
    });
  }
}

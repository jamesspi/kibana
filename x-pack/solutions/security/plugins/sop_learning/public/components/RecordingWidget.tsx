/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  EuiButtonEmpty,
  EuiPopover,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonIcon,
  EuiText,
  EuiFieldText,
  EuiFormRow,
  EuiComboBox,
  EuiSpacer,
  EuiSwitch,
  EuiCallOut,
  EuiIconTip,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import type { SopLearningService } from '../services/api';
import { SOP_TYPE_PRESETS } from '../../common';

interface Props {
  service: SopLearningService;
}

// Minimal typings for the browser Web Speech API (not in lib.dom for all TS
// configs). We only use the bits we need. This is the REAL transcription path
// in this environment: Elasticsearch has no speech-to-text inference task type
// (only chat_completion / completion / embedding / rerank), so spoken audio is
// transcribed live in the browser as the analyst talks.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Map a getUserMedia/MediaRecorder failure to a clear, accurate message. We
 * deliberately do NOT say "permission blocked" for every failure: with the mic
 * permission granted, a failure is almost always something else (device busy,
 * no device, gesture issue), and showing "blocked" would be misleading.
 */
function micErrorMessage(err: { name: string; message: string }): string {
  switch (err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was denied by the browser. Check the site permission for this origin and try again.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Microphone is in use by another app or tab (device busy). Close the other user of the mic, then restart recording.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone device was found. Connect a microphone and restart recording.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'The microphone could not satisfy the requested constraints. Restart recording to retry with defaults.';
    default:
      return `Microphone could not be acquired (${err.name}: ${err.message}). Audio is not being captured.`;
  }
}

/**
 * Collapse long runs of the same repeated word into "word ×N" so the live
 * interim transcript stays readable when continuous recognition stutters
 * (e.g. "hey hey hey hey hey" → "hey ×5").
 */
function collapseRepeats(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return text;
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let run = 1;
    while (i + run < words.length && words[i + run].toLowerCase() === words[i].toLowerCase()) {
      run++;
    }
    out.push(run >= 4 ? `${words[i]} ×${run}` : Array(run).fill(words[i]).join(' '));
    i += run;
  }
  return out.join(' ');
}

/**
 * Persistent "Record SOP" control rendered into the Kibana chrome header via
 * `chrome.navControls.registerRight`. Because it lives in chrome rather than the
 * SOP Learning app bundle, recording continues across page navigations.
 *
 * Capture logic mirrors `RecordingOverlay.tsx`: it intercepts `window.fetch`
 * for known Security API calls, listens for clicks via `data-test-subj`, and
 * polls the URL for navigation changes.
 */
export function RecordingWidget({ service }: Props) {
  const { euiTheme } = useEuiTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [narration, setNarration] = useState('');
  const [screenActive, setScreenActive] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [wantScreen, setWantScreen] = useState(true);
  const [wantVoice, setWantVoice] = useState(true);
  // SOP type + label chosen at record time (presets + free-text).
  const [sopType, setSopType] = useState<string>('alert_triage');
  const [sessionLabel, setSessionLabel] = useState<string>('');
  // When microphone acquisition (getUserMedia) genuinely fails, the REAL error
  // name/message (NotAllowedError, NotReadableError, NotFoundError,
  // OverconstrainedError, SecurityError, ...). Distinct from sttRuntimeError,
  // which is about live transcription, not the mic itself. Differentiating
  // these is the whole point: a granted-but-failing mic must NOT show the same
  // "blocked" copy as a missing permission.
  const [voiceError, setVoiceError] = useState<{ name: string; message: string } | null>(null);
  // Live transcription state: count of recognized voice segments and whether
  // the browser actually supports the Web Speech API.
  const [transcriptCount, setTranscriptCount] = useState(0);
  const [sttSupported] = useState(() => getSpeechRecognitionCtor() !== null);
  // Set when speech recognition is supported but fails at runtime (e.g. the
  // browser's speech backend is unreachable: 'network', or mic access was
  // blocked: 'not-allowed'/'service-not-allowed'). Lets the UI honestly say
  // "voice not transcribed" instead of silently showing 0 transcripts.
  const [sttRuntimeError, setSttRuntimeError] = useState<string | null>(null);
  // Finalized transcript segments captured this recording, shown live in the
  // popover so the analyst SEES voice working as they speak (this is the
  // immediate visible feedback the prior UI lacked).
  const [transcripts, setTranscripts] = useState<string[]>([]);
  // The current in-progress (interim) recognition text, shown italic/greyed
  // until it finalizes into a segment above.
  const [interim, setInterim] = useState('');
  // Persistent, visible error when the recording session itself could not be
  // created (e.g. the logged-in user lacks ES write access to sop-learning-*
  // indices and the server returns 500 security_exception). A dismissible
  // alert() was too easy to miss — this stays in the popover until cleared.
  const [startError, setStartError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const originalFetchRef = useRef<typeof fetch | null>(null);
  const lastCapturedUrlRef = useRef(window.location.href);
  const urlIntervalRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const clickListenerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const screenChunks = useRef<Blob[]>([]);
  const voiceChunks = useRef<Blob[]>([]);
  // Screen KEYFRAME capture. A hidden <video> is bound to the screen
  // MediaStream and drawn onto a <canvas> every FRAME_INTERVAL_MS (and once on
  // key events) to grab a downscaled JPEG. Frames are uploaded live as
  // media_type:'frame' docs tagged with their offset from recording start, so
  // synthesis can send them to a vision model and cite "screen frame @MM:SS".
  // This is SEPARATE from the screen *video* .webm — the raw video is never
  // analyzed; these periodic frames are what actually drive multimodal
  // synthesis. (Previously only the unmounted RecordingOverlay had this, so
  // real recordings via this header widget produced zero frames.)
  const frameVideoRef = useRef<HTMLVideoElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const [frameCount, setFrameCount] = useState(0);
  // Web Speech API recognition + the wall-clock time recording started, so we
  // can convert recognition events into offsets (ms from start). `recognizing`
  // tracks whether we intentionally keep recognition alive (it auto-stops after
  // pauses, so we restart it until the analyst stops recording).
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordStartMsRef = useRef<number>(0);
  const recognizingRef = useRef<boolean>(false);
  const segmentStartMsRef = useRef<number | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const captureEvent = useCallback(
    async (
      eventType: string,
      category: string,
      description: string,
      details?: Record<string, unknown>
    ) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await service.recordEvent(sid, { event_type: eventType, category, description, details });
        setEventCount((c) => c + 1);
      } catch {
        // ignore capture failures
      }
    },
    [service]
  );

  const startCapture = useCallback(() => {
    originalFetchRef.current = window.fetch;
    const origFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const [input, init] = args;
      const url = typeof input === 'string' ? input : (input as Request).url;
      const method = init?.method?.toUpperCase() ?? (typeof input !== 'string' ? (input as Request).method?.toUpperCase() : 'GET') ?? 'GET';

      // Pre-extract body text for ES|QL interception BEFORE origFetch consumes
      // the Request body. Kibana's http service passes a Request object (not a
      // string+init), so the body lives on the Request itself.
      let esqlBodyText: string | undefined;
      if (url.includes('/internal/search/esql')) {
        try {
          if (init?.body) {
            esqlBodyText = typeof init.body === 'string' ? init.body : undefined;
          } else if (typeof input !== 'string' && (input as Request).body) {
            esqlBodyText = await (input as Request).clone().text();
          }
        } catch {
          // ignore
        }
      }

      const result = await origFetch.apply(window, args);

      if (esqlBodyText) {
        try {
          const b = JSON.parse(esqlBodyText);
          const q = b?.params?.query ?? b?.query;
          if (q) {
            captureEvent('query.esql', 'query', `ES|QL: ${q.slice(0, 150)}`, { query_text: q });
            captureFrameRef.current();
          }
        } catch {
          // ignore parse errors
        }
      }
      if (url.includes('/api/detection_engine/signals') && method === 'POST')
        captureEvent('alert.searched', 'alert', 'Searched alerts');
      if (url.includes('/api/cases') && method === 'POST' && !url.includes('_find'))
        captureEvent('case.created', 'case', 'Created case');
      if (url.includes('/api/endpoint/action/') && method === 'POST')
        captureEvent('response_action.executed', 'response', 'Response action executed');
      if (url.includes('/api/detection_engine/signals/status') && method === 'POST')
        captureEvent('alert.status_changed', 'alert', 'Alert status changed');
      return result;
    };

    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const el = target.closest(
        '[data-test-subj], [aria-label], button, a, [role="row"]'
      ) as HTMLElement;
      if (!el) return;
      const subj = el.getAttribute('data-test-subj') ?? '';
      const aria = el.getAttribute('aria-label') ?? '';
      const text = (el.textContent ?? '').trim().slice(0, 80);
      if (subj.includes('sopLearning') || text.length < 2) return;
      let desc = '';
      let evType = 'ui.click';
      let cat = 'interaction';
      if (subj.includes('alert') || el.closest('[data-test-subj*="alert"]')) {
        evType = 'alert.clicked';
        cat = 'alert';
        desc = `Alert: ${text.slice(0, 60)}`;
      } else if (el.closest('.euiFlyout')) {
        evType = 'flyout.click';
        cat = 'alert';
        desc = `Flyout: ${aria || text.slice(0, 60)}`;
      } else if (el.closest('tr,[role="row"]')) {
        evType = 'table.row_clicked';
        desc = `Row: ${text.slice(0, 80)}`;
      } else if (el.tagName === 'BUTTON') {
        desc = `Button: ${aria || text.slice(0, 60)}`;
      } else {
        desc = `Click: ${aria || text.slice(0, 60)}`;
      }
      if (desc) captureEvent(evType, cat, desc, { test_subj: subj || undefined });
      // Grab a frame on high-signal clicks (alerts, flyouts, rows) so the
      // screen state the analyst just acted on is captured for vision.
      if (evType === 'alert.clicked' || evType === 'flyout.click' || evType === 'table.row_clicked') {
        captureFrameRef.current();
      }
    };
    document.addEventListener('click', clickHandler, true);
    clickListenerRef.current = clickHandler;

    lastCapturedUrlRef.current = window.location.href;
    urlIntervalRef.current = window.setInterval(() => {
      const cur = window.location.href;
      if (cur !== lastCapturedUrlRef.current) {
        lastCapturedUrlRef.current = cur;
        const m = cur.match(/\/app\/security\/([^/?#]+)/);
        if (m) {
          captureEvent('navigation.changed', 'navigation', `Navigated to: security/${m[1]}`);
          // New page → grab a frame after it has a moment to render.
          window.setTimeout(() => captureFrameRef.current(), 1200);
        }
      }
    }, 1000);
  }, [captureEvent]);

  const stopCapture = useCallback(() => {
    if (originalFetchRef.current) {
      window.fetch = originalFetchRef.current;
      originalFetchRef.current = null;
    }
    if (clickListenerRef.current) {
      document.removeEventListener('click', clickListenerRef.current, true);
      clickListenerRef.current = null;
    }
    if (urlIntervalRef.current) {
      clearInterval(urlIntervalRef.current);
      urlIntervalRef.current = null;
    }
  }, []);

  // Screen keyframe cadence + downscaled-frame limits. A ~6s cadence with a
  // 1280px-wide JPEG keeps per-session payloads modest while giving the vision
  // model enough temporal coverage (synthesis later caps how many are actually
  // sent to the model). Frames are also grabbed on key UI events (see
  // captureEvent) so the moments that matter are always covered.
  const FRAME_INTERVAL_MS = 6000;
  const FRAME_MAX_WIDTH = 1280;
  const FRAME_JPEG_QUALITY = 0.7;
  const FRAME_MIN_GAP_MS = 1500; // throttle event-driven frames
  const FRAME_MAX_PER_SESSION = 80; // hard stop so a long session can't flood ES
  const lastFrameMsRef = useRef(0);

  // Draw the current screen frame to a canvas (downscaled) and upload it as a
  // JPEG data URL tagged with its offset from recording start. Best-effort:
  // never let a capture/upload failure interrupt recording.
  const captureFrame = useCallback(async () => {
    const sid = sessionIdRef.current;
    const video = frameVideoRef.current;
    const canvas = frameCanvasRef.current;
    if (!sid || !video || !canvas) return;
    if (!video.videoWidth || !video.videoHeight) return;
    if (frameCountRef.current >= FRAME_MAX_PER_SESSION) return;
    const sinceStart = Date.now() - recordStartMsRef.current;
    if (sinceStart - lastFrameMsRef.current < FRAME_MIN_GAP_MS && lastFrameMsRef.current > 0) {
      return; // too soon after the previous frame
    }

    const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY);
      const timestampMs = Math.max(0, sinceStart);
      lastFrameMsRef.current = timestampMs;
      frameCountRef.current += 1;
      setFrameCount(frameCountRef.current);
      await service.uploadFrame(sid, dataUrl, timestampMs);
    } catch (e) {
      // Tainted canvas, decode hiccup, or upload error — skip this frame.
      // eslint-disable-next-line no-console
      console.warn('SOP Learning: keyframe capture skipped', e);
    }
  }, [service]);
  // Keep the latest captureFrame in a ref so the event handler / interval can
  // call it without re-subscribing.
  const captureFrameRef = useRef(captureFrame);
  useEffect(() => {
    captureFrameRef.current = captureFrame;
  }, [captureFrame]);

  const startFrameCapture = useCallback((screenStream: MediaStream) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = screenStream;
    video.play().catch(() => {});
    frameVideoRef.current = video;
    frameCanvasRef.current = document.createElement('canvas');
    frameCountRef.current = 0;
    lastFrameMsRef.current = 0;
    setFrameCount(0);
    // Grab one frame shortly after start (so there's always at least one), then
    // on a fixed cadence. Event-driven frames are added in captureEvent.
    window.setTimeout(() => captureFrameRef.current(), 1500);
    frameIntervalRef.current = window.setInterval(
      () => captureFrameRef.current(),
      FRAME_INTERVAL_MS
    );
  }, []);

  const stopFrameCapture = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (frameVideoRef.current) {
      try {
        frameVideoRef.current.pause();
      } catch {
        // ignore
      }
      frameVideoRef.current.srcObject = null;
      frameVideoRef.current = null;
    }
    frameCanvasRef.current = null;
  }, []);

  // Start live speech-to-text using the browser Web Speech API. Each finalized
  // recognition result is posted as a timestamped voice-transcript event (with
  // audio_start_ms/audio_end_ms relative to recording start). Recognition
  // auto-ends after silence, so onend restarts it until the analyst stops.
  const startTranscription = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    segmentStartMsRef.current = null;
    setSttRuntimeError(null);

    recognition.onresult = (event) => {
      const now = Date.now() - recordStartMsRef.current;
      // A live result means transcription is genuinely working; clear any
      // earlier transient error indicator.
      setSttRuntimeError(null);
      // Mark the start of the current spoken segment the first time we see any
      // (interim) result after a finalization.
      if (segmentStartMsRef.current === null) {
        segmentStartMsRef.current = Math.max(0, now - 2000);
      }
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = (result[0]?.transcript ?? '').trim();
        if (!result.isFinal) {
          // Accumulate interim text so the analyst sees words appear live.
          if (text) interimText += (interimText ? ' ' : '') + text;
          continue;
        }
        const startMs = segmentStartMsRef.current ?? Math.max(0, now - 2000);
        const endMs = now;
        segmentStartMsRef.current = null;
        if (!text) continue;
        // Show the finalized segment immediately in the popover list — this is
        // the visible feedback the user was missing — regardless of whether
        // persistence later succeeds.
        setTranscripts((prev) => [...prev, text]);
        setInterim('');
        const sid = sessionIdRef.current;
        if (!sid) continue;
        service
          .addVoiceTranscript(sid, text, Math.round(startMs), Math.round(endMs))
          .then(() => setTranscriptCount((c) => c + 1))
          .catch((err) => {
            // Persistence failure must NOT be silent: a swallowed failure here
            // is exactly what produced "0 voice transcripts" earlier. Surface
            // it so the analyst (and logs) can see voice capture isn't landing.
            // eslint-disable-next-line no-console
            console.warn('SOP Learning: failed to persist voice transcript', err);
            setSttRuntimeError('persist-failed');
          });
      }
      // Reflect the latest interim text (cleared when a segment finalizes).
      // Collapse long runs of the same repeated word (a common artifact of
      // continuous interim recognition, e.g. "hey hey hey hey…") so the live
      // feed stays readable instead of becoming a wall of repeats.
      if (interimText) setInterim(collapseRepeats(interimText));
    };
    recognition.onerror = (e) => {
      // 'no-speech'/'aborted' are benign (silence / restart). 'network',
      // 'not-allowed', 'service-not-allowed', 'audio-capture' mean the browser
      // can't actually transcribe — record it so the UI stops implying voice
      // is being transcribed when it isn't.
      const code = e?.error ?? '';
      if (code && code !== 'no-speech' && code !== 'aborted') {
        setSttRuntimeError(code);
      }
    };
    recognition.onend = () => {
      if (recognizingRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started / transient; ignore.
        }
      }
    };

    recognitionRef.current = recognition;
    recognizingRef.current = true;
    try {
      recognition.start();
    } catch (err) {
      // .start() throws if called while already started; only treat a genuine
      // failure (no recognition object alive) as an error.
      // eslint-disable-next-line no-console
      console.warn('SOP Learning: speech recognition failed to start', err);
    }
  }, [service]);

  const stopTranscription = useCallback(() => {
    recognizingRef.current = false;
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    segmentStartMsRef.current = null;
  }, []);

  async function startRecording() {
    // Acquire media on the FRESH user gesture from the click, BEFORE the async
    // server call. ORDERING MATTERS: the screen-share picker (getDisplayMedia)
    // is a blocking dialog that consumes the transient user activation; if we
    // awaited it first, the subsequent getUserMedia could be treated as
    // non-user-initiated and fail (e.g. NotAllowedError) in some Chromium
    // variants (Arc/embedded) EVEN WHEN the microphone permission is already
    // granted. So we kick off the microphone request FIRST (it resolves
    // immediately when permission is persisted), then request the screen.
    // Each optional capability is isolated: a failure in one must NOT prevent
    // the core session + event capture from starting.
    let screenStream: MediaStream | null = null;
    let voiceStream: MediaStream | null = null;

    // 1) Microphone FIRST, on the fresh gesture. Start the promise before any
    //    await so the request is bound to the current user activation.
    let voicePromise: Promise<MediaStream> | null = null;
    if (wantVoice) {
      setVoiceError(null);
      try {
        voicePromise = navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        // Synchronous throw (e.g. navigator.mediaDevices undefined on an
        // insecure origin). Capture the real reason.
        voicePromise = null;
        setVoiceActive(false);
        setVoiceError({ name: e?.name ?? 'Error', message: String(e?.message ?? e) });
      }
    }

    // 2) Screen share (its picker can consume the gesture — that's fine now
    //    that the mic request is already in flight).
    if (wantScreen) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenActive(true);
      } catch {
        screenStream = null;
        setScreenActive(false);
      }
    }

    // 3) Now resolve the microphone request and record the REAL outcome. The
    //    generic "blocked or unavailable" copy is gone: we differentiate by
    //    error name so the analyst sees the true cause.
    if (voicePromise) {
      try {
        voiceStream = await voicePromise;
        const track = voiceStream.getAudioTracks()[0];
        if (!track || track.readyState !== 'live') {
          // Acquired but not actually live (device ended/seized) — treat as a
          // failure with a meaningful reason rather than a silent dead track.
          voiceStream.getTracks().forEach((t) => t.stop());
          voiceStream = null;
          setVoiceActive(false);
          setVoiceError({
            name: 'NotReadableError',
            message: 'Microphone track is not live (device may be in use by another app).',
          });
        } else {
          setVoiceActive(true);
          setVoiceError(null);
        }
      } catch (e: any) {
        voiceStream = null;
        setVoiceActive(false);
        setVoiceError({ name: e?.name ?? 'Error', message: String(e?.message ?? e) });
        // eslint-disable-next-line no-console
        console.warn('SOP Learning: getUserMedia(audio) failed', e?.name, e?.message);
      }
    }

    // Core session start. If THIS fails, recording genuinely didn't start, so
    // surface it and release any media streams we already acquired.
    let session: { id: string };
    try {
      session = await service.startRecording(
        sopType || 'alert_triage',
        sessionLabel.trim() || `${(sopType || 'alert_triage').replace(/_/g, ' ')} capture`
      );
    } catch (e: any) {
      screenStream?.getTracks().forEach((t) => t.stop());
      voiceStream?.getTracks().forEach((t) => t.stop());
      setScreenActive(false);
      setVoiceActive(false);
      // A swallowed/easy-to-dismiss alert() is exactly why "nothing comes up":
      // when the logged-in user lacks ES write access to the sop-learning-*
      // indices the server returns 500 (security_exception) and recording never
      // starts. Show a PERSISTENT, explicit banner in the popover instead.
      const msg = e?.body?.message ?? e?.message ?? 'unknown error';
      const isAuthz = /unauthorized|security_exception|forbidden|403/i.test(String(msg));
      setStartError(
        isAuthz
          ? `Recording could not start: your user lacks write access to the SOP Learning indices ` +
              `(server said: ${String(msg).slice(0, 160)}). Log in as a user with write access ` +
              `to sop-learning-* (e.g. an admin / superuser), then try again.`
          : `Recording could not start: ${String(msg).slice(0, 200)}`
      );
      return;
    }

    setSessionId(session.id);
    setIsRecording(true);
    setDuration(0);
    setEventCount(0);
    setTranscriptCount(0);
    setTranscripts([]);
    setInterim('');
    setSttRuntimeError(null);
    setStartError(null);
    setFrameCount(0);
    recordStartMsRef.current = Date.now();

    // Event capture (fetch interception + click/navigation listeners) is the
    // baseline that must ALWAYS run once the session exists.
    try {
      startCapture();
    } catch {
      // Never let a capture-wiring hiccup tear down the session.
    }

    // Optional channel: screen recording. Guarded so an unsupported mime type
    // (e.g. Safari) can't abort the session.
    if (screenStream) {
      try {
        screenChunks.current = [];
        const r = new MediaRecorder(screenStream, { mimeType: 'video/webm' });
        r.ondataavailable = (e) => {
          if (e.data.size > 0) screenChunks.current.push(e.data);
        };
        r.start(5000);
        mediaRecorderRef.current = r;
      } catch {
        screenStream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        setScreenActive(false);
      }
      // Periodic screen KEYFRAME extraction for multimodal synthesis. This runs
      // off the same screen stream but is independent of the .webm recorder: a
      // recorder failure must not stop frames, and vice versa.
      try {
        startFrameCapture(screenStream);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('SOP Learning: frame capture failed to start', e);
      }
    }

    // Optional channel: voice recording + live browser transcription. Each is
    // independently guarded.
    if (voiceStream) {
      try {
        voiceChunks.current = [];
        // Pick a supported mime type rather than hard-coding 'audio/webm'
        // (which throws on browsers that don't support it). Fall back to the
        // browser default so audio is still captured for playback.
        const preferredMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        const supported =
          typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
            ? preferredMimes.find((m) => MediaRecorder.isTypeSupported(m))
            : undefined;
        const r = supported
          ? new MediaRecorder(voiceStream, { mimeType: supported })
          : new MediaRecorder(voiceStream);
        r.ondataavailable = (e) => {
          if (e.data.size > 0) voiceChunks.current.push(e.data);
        };
        r.start(5000);
        voiceRecorderRef.current = r;
      } catch (e: any) {
        voiceStream.getTracks().forEach((t) => t.stop());
        voiceRecorderRef.current = null;
        setVoiceActive(false);
        setVoiceError({
          name: e?.name ?? 'RecorderError',
          message: `Could not start audio recorder: ${String(e?.message ?? e)}`,
        });
      }
      // Kick off live browser transcription of the spoken narration. This is
      // the genuine voice->text path (no server STT exists here). The audio
      // blob is still stored for playback; the transcript is what feeds the
      // LLM. SpeechRecognition uses its OWN internal mic capture (independent
      // of voiceStream), so it can fail with 'network'/'service-not-allowed'
      // even when the mic stream above is perfectly live — that's a
      // TRANSCRIPTION failure, surfaced via sttRuntimeError, NOT a mic failure.
      // Independently guarded: no SpeechRecognition API (Firefox/Safari) must
      // not affect the session or voice recording.
      try {
        startTranscription();
      } catch {
        // STT unavailable / failed to start — non-fatal.
      }
    }
  }

  async function stopRecording() {
    stopCapture();
    stopTranscription();
    stopFrameCapture();
    const sid = sessionId;
    let videoBlob: Blob | null = null;
    let audioBlob: Blob | null = null;

    await new Promise<void>((resolve) => {
      let pending = 0;
      const done = () => {
        pending--;
        if (pending <= 0) resolve();
      };
      if (mediaRecorderRef.current?.state === 'recording') {
        pending++;
        mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current!.stream?.getTracks().forEach((t) => t.stop());
          if (screenChunks.current.length > 0) {
            videoBlob = new Blob(screenChunks.current, { type: 'video/webm' });
          }
          done();
        };
        mediaRecorderRef.current.stop();
      }
      if (voiceRecorderRef.current?.state === 'recording') {
        pending++;
        const rec = voiceRecorderRef.current;
        rec.onstop = () => {
          rec.stream?.getTracks().forEach((t) => t.stop());
          if (voiceChunks.current.length > 0) {
            // Use the recorder's negotiated mime type (we no longer hard-code
            // audio/webm, since some browsers record mp4/ogg).
            audioBlob = new Blob(voiceChunks.current, {
              type: rec.mimeType || 'audio/webm',
            });
          }
          done();
        };
        rec.stop();
      }
      if (pending === 0) resolve();
    });

    if (sid) {
      try {
        await service.stopRecording(sid);
      } catch {
        // ignore
      }
    }
    if (sid && videoBlob) {
      try {
        await service.uploadMedia(sid, videoBlob, 'video');
      } catch {
        // ignore upload failures
      }
    }
    if (sid && audioBlob) {
      try {
        await service.uploadMedia(sid, audioBlob, 'audio');
      } catch {
        // ignore upload failures
      }
    }

    setIsRecording(false);
    setSessionId(null);
    setScreenActive(false);
    setVoiceActive(false);
  }

  async function submitNarration() {
    if (!narration.trim() || !sessionId) return;
    await service.addNarration(sessionId, narration.trim());
    setNarration('');
    setEventCount((c) => c + 1);
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Terse one-line capture summary shown next to the recording dot, e.g.
  // "12 events · screen · voice". Replaces the old wrapped row of 5-6 badges;
  // exact frame/transcript counts live in the adjacent info tooltip.
  const captureSummary = [
    `${eventCount} event${eventCount === 1 ? '' : 's'}`,
    screenActive ? 'screen' : null,
    voiceActive ? 'voice' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const button = isRecording ? (
    <EuiButtonEmpty
      size="s"
      color="danger"
      onClick={() => setIsOpen((o) => !o)}
      data-test-subj="sopLearningRecordHeaderButton"
    >
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: euiTheme.colors.danger,
              animation: 'sopLearningRecPulse 1.4s ease-in-out infinite',
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <strong>
            REC {fmt(duration)} · {eventCount}
          </strong>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiButtonEmpty>
  ) : (
    <EuiButtonEmpty
      size="s"
      color="primary"
      iconType="videoPlayer"
      onClick={() => setIsOpen((o) => !o)}
      data-test-subj="sopLearningRecordHeaderButton"
    >
      Record SOP
    </EuiButtonEmpty>
  );

  return (
    <>
      {/* The recording-dot pulse keyframes must be available for BOTH the header
          trigger (rendered outside the popover panel) and the in-popover dot,
          even while the popover is closed. */}
      <style>{`@keyframes sopLearningRecPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <EuiPopover
        button={button}
        isOpen={isOpen}
        closePopover={() => setIsOpen(false)}
        anchorPosition="downRight"
        panelPaddingSize="none"
      >
        <EuiPanel
          paddingSize="m"
          hasShadow={false}
          style={{ width: 320, maxWidth: '92vw', boxSizing: 'border-box' }}
        >
          {!isRecording ? (
          <>
            <EuiText size="s">
              <strong>Record a workflow</strong>
            </EuiText>
            <EuiSpacer size="s" />
            {startError && (
              <>
                <EuiCallOut
                  size="s"
                  color="danger"
                  iconType="warning"
                  title="Recording didn't start"
                  data-test-subj="sopLearningStartError"
                >
                  <EuiText size="xs">{startError}</EuiText>
                </EuiCallOut>
                <EuiSpacer size="s" />
              </>
            )}
            <EuiFormRow label="SOP type" fullWidth display="rowCompressed">
              <EuiComboBox
                compressed
                fullWidth
                singleSelection={{ asPlainText: true }}
                placeholder="Choose or type a SOP type"
                options={SOP_TYPE_PRESETS.map((t) => ({
                  label: t.replace(/_/g, ' '),
                  value: t,
                }))}
                selectedOptions={
                  sopType
                    ? [{ label: sopType.replace(/_/g, ' '), value: sopType }]
                    : []
                }
                onChange={(opts: Array<EuiComboBoxOptionOption<string>>) => {
                  const v = (opts[0]?.value ?? opts[0]?.label ?? '').toString();
                  setSopType(v.trim().replace(/\s+/g, '_').toLowerCase());
                }}
                onCreateOption={(value: string) => {
                  setSopType(value.trim().replace(/\s+/g, '_').toLowerCase());
                }}
                isClearable={false}
              />
            </EuiFormRow>
            <EuiFormRow label="Session label (optional)" fullWidth display="rowCompressed">
              <EuiFieldText
                compressed
                fullWidth
                placeholder="e.g. Ransomware triage on FILE-SERVER-03"
                value={sessionLabel}
                onChange={(e) => setSessionLabel(e.target.value)}
              />
            </EuiFormRow>
            <EuiSpacer size="s" />
            <EuiSwitch
              label="Screen recording"
              checked={wantScreen}
              onChange={(e) => setWantScreen(e.target.checked)}
              compressed
            />
            <EuiSpacer size="xs" />
            <EuiSwitch
              label="Voice narration (microphone)"
              checked={wantVoice}
              onChange={(e) => setWantVoice(e.target.checked)}
              compressed
            />
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color={sttSupported ? 'subdued' : 'warning'}>
                  {sttSupported
                    ? 'Clicks, queries, and navigation are always captured.'
                    : 'No live transcription in this browser — voice is recorded only.'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIconTip
                  type="info"
                  color="subdued"
                  aria-label="Recording details"
                  data-test-subj="sopLearningSetupDetails"
                  content={
                    <EuiText size="xs">
                      <div>
                        Clicks, queries, and navigation are always captured. Recording persists as
                        you navigate Kibana.
                      </div>
                      <div>
                        {sttSupported
                          ? 'Voice is transcribed live in your browser (timestamped) and fed to synthesis.'
                          : 'This browser has no Speech Recognition API — voice is recorded for playback but NOT transcribed. Use Chrome/Edge for live transcription.'}
                      </div>
                    </EuiText>
                  }
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            <EuiButton
              fill
              fullWidth
              color="danger"
              size="s"
              iconType="dot"
              onClick={startRecording}
              data-test-subj="sopLearningStartRecording"
            >
              Start recording
            </EuiButton>
          </>
        ) : (
          <>
            {/* Calm, single-line status: a live recording dot + elapsed time +
                a terse capture summary. Secondary detail (frame/transcript
                counts, mic/transcription explanation) is progressively
                disclosed via the info tooltip rather than shown inline. */}
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: euiTheme.colors.danger,
                    animation: 'sopLearningRecPulse 1.4s ease-in-out infinite',
                  }}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="danger">
                  <strong>REC {fmt(duration)}</strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem style={{ minWidth: 0 }}>
                <EuiText
                  size="xs"
                  color="subdued"
                  data-test-subj="sopLearningCaptureSummary"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {captureSummary}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIconTip
                  type="info"
                  color="subdued"
                  aria-label="Capture details"
                  data-test-subj="sopLearningCaptureDetails"
                  content={
                    <EuiText size="xs">
                      <div>{eventCount} events captured</div>
                      {screenActive && (
                        <div data-test-subj="sopLearningFrameDetail">
                          Screen: {frameCount} frame{frameCount === 1 ? '' : 's'} captured
                        </div>
                      )}
                      {voiceActive && (
                        <div data-test-subj="sopLearningMicActive">
                          Microphone active — recording audio.
                          {sttSupported
                            ? ` Live transcription on (${transcriptCount} transcript${
                                transcriptCount === 1 ? '' : 's'
                              }).`
                            : ' Live transcription not available in this browser; audio still saved.'}
                        </div>
                      )}
                    </EuiText>
                  }
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            {/* Genuine problems stay visible inline (consolidated to one terse
                line each), since they tell the analyst capture isn't working. */}
            {wantVoice && !voiceActive && (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="xs" color="warning" data-test-subj="sopLearningMicWarning">
                  {voiceError
                    ? micErrorMessage(voiceError)
                    : 'Microphone not active — no voice is being captured. Restart recording to retry.'}
                </EuiText>
              </>
            )}
            {voiceActive && sttSupported && sttRuntimeError && (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="xs" color="warning" data-test-subj="sopLearningTranscriptWarning">
                  {sttRuntimeError === 'persist-failed'
                    ? 'Voice recognized but transcripts failed to save — check connectivity. Audio is still recorded.'
                    : sttRuntimeError === 'network'
                    ? 'Live transcription unavailable (no reachable speech backend). Audio is still recorded. Use desktop Chrome for live transcription.'
                    : `Live voice transcription unavailable (${sttRuntimeError}). Audio is still recorded.`}
                </EuiText>
              </>
            )}
            {voiceActive && !sttSupported && (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="xs" color="warning">
                  No Speech Recognition API in this browser — audio is recorded but not transcribed
                  live. Use desktop Chrome for live transcription.
                </EuiText>
              </>
            )}
            {/* Live transcript feed: finalized segments + in-progress interim
                text. The "listening" placeholder lives here (only inside the
                collapsible feed area) so it isn't an always-on status line. */}
            {voiceActive && sttSupported && !sttRuntimeError && (
              <>
                <EuiSpacer size="xs" />
                <EuiPanel
                  color="subdued"
                  paddingSize="s"
                  hasShadow={false}
                  hasBorder
                  data-test-subj="sopLearningLiveTranscript"
                  style={{ maxHeight: 120, overflowY: 'auto', overflowX: 'hidden' }}
                >
                  {transcripts.length > 0 || interim ? (
                    <EuiText
                      size="xs"
                      style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                    >
                      {transcripts.slice(-6).map((t, i) => (
                        <div key={i}>{t}</div>
                      ))}
                      {interim && (
                        <div style={{ opacity: 0.6, fontStyle: 'italic' }}>{interim}…</div>
                      )}
                    </EuiText>
                  ) : (
                    <EuiText
                      size="xs"
                      color="subdued"
                      data-test-subj="sopLearningTranscriptListening"
                    >
                      Listening… speak to see the live transcript.
                    </EuiText>
                  )}
                </EuiPanel>
              </>
            )}
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
              <EuiFlexItem style={{ minWidth: 0 }}>
                <EuiFieldText
                  compressed
                  fullWidth
                  placeholder="Why are you doing this? (narrate)"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNarration();
                  }}
                  data-test-subj="sopLearningNarrationInput"
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  iconType="plusInCircleFilled"
                  aria-label="Add narration"
                  onClick={submitNarration}
                  isDisabled={!narration.trim()}
                  display="base"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <EuiButton
              fullWidth
              color="danger"
              size="s"
              iconType="stop"
              onClick={stopRecording}
              data-test-subj="sopLearningStopRecording"
            >
              Stop recording
            </EuiButton>
          </>
        )}
      </EuiPanel>
      </EuiPopover>
    </>
  );
}

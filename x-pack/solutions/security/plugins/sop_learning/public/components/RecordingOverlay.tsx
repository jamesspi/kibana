import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EuiPanel, EuiFlexGroup, EuiFlexItem, EuiButton, EuiButtonEmpty, EuiButtonIcon, EuiText, EuiFieldText, EuiBadge, EuiPortal, EuiSpacer, EuiSwitch, useEuiTheme } from '@elastic/eui';
import { SopLearningService } from '../services/api';

interface Props { service: SopLearningService; }

// Minimal Web Speech API typings + accessor. Elasticsearch has no STT
// inference task type here, so spoken narration is transcribed live in the
// browser. Mirrors RecordingWidget.tsx.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start: () => void;
  stop: () => void;
}
function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function RecordingOverlay({ service }: Props) {
  const { euiTheme } = useEuiTheme();
  const recDot = euiTheme.colors.danger;
  const recBorder = `1px solid ${euiTheme.colors.danger}`;
  // The pulse (opacity 1↔0.35) is reserved EXCLUSIVELY for active recording.
  const recPulseKeyframes = `@keyframes sopLearningRecPulse{0%,100%{opacity:1}50%{opacity:.35}}`;
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [narration, setNarration] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [wantScreen, setWantScreen] = useState(true);
  const [wantVoice, setWantVoice] = useState(true);
  const [sopType, setSopType] = useState('alert_triage');
  const [sessionLabel, setSessionLabel] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const timerRef = useRef<number|null>(null);
  const originalFetchRef = useRef<typeof fetch|null>(null);
  const lastCapturedUrlRef = useRef(window.location.href);
  const urlIntervalRef = useRef<number|null>(null);
  const sessionIdRef = useRef<string|null>(null);
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const voiceRecorderRef = useRef<MediaRecorder|null>(null);
  const clickListenerRef = useRef<((e:MouseEvent)=>void)|null>(null);
  const screenChunks = useRef<Blob[]>([]);
  const voiceChunks = useRef<Blob[]>([]);
  // Keyframe capture: a hidden <video> bound to the screen MediaStream that we
  // draw onto a <canvas> every FRAME_INTERVAL_MS to grab a downscaled JPEG. We
  // upload frames live so they're tied to event timestamps and don't require
  // decoding the recorded .webm afterwards.
  const frameVideoRef = useRef<HTMLVideoElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike|null>(null);
  const recordStartMsRef = useRef<number>(0);
  const recognizingRef = useRef<boolean>(false);
  const segmentStartMsRef = useRef<number|null>(null);

  function startTranscription() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    segmentStartMsRef.current = null;
    recognition.onresult = (event: any) => {
      const now = Date.now() - recordStartMsRef.current;
      if (segmentStartMsRef.current === null) segmentStartMsRef.current = Math.max(0, now - 2000);
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text = (result[0]?.transcript ?? '').trim();
        const startMs = segmentStartMsRef.current ?? Math.max(0, now - 2000);
        const endMs = now;
        segmentStartMsRef.current = null;
        const sid = sessionIdRef.current;
        if (!text || !sid) continue;
        service.addVoiceTranscript(sid, text, Math.round(startMs), Math.round(endMs)).catch((err) => {
          // Don't silently swallow: a swallowed failure here is what produced
          // "0 voice transcripts". Surface it for the analyst/logs.
          // eslint-disable-next-line no-console
          console.warn('SOP Learning: failed to persist voice transcript', err);
        });
      }
    };
    recognition.onend = () => { if (recognizingRef.current) { try { recognition.start(); } catch {} } };
    recognition.onerror = () => {};
    recognitionRef.current = recognition;
    recognizingRef.current = true;
    try { recognition.start(); } catch {}
  }

  function stopTranscription() {
    recognizingRef.current = false;
    const r = recognitionRef.current;
    if (r) { try { r.onend = null; r.stop(); } catch {} }
    recognitionRef.current = null;
    segmentStartMsRef.current = null;
  }

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => {
    if (isRecording) { timerRef.current = window.setInterval(() => setDuration(d => d+1), 1000); }
    else if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const captureEvent = useCallback(async (eventType: string, category: string, description: string, details?: Record<string,unknown>) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try { await service.recordEvent(sid, { event_type: eventType, category, description, details }); setEventCount(c => c+1); } catch {}
  }, [service]);

  function startCapture() {
    originalFetchRef.current = window.fetch;
    const origFetch = window.fetch;
    window.fetch = async function(...args: Parameters<typeof fetch>) {
      const [input, init] = args;
      const url = typeof input === 'string' ? input : (input as Request).url;
      const method = init?.method?.toUpperCase() ?? 'GET';
      const result = await origFetch.apply(window, args);
      if (url.includes('/internal/search/esql') && init?.body) {
        try { const b = JSON.parse(init.body as string); const q = b?.params?.query ?? b?.query; if (q) captureEvent('query.esql', 'query', `ES|QL: ${q.slice(0,150)}`, {query_text:q}); } catch {}
      }
      if (url.includes('/api/detection_engine/signals') && method === 'POST') captureEvent('alert.searched', 'alert', 'Searched alerts');
      if (url.includes('/api/cases') && method === 'POST' && !url.includes('_find')) captureEvent('case.created', 'case', 'Created case');
      if (url.includes('/api/endpoint/action/') && method === 'POST') captureEvent('response_action.executed', 'response', 'Response action executed');
      if (url.includes('/api/detection_engine/signals/status') && method === 'POST') captureEvent('alert.status_changed', 'alert', 'Alert status changed');
      return result;
    };
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const el = target.closest('[data-test-subj], [aria-label], button, a, [role="row"]') as HTMLElement;
      if (!el) return;
      const subj = el.getAttribute('data-test-subj') ?? '';
      const aria = el.getAttribute('aria-label') ?? '';
      const text = (el.textContent ?? '').trim().slice(0,80);
      if (subj.includes('sopLearning') || text.length < 2) return;
      let desc = '', evType = 'ui.click', cat = 'interaction';
      if (subj.includes('alert') || el.closest('[data-test-subj*="alert"]')) { evType='alert.clicked'; cat='alert'; desc=`Alert: ${text.slice(0,60)}`; }
      else if (el.closest('.euiFlyout')) { evType='flyout.click'; cat='alert'; desc=`Flyout: ${aria||text.slice(0,60)}`; }
      else if (el.closest('tr,[role="row"]')) { evType='table.row_clicked'; desc=`Row: ${text.slice(0,80)}`; }
      else if (el.tagName==='BUTTON') { desc=`Button: ${aria||text.slice(0,60)}`; }
      else { desc=`Click: ${aria||text.slice(0,60)}`; }
      if (desc) captureEvent(evType, cat, desc, {test_subj:subj||undefined});
    };
    document.addEventListener('click', clickHandler, true);
    clickListenerRef.current = clickHandler;
    lastCapturedUrlRef.current = window.location.href;
    urlIntervalRef.current = window.setInterval(() => {
      const cur = window.location.href;
      if (cur !== lastCapturedUrlRef.current) {
        lastCapturedUrlRef.current = cur;
        const m = cur.match(/\/app\/security\/([^/?#]+)/);
        if (m) captureEvent('navigation.changed', 'navigation', `Navigated to: security/${m[1]}`);
      }
    }, 1000);
  }

  function stopCapture() {
    if (originalFetchRef.current) { window.fetch = originalFetchRef.current; originalFetchRef.current = null; }
    if (clickListenerRef.current) { document.removeEventListener('click', clickListenerRef.current, true); clickListenerRef.current = null; }
    if (urlIntervalRef.current) { clearInterval(urlIntervalRef.current); urlIntervalRef.current = null; }
  }

  // How often to grab a screen keyframe, and the downscaled-frame limits. A
  // ~10s cadence with a 1024px-wide JPEG keeps per-session payloads modest
  // (synthesis later caps how many are actually sent to Claude).
  const FRAME_INTERVAL_MS = 10000;
  const FRAME_MAX_WIDTH = 1024;
  const FRAME_JPEG_QUALITY = 0.6;
  const FRAME_MAX_PER_SESSION = 60; // hard stop so a very long session can't flood ES

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
      const timestampMs = Math.max(0, Date.now() - recordStartMsRef.current);
      frameCountRef.current += 1;
      await service.uploadFrame(sid, dataUrl, timestampMs);
    } catch (e) {
      // Tainted canvas, decode hiccup, or upload error — skip this frame.
      console.warn('Keyframe capture skipped:', e);
    }
  }, [service]);

  function startFrameCapture(screenStream: MediaStream) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = screenStream;
    video.play().catch(() => {});
    frameVideoRef.current = video;
    frameCanvasRef.current = document.createElement('canvas');
    frameCountRef.current = 0;
    // Grab one frame shortly after start (so there's always at least one), then
    // on a fixed cadence.
    window.setTimeout(() => { captureFrame(); }, 1500);
    frameIntervalRef.current = window.setInterval(() => { captureFrame(); }, FRAME_INTERVAL_MS);
  }

  function stopFrameCapture() {
    if (frameIntervalRef.current) { clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
    if (frameVideoRef.current) {
      try { frameVideoRef.current.pause(); } catch {}
      frameVideoRef.current.srcObject = null;
      frameVideoRef.current = null;
    }
    frameCanvasRef.current = null;
  }

  async function startRecording() {
    let screenStream: MediaStream|null = null;
    let voiceStream: MediaStream|null = null;
    // Mic FIRST on the fresh gesture: start the getUserMedia promise before
    // awaiting the screen-share picker (whose dialog consumes the user
    // activation and can otherwise make a granted mic fail). See RecordingWidget
    // for the detailed rationale.
    const voicePromise = wantVoice
      ? navigator.mediaDevices.getUserMedia({ audio: true }).catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('SOP Learning: getUserMedia(audio) failed', e?.name, e?.message);
          return null as MediaStream | null;
        })
      : null;
    if (wantScreen) { try { screenStream = await navigator.mediaDevices.getDisplayMedia({video:true}); setScreenActive(true); } catch { setScreenActive(false); } }
    if (voicePromise) {
      voiceStream = await voicePromise;
      const track = voiceStream?.getAudioTracks()[0];
      setVoiceActive(!!track && track.readyState === 'live');
    }
    try {
      const session = await service.startRecording(
        sopType || 'alert_triage',
        sessionLabel.trim() || `${(sopType || 'alert_triage').replace(/_/g, ' ')} capture`
      );
      setSessionId(session.id); setIsRecording(true); setShowSetup(false); setDuration(0); setEventCount(0);
      recordStartMsRef.current = Date.now();
      startCapture();
      if (screenStream) { screenChunks.current=[]; const r = new MediaRecorder(screenStream,{mimeType:'video/webm'}); r.ondataavailable=(e)=>{if(e.data.size>0)screenChunks.current.push(e.data);}; r.start(5000); mediaRecorderRef.current=r; startFrameCapture(screenStream); }
      if (voiceStream) { voiceChunks.current=[]; const vm = (typeof MediaRecorder!=='undefined' && MediaRecorder.isTypeSupported && ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find((m)=>MediaRecorder.isTypeSupported(m))) || undefined; const r = vm ? new MediaRecorder(voiceStream,{mimeType:vm}) : new MediaRecorder(voiceStream); r.ondataavailable=(e)=>{if(e.data.size>0)voiceChunks.current.push(e.data);}; r.start(5000); voiceRecorderRef.current=r; startTranscription(); }
    } catch(e:any) { alert('Failed to start: '+e.message); }
  }

  async function stopRecording() {
    stopCapture();
    stopTranscription();
    stopFrameCapture();
    const sid = sessionId;
    let videoBlob: Blob | null = null;
    let audioBlob: Blob | null = null;

    await new Promise<void>(resolve => {
      let pending = 0;
      const done = () => { pending--; if (pending <= 0) resolve(); };
      if (mediaRecorderRef.current?.state==='recording') {
        pending++;
        mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current!.stream?.getTracks().forEach(t=>t.stop());
          if (screenChunks.current.length>0) { videoBlob = new Blob(screenChunks.current,{type:'video/webm'}); setVideoUrl(URL.createObjectURL(videoBlob)); }
          done();
        };
        mediaRecorderRef.current.stop();
      }
      if (voiceRecorderRef.current?.state==='recording') {
        pending++;
        voiceRecorderRef.current.onstop = () => {
          voiceRecorderRef.current!.stream?.getTracks().forEach(t=>t.stop());
          if (voiceChunks.current.length>0) { audioBlob = new Blob(voiceChunks.current,{type:'audio/webm'}); setAudioUrl(URL.createObjectURL(audioBlob)); }
          done();
        };
        voiceRecorderRef.current.stop();
      }
      if (pending===0) resolve();
    });

    if (sid) { try { await service.stopRecording(sid); } catch {} }

    // Upload media to Elasticsearch. Uploads are chunked under the hood so large
    // screen recordings don't get rejected; surface (not swallow) any failure so
    // the analyst knows a recording didn't persist.
    const failures: string[] = [];
    if (sid && videoBlob) {
      try { await service.uploadMedia(sid, videoBlob, 'video'); console.info('Video uploaded'); }
      catch (e: any) { console.error('Video upload failed:', e); failures.push(`screen recording (${e?.message ?? 'error'})`); }
    }
    if (sid && audioBlob) {
      try { await service.uploadMedia(sid, audioBlob, 'audio'); console.info('Audio uploaded'); }
      catch (e: any) { console.error('Audio upload failed:', e); failures.push(`voice narration (${e?.message ?? 'error'})`); }
    }
    if (failures.length > 0) {
      alert(`Some recordings failed to upload: ${failures.join(', ')}. The video/audio preview below is still available to download.`);
    }

    setIsRecording(false); setSessionId(null); setScreenActive(false); setVoiceActive(false);
  }

  async function submitNarration() {
    if (!narration.trim()||!sessionId) return;
    await service.addNarration(sessionId, narration.trim());
    setNarration(''); setEventCount(c=>c+1);
  }

  const fmt = (s:number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  if (!isRecording && (videoUrl || audioUrl)) return (
    <EuiPortal><div style={{position:'fixed',bottom:20,right:20,zIndex:9999,width:400}}>
      <EuiPanel paddingSize="m" hasShadow>
        <EuiText size="s"><strong>Recording complete</strong></EuiText><EuiSpacer size="s"/>
        {videoUrl && (<>
          <EuiText size="xs" color="subdued">Screen recording</EuiText><EuiSpacer size="xs"/>
          <video src={videoUrl} controls style={{width:'100%',borderRadius:euiTheme.border.radius.medium,maxHeight:200}}/><EuiSpacer size="xs"/>
          <EuiButtonEmpty size="xs" iconType="download" href={videoUrl} download={`sop-screen-${Date.now()}.webm`}>Download video</EuiButtonEmpty><EuiSpacer size="s"/>
        </>)}
        {audioUrl && (<>
          <EuiText size="xs" color="subdued">Voice narration</EuiText><EuiSpacer size="xs"/>
          <audio src={audioUrl} controls style={{width:'100%'}}/><EuiSpacer size="xs"/>
          <EuiButtonEmpty size="xs" iconType="download" href={audioUrl} download={`sop-voice-${Date.now()}.webm`}>Download audio</EuiButtonEmpty><EuiSpacer size="s"/>
        </>)}
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem><EuiButton size="s" onClick={()=>{setVideoUrl(null);setAudioUrl(null);}}>Dismiss</EuiButton></EuiFlexItem>
          <EuiFlexItem><EuiButton size="s" fill color="danger" iconType="dot" onClick={()=>{setVideoUrl(null);setAudioUrl(null);setShowSetup(true);}}>Record another</EuiButton></EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </div></EuiPortal>
  );

  if (!isRecording && showSetup) return (
    <EuiPortal><div style={{position:'fixed',bottom:20,right:20,zIndex:9999,width:320}}>
      <EuiPanel paddingSize="m" hasShadow>
        <EuiText size="s"><strong>Recording options</strong></EuiText><EuiSpacer size="s"/>
        <EuiFieldText
          compressed
          fullWidth
          prepend="Type"
          placeholder="alert_triage"
          value={sopType.replace(/_/g, ' ')}
          onChange={(e) => setSopType(e.target.value.trim().replace(/\s+/g, '_').toLowerCase())}
        />
        <EuiSpacer size="xs"/>
        <EuiFieldText
          compressed
          fullWidth
          prepend="Label"
          placeholder="Optional session label"
          value={sessionLabel}
          onChange={(e) => setSessionLabel(e.target.value)}
        />
        <EuiSpacer size="s"/>
        <EuiSwitch label="Screen recording" checked={wantScreen} onChange={e=>setWantScreen(e.target.checked)} compressed/>
        <EuiSpacer size="xs"/>
        <EuiSwitch label="Voice narration (microphone)" checked={wantVoice} onChange={e=>setWantVoice(e.target.checked)} compressed/>
        <EuiSpacer size="s"/>
        <EuiText size="xs" color="subdued">Clicks, queries, and navigation are always captured.</EuiText>
        <EuiSpacer size="m"/>
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem><EuiButton fill color="danger" size="s" onClick={startRecording} iconType="dot">Start recording</EuiButton></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiButtonEmpty size="s" onClick={()=>setShowSetup(false)}>Cancel</EuiButtonEmpty></EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </div></EuiPortal>
  );

  if (!isRecording) return null;

  if (minimized) return (
    <EuiPortal><div style={{position:'fixed',bottom:20,right:20,zIndex:9999}}>
      <EuiPanel paddingSize="s" hasShadow style={{border:recBorder}}>
        <style>{recPulseKeyframes}</style>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}><span aria-hidden style={{width:8,height:8,borderRadius:'50%',background:recDot,display:'inline-block',animation:'sopLearningRecPulse 1.4s ease-in-out infinite'}}/></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiText size="xs"><strong>{fmt(duration)}</strong></EuiText></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiBadge color="hollow">{eventCount}</EuiBadge></EuiFlexItem>
          {screenActive&&<EuiFlexItem grow={false}><EuiBadge color="primary" iconType="videoPlayer">Screen</EuiBadge></EuiFlexItem>}
          {voiceActive&&<EuiFlexItem grow={false}><EuiBadge color="accent" iconType="quote">Voice</EuiBadge></EuiFlexItem>}
          <EuiFlexItem grow={false}><EuiButtonIcon iconType="expand" onClick={()=>setMinimized(false)} aria-label="Expand" size="s"/></EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </div></EuiPortal>
  );

  return (
    <EuiPortal><div style={{position:'fixed',bottom:20,right:20,zIndex:9999,width:360}}>
      <EuiPanel paddingSize="m" hasShadow style={{border:recBorder}}>
        <style>{recPulseKeyframes}</style>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}><span aria-hidden style={{width:8,height:8,borderRadius:'50%',background:recDot,display:'inline-block',animation:'sopLearningRecPulse 1.4s ease-in-out infinite'}}/></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiText size="xs" color="danger"><strong>REC {fmt(duration)}</strong></EuiText></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiBadge color="hollow">{eventCount} events</EuiBadge></EuiFlexItem>
          {screenActive&&<EuiFlexItem grow={false}><EuiBadge color="primary" iconType="videoPlayer">Screen</EuiBadge></EuiFlexItem>}
          {voiceActive&&<EuiFlexItem grow={false}><EuiBadge color="accent" iconType="quote">Voice</EuiBadge></EuiFlexItem>}
          <EuiFlexItem/>
          <EuiFlexItem grow={false}><EuiButtonIcon iconType="minimize" onClick={()=>setMinimized(true)} aria-label="Minimize" size="s"/></EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s"/>
        <EuiFlexGroup gutterSize="xs" responsive={false}>
          <EuiFlexItem><EuiFieldText compressed placeholder="Why are you doing this? (narrate)" value={narration} onChange={e=>setNarration(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitNarration();}}/></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiButton size="s" onClick={submitNarration} disabled={!narration.trim()}>Add</EuiButton></EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s"/>
        <EuiButtonEmpty color="danger" size="xs" onClick={stopRecording} iconType="stop">Stop recording</EuiButtonEmpty>
      </EuiPanel>
    </div></EuiPortal>
  );
}

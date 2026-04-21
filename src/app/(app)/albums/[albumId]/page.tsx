'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteMoment as deleteMomentAction } from '@/lib/actions/album';

type Moment = {
  id: string;
  photos: string[];
  photoPath?: string | null;
  audioPath: string | null;
  transcript: string | null;
  vignette: string | null;
  recordedAt: string;
};

type Album = { id: string; name: string };

function getFirstPhoto(m: Moment): string | null {
  return m.photos?.[0] ?? m.photoPath ?? null;
}

// ── Decorative botanical corner (baby's breath / wildflower style) ────────
function BotanicalCorner() {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Main arching stems */}
      <path d="M 0 200 Q 25 155 55 125 Q 85 95 115 68 Q 145 42 175 18 Q 188 8 200 0"
        stroke="#c4b392" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M 0 158 Q 28 128 58 102 Q 88 76 118 52 Q 146 30 168 12"
        stroke="#b39b72" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M 0 115 Q 22 96 48 75 Q 72 56 95 40"
        stroke="#c4b392" strokeWidth="1" strokeLinecap="round" />
      {/* Side branches */}
      <path d="M 55 125 Q 38 106 24 90" stroke="#c4b392" strokeWidth="1" strokeLinecap="round" />
      <path d="M 115 68 Q 98 50 84 36" stroke="#b39b72" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M 145 42 Q 130 28 118 16" stroke="#c4b392" strokeWidth="0.9" strokeLinecap="round" />
      {/* Soft elliptical leaves */}
      <ellipse cx="40" cy="113" rx="13" ry="4.5" fill="#c4b392" opacity="0.5" transform="rotate(-46, 40, 113)" />
      <ellipse cx="68" cy="86" rx="11" ry="4" fill="#b39b72" opacity="0.45" transform="rotate(-36, 68, 86)" />
      <ellipse cx="96" cy="62" rx="12" ry="4.5" fill="#c4b392" opacity="0.48" transform="rotate(-52, 96, 62)" />
      <ellipse cx="128" cy="38" rx="10" ry="4" fill="#b39b72" opacity="0.42" transform="rotate(-42, 128, 38)" />
      {/* Tiny clustered flowers (baby's breath style) */}
      <circle cx="198" cy="2" r="3.5" fill="#ede6d8" opacity="0.65" />
      <circle cx="191" cy="9" r="2.8" fill="#e4dac8" opacity="0.6" />
      <circle cx="183" cy="14" r="2.2" fill="#ede6d8" opacity="0.55" />
      <circle cx="193" cy="16" r="2" fill="#ddd0be" opacity="0.55" />
      <circle cx="168" cy="12" r="2.5" fill="#ede6d8" opacity="0.58" />
      <circle cx="162" cy="20" r="2" fill="#e4dac8" opacity="0.52" />
      <circle cx="174" cy="22" r="1.8" fill="#ddd0be" opacity="0.5" />
      <circle cx="115" cy="68" r="3" fill="#ede6d8" opacity="0.6" />
      <circle cx="108" cy="76" r="2.2" fill="#e4dac8" opacity="0.52" />
      <circle cx="122" cy="75" r="1.8" fill="#ddd0be" opacity="0.48" />
      <circle cx="24" cy="90" r="2.5" fill="#ede6d8" opacity="0.52" />
      <circle cx="17" cy="98" r="2" fill="#e4dac8" opacity="0.45" />
      <circle cx="84" cy="36" r="2" fill="#ede6d8" opacity="0.45" />
      <circle cx="118" cy="16" r="1.8" fill="#e4dac8" opacity="0.42" />
      <circle cx="48" cy="75" r="1.5" fill="#c4b392" opacity="0.38" />
    </svg>
  );
}

export default function AlbumPage() {
  const params = useParams();
  const albumId = params.albumId as string;

  const queryClient = useQueryClient();

  // ── Server state (React Query) ─────────────────────────────────────────
  const { data: album } = useQuery<Album>({
    queryKey: ['album', albumId],
    queryFn: async () => {
      const res = await fetch(`/api/albums/${albumId}`);
      if (!res.ok) throw new Error('Album not found');
      return res.json() as Promise<Album>;
    },
  });

  const {
    data: moments = [],
    isLoading: momentsLoading,
    refetch: refetchMoments,
  } = useQuery<Moment[]>({
    queryKey: ['moments', albumId],
    queryFn: async () => {
      const res = await fetch(`/api/albums/${albumId}/moments`);
      if (!res.ok) throw new Error('Failed to load moments');
      return res.json() as Promise<Moment[]>;
    },
  });

  // ── Add form state ───────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [momentDate, setMomentDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioReadyResolveRef = useRef<((f: File) => void) | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // ── Edit / delete state ──────────────────────────────────────────────────
  // ── Pure UI state ──────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editAudioFile, setEditAudioFile] = useState<File | null>(null);
  const [editRemovePhoto, setEditRemovePhoto] = useState(false);
  const [editRemoveAudio, setEditRemoveAudio] = useState(false);
  const [editIsRecording, setEditIsRecording] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const editPhotoRef = useRef<HTMLInputElement>(null);
  const editAudioRef = useRef<HTMLInputElement>(null);
  const editMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const editChunksRef = useRef<Blob[]>([]);

  // ── Recording ────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setRecordingError(null);
    setAudioFile(null);
    if (audioInputRef.current) audioInputRef.current.value = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File([blob], 'recording.webm', { type: blob.type });
        setAudioFile(file);
        // Resolve the promise if submit triggered the stop
        audioReadyResolveRef.current?.(file);
        audioReadyResolveRef.current = null;
      };
      recorder.start(200);
      setIsRecording(true);
    } catch (err) {
      setRecordingError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const clearAudio = useCallback(() => {
    setAudioFile(null);
    setRecordingError(null);
    if (audioInputRef.current) audioInputRef.current.value = '';
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────

  // Add moment — can't be fully optimistic (needs server-assigned ID + AI transcript)
  const addMutation = useMutation({
    mutationFn: async (form: FormData) => {
      const res = await fetch(`/api/albums/${albumId}/moments`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Upload failed');
      }
      return res.json() as Promise<Moment>;
    },
    onSuccess: (newMoment) => {
      // Prepend the new moment without a full refetch
      queryClient.setQueryData<Moment[]>(['moments', albumId], (old = []) => [
        newMoment,
        ...old,
      ]);
      setPhotoFile(null);
      setAudioFile(null);
      setMomentDate(new Date().toISOString().slice(0, 10));
      if (photoInputRef.current) photoInputRef.current.value = '';
      if (audioInputRef.current) audioInputRef.current.value = '';
    },
  });

  // Delete moment (Server Action + optimistic — disappears instantly, rolls back on error)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMomentAction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['moments', albumId] });
      const prev = queryClient.getQueryData<Moment[]>(['moments', albumId]);
      queryClient.setQueryData<Moment[]>(['moments', albumId], (old = []) =>
        old.filter((m) => m.id !== id)
      );
      setConfirmDeleteId(null);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(['moments', albumId], ctx?.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['moments', albumId] });
    },
  });

  // Update moment
  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: FormData }) => {
      const res = await fetch(`/api/moments/${id}`, { method: 'PATCH', body: form });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Update failed');
      }
      return res.json() as Promise<Moment>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Moment[]>(['moments', albumId], (old = []) =>
        old.map((m) => (m.id === updated.id ? updated : m))
      );
      cancelEdit();
    },
  });

  const pageError =
    (addMutation.error as Error | null)?.message ??
    (deleteMutation.error as Error | null)?.message ??
    (updateMutation.error as Error | null)?.message ??
    null;

  // ── Submit — auto-stops recording if still active ────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoFile) return;

    // If still recording, stop it and wait for the blob before uploading
    let resolvedAudio = audioFile;
    if (isRecording) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        resolvedAudio = await new Promise<File>((resolve) => {
          audioReadyResolveRef.current = resolve;
          recorder.stop();
        });
        mediaRecorderRef.current = null;
      }
      setIsRecording(false);
    }

    const form = new FormData();
    form.append('photo', photoFile);
    if (resolvedAudio) form.append('audio', resolvedAudio);
    form.append('recordedAt', momentDate);
    addMutation.mutate(form);
  };

  // ── Edit helpers ──────────────────────────────────────────────────────────
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditPhotoFile(null);
    setEditAudioFile(null);
    setEditRemovePhoto(false);
    setEditRemoveAudio(false);
    setEditIsRecording(false);
    if (editPhotoRef.current) editPhotoRef.current.value = '';
    if (editAudioRef.current) editAudioRef.current.value = '';
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditingId(id);
    setEditPhotoFile(null);
    setEditAudioFile(null);
    setEditRemovePhoto(false);
    setEditRemoveAudio(false);
    setConfirmDeleteId(null);
    if (editPhotoRef.current) editPhotoRef.current.value = '';
    if (editAudioRef.current) editAudioRef.current.value = '';
  }, []);

  const startEditRecording = useCallback(async () => {
    setEditAudioFile(null);
    if (editAudioRef.current) editAudioRef.current.value = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream);
      editMediaRecorderRef.current = recorder;
      editChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) editChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(editChunksRef.current, { type: mime });
        setEditAudioFile(new File([blob], 'recording.webm', { type: blob.type }));
      };
      recorder.start(200);
      setEditIsRecording(true);
    } catch { /* ignore mic errors */ }
  }, []);

  const stopEditRecording = useCallback(() => {
    const recorder = editMediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      editMediaRecorderRef.current = null;
    }
    setEditIsRecording(false);
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update ────────────────────────────────────────────────────────────────
  const handleUpdate = (id: string) => {
    if (!editPhotoFile && !editAudioFile && !editRemovePhoto && !editRemoveAudio) {
      cancelEdit();
      return;
    }
    const form = new FormData();
    if (editPhotoFile) form.append('photo', editPhotoFile);
    if (editAudioFile) form.append('audio', editAudioFile);
    if (editRemovePhoto) form.append('removePhoto', 'true');
    if (editRemoveAudio) form.append('removeAudio', 'true');
    updateMutation.mutate({ id, form });
  };

  // ────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Botanical corner decorations — fixed to viewport */}
      <div
        className="pointer-events-none fixed top-0 left-0 w-56 h-56 opacity-30 select-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        <BotanicalCorner />
      </div>
      <div
        className="pointer-events-none fixed bottom-0 right-0 w-56 h-56 opacity-30 select-none rotate-180"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        <BotanicalCorner />
      </div>

      {/* Breadcrumb + Export PDF */}
      <div className="relative flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/dashboard"
            className="text-sm text-nest-400 hover:text-nest-700 transition-colors shrink-0"
          >
            ← Albums
          </Link>
          <span className="text-nest-300 shrink-0">/</span>
          <h1 className="font-serif text-lg font-medium text-nest-700 truncate">
            {album?.name ?? '…'}
          </h1>
        </div>
        <a
          href={`/api/export/pdf?albumId=${albumId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-nest-500 hover:text-nest-700 underline underline-offset-2 shrink-0 ml-4 transition-colors no-print"
        >
          Export PDF
        </a>
      </div>

      {/* ── Add a moment ─────────────────────────────────────────────────── */}
      <section className="mb-14 relative">
        {/* Cursive heading with gradient decorative rules */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-nest-300" />
          <h2 className="font-cursive text-[2.1rem] md:text-[2.6rem] text-nest-800 px-3 leading-tight whitespace-nowrap">
            Add a moment
          </h2>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-nest-300" />
        </div>

        {/* Paper-like form card */}
        <div className="max-w-[600px] mx-auto bg-[rgba(255,255,255,0.82)] rounded-2xl border border-[#e2d8c8] shadow-[0_4px_12px_rgba(0,0,0,0.10)] p-6 md:p-8 print-card">
          <form onSubmit={handleSubmit}>

            {/* ── Photo ── */}
            <div className="pb-6 mb-6 border-b border-[#ece4d8]">
              <p className="text-sm font-normal text-[#5a4a42] mb-3">
                Photo
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={photoInputRef}
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <label
                  htmlFor="photo-upload"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-nest-700 text-white text-sm rounded-full cursor-pointer shadow-sm hover:bg-nest-800 active:scale-95 transition-all select-none"
                >
                  📷 Upload Photo
                </label>
                <span className="text-sm text-nest-400 italic">
                  {photoFile ? photoFile.name : 'No file chosen'}
                </span>
              </div>
            </div>

            {/* ── Date ── */}
            <div className="pb-6 mb-6 border-b border-[#ece4d8]">
              <p className="text-sm font-normal text-[#5a4a42] mb-3">
                Date
              </p>
              <input
                type="date"
                value={momentDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setMomentDate(e.target.value)}
                className="text-sm text-nest-700 border border-[#d9cfb8] rounded-xl px-4 py-2.5 bg-white/80 shadow-sm focus:outline-none focus:ring-2 focus:ring-nest-300 focus:border-nest-400 transition-shadow"
              />
              <p className="mt-2 text-xs text-nest-400">
                Select any past or present date to capture a memory.
              </p>
            </div>

            {/* ── Voice Note ── */}
            <div className="mb-8">
              <p className="text-sm font-normal text-[#5a4a42] mb-3">
                Voice Note{' '}
                <span className="text-[#8a7c74]">(Optional)</span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={audioInputRef}
                  id="audio-upload"
                  type="file"
                  accept="audio/*"
                  disabled={isRecording}
                  onChange={(e) => {
                    setRecordingError(null);
                    setAudioFile(e.target.files?.[0] ?? null);
                  }}
                  className="sr-only"
                />
                <label
                  htmlFor="audio-upload"
                  className={`inline-flex items-center gap-2 px-4 py-2 bg-nest-700 text-white text-sm rounded-full cursor-pointer shadow-sm hover:bg-nest-800 active:scale-95 transition-all select-none${isRecording ? ' opacity-50 pointer-events-none' : ''}`}
                >
                  🎧 Upload Audio
                </label>
                <span className="text-sm text-nest-400 italic">
                  {audioFile ? audioFile.name : 'No file chosen'}
                </span>
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 text-nest-700 text-sm rounded-full border border-[#d9cfb8] shadow-sm hover:bg-[#f5f0e6] active:scale-95 transition-all"
                  >
                    🎙 Record
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm rounded-full border border-red-200 shadow-sm hover:bg-red-100 active:scale-95 transition-all"
                  >
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Stop Recording
                  </button>
                )}
                {audioFile && !isRecording && (
                  <button
                    type="button"
                    onClick={clearAudio}
                    className="text-sm text-nest-400 hover:text-nest-600 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-nest-400">
                Upload a file or record a message — we&apos;ll transcribe it into a short story.
              </p>
              {isRecording && (
                <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
                  Recording in progress — clicking &quot;Add Moment&quot; will automatically stop and save it.
                </p>
              )}
              {recordingError && (
                <p className="mt-1 text-xs text-red-500">{recordingError}</p>
              )}
            </div>

            {pageError && (
              <p className="text-sm text-red-600 bg-red-50/80 px-4 py-2.5 rounded-xl mb-6 border border-red-100">
                {pageError}
              </p>
            )}

            {/* Submit */}
            <div className="flex justify-center pt-2">
              <button
                type="submit"
                disabled={addMutation.isPending || !photoFile}
                className="px-8 py-3 bg-nest-700 text-white rounded-full font-medium text-sm shadow-md hover:bg-nest-800 hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                {addMutation.isPending
                  ? (audioFile || isRecording ? 'Transcribing & saving…' : 'Saving…')
                  : isRecording
                    ? '⏹ Stop & Add Moment'
                    : 'Add Moment'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Recent Moments ───────────────────────────────────────────────── */}
      <section>
        {/* Cursive heading with gradient decorative rules */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-nest-300" />
          <h2 className="font-cursive text-[1.9rem] md:text-[2.2rem] text-nest-800 px-3 leading-tight whitespace-nowrap">
            Recent Moments
          </h2>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-nest-300" />
        </div>

        <div className="flex justify-end mb-4 no-print">
          <button
            type="button"
            onClick={() => void refetchMoments()}
            disabled={momentsLoading}
            className="text-xs text-nest-400 hover:text-nest-600 disabled:opacity-50 transition-colors"
          >
            {momentsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {moments.length === 0 && !momentsLoading && (
          <div className="text-center py-16">
            <p className="text-nest-400 text-sm font-serif italic">
              No moments yet. Add a photo above to get started.
            </p>
          </div>
        )}

        <ul className="space-y-8">
          {moments.map((m) => {
            const photo = getFirstPhoto(m);
            return (
              <li
                key={m.id}
                className="bg-[#faf8f4] rounded-2xl border border-[#e2d8c8] shadow-[0_4px_20px_rgba(90,65,40,0.09)] overflow-hidden print-card"
              >
                {photo && (
                  <div className="relative aspect-[4/3] bg-nest-100">
                    <Image
                      src={`/uploads/${photo.replace(/\\/g, '/')}`}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 768px"
                      unoptimized
                    />
                  </div>
                )}
                <div className="p-5 md:p-6">
                  <time className="text-xs font-medium text-nest-400 tracking-wide uppercase">
                    {format(new Date(m.recordedAt), 'MMMM d, yyyy')}
                  </time>
                  {m.vignette && (
                    <p className="mt-3 font-serif text-nest-800 text-[15px] leading-relaxed">
                      {m.vignette}
                    </p>
                  )}
                  {m.transcript && (
                    <details className="mt-3">
                      <summary className="text-xs text-nest-400 cursor-pointer hover:text-nest-600 select-none transition-colors">
                        {m.vignette ? 'Show exact words' : 'Transcript'}
                      </summary>
                      <p className="mt-1.5 text-xs text-nest-500 leading-relaxed italic">
                        {m.transcript}
                      </p>
                    </details>
                  )}
                  {!m.vignette && !m.transcript && m.audioPath && (
                    <p className="mt-3 text-xs text-nest-400 italic">
                      Voice note recorded — transcription unavailable.
                    </p>
                  )}

                  {/* Edit / Delete toolbar */}
                  <div className="mt-5 flex items-center gap-3 pt-4 border-t border-[#ece4d8] no-print">
                    <button
                      type="button"
                      onClick={() => openEdit(m.id)}
                      className="text-xs text-nest-500 hover:text-nest-700 font-medium transition-colors"
                    >
                      Edit
                    </button>
                    {confirmDeleteId === m.id ? (
                      <span className="flex items-center gap-2 ml-auto">
                        <span className="text-xs text-nest-500">Delete this moment?</span>
                        <button
                          type="button"
                          disabled={deleteMutation.isPending && deleteMutation.variables === m.id}
                          onClick={() => handleDelete(m.id)}
                          className="text-xs text-red-500 font-semibold hover:text-red-600 disabled:opacity-50 transition-colors"
                        >
                          {deleteMutation.isPending && deleteMutation.variables === m.id
                            ? 'Deleting…'
                            : 'Yes, delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-nest-400 hover:text-nest-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setConfirmDeleteId(m.id); setEditingId(null); }}
                        className="text-xs text-nest-400 hover:text-red-400 ml-auto transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Inline edit panel ──────────────────────────────────── */}
                {editingId === m.id && (
                  <div className="border-t border-[#ece4d8] bg-[#f7f3ee]/70 p-5 space-y-4 no-print">
                    <p className="text-xs font-semibold text-nest-600 uppercase tracking-widest">
                      Edit moment
                    </p>

                    {/* Edit photo */}
                    <div>
                      <p className="text-xs font-medium text-nest-600 mb-2">Photo</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {!editRemovePhoto ? (
                          <>
                            <input
                              ref={editPhotoRef}
                              id={`edit-photo-${m.id}`}
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                setEditRemovePhoto(false);
                                setEditPhotoFile(e.target.files?.[0] ?? null);
                              }}
                              className="sr-only"
                            />
                            <label
                              htmlFor={`edit-photo-${m.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-nest-700 text-white text-xs rounded-full cursor-pointer hover:bg-nest-800 transition-colors shadow-sm select-none"
                            >
                              Replace Photo
                            </label>
                            {editPhotoFile && (
                              <span className="text-xs text-nest-400 italic">{editPhotoFile.name}</span>
                            )}
                            {(m.photos.length > 0 || m.photoPath) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditRemovePhoto(true);
                                  setEditPhotoFile(null);
                                  if (editPhotoRef.current) editPhotoRef.current.value = '';
                                }}
                                className="text-xs text-red-400 hover:text-red-600 transition-colors"
                              >
                                Remove photo
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-red-500 italic">Photo will be removed</span>
                            <button
                              type="button"
                              onClick={() => setEditRemovePhoto(false)}
                              className="text-xs text-nest-500 hover:text-nest-700 transition-colors"
                            >
                              Undo
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Edit audio */}
                    <div>
                      <p className="text-xs font-medium text-nest-600 mb-2">Voice note</p>
                      {!editRemoveAudio ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={editAudioRef}
                            id={`edit-audio-${m.id}`}
                            type="file"
                            accept="audio/*"
                            disabled={editIsRecording}
                            onChange={(e) => setEditAudioFile(e.target.files?.[0] ?? null)}
                            className="sr-only"
                          />
                          <label
                            htmlFor={`edit-audio-${m.id}`}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-nest-700 text-white text-xs rounded-full cursor-pointer hover:bg-nest-800 transition-colors shadow-sm select-none${editIsRecording ? ' opacity-50 pointer-events-none' : ''}`}
                          >
                            Replace Audio
                          </label>
                          {!editIsRecording ? (
                            <button
                              type="button"
                              onClick={startEditRecording}
                              className="px-3 py-1.5 text-xs text-nest-600 rounded-full border border-[#d9cfb8] bg-white/80 hover:bg-nest-50 transition-colors shadow-sm"
                            >
                              Record
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={stopEditRecording}
                              className="px-3 py-1.5 text-xs text-red-700 rounded-full border border-red-200 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              Stop
                            </button>
                          )}
                          {m.audioPath && !editAudioFile && !editIsRecording && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditRemoveAudio(true);
                                setEditAudioFile(null);
                                if (editAudioRef.current) editAudioRef.current.value = '';
                              }}
                              className="text-xs text-red-400 hover:text-red-600 transition-colors"
                            >
                              Remove audio
                            </button>
                          )}
                          {editAudioFile && !editIsRecording && (
                            <span className="text-xs text-green-600 italic">✓ New audio ready</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-500 italic">Voice note will be removed</span>
                          <button
                            type="button"
                            onClick={() => setEditRemoveAudio(false)}
                            className="text-xs text-nest-500 hover:text-nest-700 transition-colors"
                          >
                            Undo
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Save / Cancel */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        disabled={updateMutation.isPending}
                        onClick={() => handleUpdate(m.id)}
                        className="px-4 py-1.5 bg-nest-700 text-white rounded-full text-xs font-medium hover:bg-nest-800 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-sm"
                      >
                        {updateMutation.isPending
                          ? editAudioFile
                            ? 'Transcribing…'
                            : 'Saving…'
                          : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        disabled={updateMutation.isPending}
                        onClick={cancelEdit}
                        className="text-xs text-nest-400 hover:text-nest-600 disabled:opacity-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

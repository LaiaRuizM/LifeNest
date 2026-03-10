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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/dashboard"
            className="text-sm text-nest-400 hover:text-nest-700 transition-colors shrink-0"
          >
            ← Albums
          </Link>
          <span className="text-nest-200 shrink-0">/</span>
          <h1 className="font-serif text-xl font-medium text-nest-800 truncate">
            {album?.name ?? '…'}
          </h1>
        </div>
        <a
          href={`/api/export/pdf?albumId=${albumId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-nest-600 hover:text-nest-800 underline underline-offset-2 shrink-0 ml-4"
        >
          Export PDF
        </a>
      </div>

      {/* ── Add moment form ──────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="font-serif text-lg font-medium text-nest-800 mb-4">Add a moment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Photo */}
          <div>
            <label className="block text-sm font-medium text-nest-700 mb-1">Photo *</label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-nest-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-nest-100 file:text-nest-800 file:font-medium"
            />
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-sm font-medium text-nest-700 mb-1">Date</label>
            <input
              type="date"
              value={momentDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setMomentDate(e.target.value)}
              className="block text-sm text-nest-700 border border-nest-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-nest-400 bg-white"
            />
            <p className="mt-1 text-xs text-nest-400">
              Pick any past or present date — perfect for filling in old memories.
            </p>
          </div>

          {/* Voice note */}
          <div>
            <label className="block text-sm font-medium text-nest-700 mb-1">
              Voice note <span className="font-normal text-nest-400">(optional)</span>
            </label>
            <p className="mb-2 text-xs text-nest-500">
              Upload a file or record now. Any language works — we'll transcribe it and turn it
              into a short vignette.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                disabled={isRecording}
                onChange={(e) => {
                  setRecordingError(null);
                  setAudioFile(e.target.files?.[0] ?? null);
                }}
                className="block text-sm text-nest-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-nest-100 file:text-nest-800 file:font-medium disabled:opacity-50"
              />
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="px-3 py-2 rounded-lg border border-nest-300 text-nest-700 text-sm font-medium hover:bg-nest-100"
                >
                  Record
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-3 py-2 rounded-lg bg-red-100 text-red-800 text-sm font-medium hover:bg-red-200 flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Stop recording
                </button>
              )}
              {audioFile && !isRecording && (
                <button
                  type="button"
                  onClick={clearAudio}
                  className="text-sm text-nest-500 hover:text-nest-700"
                >
                  Clear
                </button>
              )}
            </div>
            {isRecording && (
              <p className="mt-1.5 text-xs text-amber-600">
                🎙 Recording in progress — clicking &quot;Add moment&quot; will automatically stop
                and save it.
              </p>
            )}
            {recordingError && (
              <p className="mt-1 text-xs text-red-600">{recordingError}</p>
            )}
          </div>

          {pageError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{pageError}</p>
          )}

          <button
            type="submit"
            disabled={addMutation.isPending || !photoFile}
            className="px-4 py-2.5 bg-nest-700 text-white rounded-lg font-medium text-sm hover:bg-nest-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {addMutation.isPending
              ? (audioFile || isRecording ? 'Transcribing & saving…' : 'Saving…')
              : isRecording
                ? '⏹ Stop & add moment'
                : 'Add moment'}
          </button>
        </form>
      </section>

      {/* ── Moments list ────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-medium text-nest-800">Moments</h2>
          <button
            type="button"
            onClick={() => void refetchMoments()}
            disabled={momentsLoading}
            className="text-sm text-nest-600 hover:text-nest-800 disabled:opacity-50"
          >
            {momentsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {moments.length === 0 && !momentsLoading && (
          <p className="text-nest-500 text-sm py-8 text-center">
            No moments yet. Add a photo above to get started.
          </p>
        )}

        <ul className="space-y-8">
          {moments.map((m) => {
            const photo = getFirstPhoto(m);
            return (
              <li
                key={m.id}
                className="border border-nest-200/80 rounded-xl overflow-hidden bg-white shadow-sm"
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
                <div className="p-4">
                  <time className="text-xs text-nest-500 font-medium">
                    {format(new Date(m.recordedAt), 'MMMM d, yyyy')}
                  </time>
                  {m.vignette && (
                    <p className="mt-2 font-serif text-nest-800 text-[15px] leading-relaxed">
                      {m.vignette}
                    </p>
                  )}
                  {m.transcript && (
                    <details className="mt-2">
                      <summary className="text-xs text-nest-400 cursor-pointer hover:text-nest-600 select-none">
                        {m.vignette ? 'Show exact words' : 'Transcript'}
                      </summary>
                      <p className="mt-1 text-xs text-nest-500 leading-relaxed">
                        {m.transcript}
                      </p>
                    </details>
                  )}
                  {!m.vignette && !m.transcript && m.audioPath && (
                    <p className="mt-2 text-xs text-nest-500 italic">
                      Voice note recorded — transcription unavailable.
                    </p>
                  )}

                  {/* Edit / Delete toolbar */}
                  <div className="mt-4 flex items-center gap-3 pt-3 border-t border-nest-100">
                    <button
                      type="button"
                      onClick={() => openEdit(m.id)}
                      className="text-xs text-nest-500 hover:text-nest-700 font-medium"
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
                          className="text-xs text-red-600 font-semibold hover:text-red-700 disabled:opacity-50"
                        >
                          {deleteMutation.isPending && deleteMutation.variables === m.id
                            ? 'Deleting…'
                            : 'Yes, delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-nest-400 hover:text-nest-600"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setConfirmDeleteId(m.id); setEditingId(null); }}
                        className="text-xs text-nest-400 hover:text-red-500 ml-auto"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Inline edit panel ──────────────────────────────────── */}
                {editingId === m.id && (
                  <div className="border-t border-nest-100 bg-nest-50/40 p-4 space-y-4">
                    <p className="text-xs font-semibold text-nest-700 uppercase tracking-wide">
                      Edit moment
                    </p>

                    {/* Edit photo */}
                    <div>
                      <p className="text-xs font-medium text-nest-700 mb-1.5">Photo</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {!editRemovePhoto ? (
                          <>
                            <input
                              ref={editPhotoRef}
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                setEditRemovePhoto(false);
                                setEditPhotoFile(e.target.files?.[0] ?? null);
                              }}
                              className="block text-xs text-nest-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-nest-100 file:text-nest-800 file:text-xs"
                            />
                            {(m.photos.length > 0 || m.photoPath) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditRemovePhoto(true);
                                  setEditPhotoFile(null);
                                  if (editPhotoRef.current) editPhotoRef.current.value = '';
                                }}
                                className="text-xs text-red-400 hover:text-red-600"
                              >
                                Remove photo
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-red-500">Photo will be removed</span>
                            <button
                              type="button"
                              onClick={() => setEditRemovePhoto(false)}
                              className="text-xs text-nest-500 hover:text-nest-700"
                            >
                              Undo
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Edit audio */}
                    <div>
                      <p className="text-xs font-medium text-nest-700 mb-1.5">Voice note</p>
                      {!editRemoveAudio ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={editAudioRef}
                            type="file"
                            accept="audio/*"
                            disabled={editIsRecording}
                            onChange={(e) => setEditAudioFile(e.target.files?.[0] ?? null)}
                            className="block text-xs text-nest-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-nest-100 file:text-nest-800 file:text-xs disabled:opacity-50"
                          />
                          {!editIsRecording ? (
                            <button
                              type="button"
                              onClick={startEditRecording}
                              className="px-2.5 py-1.5 rounded border border-nest-300 text-nest-700 text-xs font-medium hover:bg-nest-100"
                            >
                              Record
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={stopEditRecording}
                              className="px-2.5 py-1.5 rounded bg-red-100 text-red-800 text-xs font-medium flex items-center gap-1.5"
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
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              Remove audio
                            </button>
                          )}
                          {editAudioFile && !editIsRecording && (
                            <span className="text-xs text-green-600">✓ New audio ready</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-500">Voice note will be removed</span>
                          <button
                            type="button"
                            onClick={() => setEditRemoveAudio(false)}
                            className="text-xs text-nest-500 hover:text-nest-700"
                          >
                            Undo
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Save / Cancel */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={updateMutation.isPending}
                        onClick={() => handleUpdate(m.id)}
                        className="px-3 py-1.5 bg-nest-700 text-white rounded text-xs font-medium hover:bg-nest-800 disabled:opacity-50 disabled:pointer-events-none"
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
                        className="text-xs text-nest-500 hover:text-nest-700 disabled:opacity-50"
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

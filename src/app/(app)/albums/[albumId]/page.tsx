'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';

type Moment = {
  id: string;
  photos: string[];
  audioPath: string | null;
  transcript: string | null;
  vignette: string | null;
  recordedAt: string;
};

type Album = {
  id: string;
  name: string;
};

function getFirstPhoto(m: Moment): string | null {
  return m.photos?.[0] ?? null;
}

export default function AlbumPage() {
  const params = useParams();
  const albumId = params.albumId as string;

  const [album, setAlbum] = useState<Album | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Load album details
  useEffect(() => {
    fetch(`/api/albums/${albumId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAlbum(data));
  }, [albumId]);

  const loadMoments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/albums/${albumId}/moments`);
      if (!res.ok) throw new Error('Failed to load');
      setMoments(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    loadMoments();
  }, [loadMoments]);

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
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        setAudioFile(new File([blob], 'recording.webm', { type: blob.type }));
      };
      recorder.start(200);
      setIsRecording(true);
    } catch (err) {
      setRecordingError(
        err instanceof Error ? err.message : 'Microphone access denied'
      );
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoFile) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('photo', photoFile);
      if (audioFile) form.append('audio', audioFile);
      const res = await fetch(`/api/albums/${albumId}/moments`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      const newMoment = await res.json();
      setMoments((prev) => [newMoment, ...prev]);
      setPhotoFile(null);
      setAudioFile(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      if (audioInputRef.current) audioInputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Breadcrumb + album header */}
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

      {/* Add moment */}
      <section className="mb-10">
        <h2 className="font-serif text-lg font-medium text-nest-800 mb-4">Add a moment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium text-nest-700 mb-1">
              Voice note (optional)
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
            {recordingError && (
              <p className="mt-1 text-xs text-red-600">{recordingError}</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <button
            type="submit"
            disabled={uploading || !photoFile}
            className="px-4 py-2.5 bg-nest-700 text-white rounded-lg font-medium text-sm hover:bg-nest-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {uploading
              ? audioFile
                ? 'Transcribing & saving…'
                : 'Saving…'
              : 'Add moment'}
          </button>
        </form>
      </section>

      {/* Moments list */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-medium text-nest-800">Moments</h2>
          <button
            type="button"
            onClick={loadMoments}
            disabled={loading}
            className="text-sm text-nest-600 hover:text-nest-800 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {moments.length === 0 && !loading && (
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
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

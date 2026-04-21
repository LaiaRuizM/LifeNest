'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  renameAlbum as renameAlbumAction,
  deleteAlbum as deleteAlbumAction,
} from '@/lib/actions/album';

type Album = {
  id: string;
  name: string;
  createdAt: string;
  _count: { moments: number };
};

async function fetchAlbums(): Promise<Album[]> {
  const res = await fetch('/api/albums');
  if (!res.ok) throw new Error('Failed to load albums');
  return res.json() as Promise<Album[]>;
}

async function createAlbumRequest(name: string): Promise<Album> {
  const res = await fetch('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? 'Failed to create album');
  }
  return res.json() as Promise<Album>;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Pure UI state — not server state, so useState is correct here
  const [newAlbumName, setNewAlbumName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const { data: albums = [], isLoading, error: fetchError } = useQuery({
    queryKey: ['albums'],
    queryFn: fetchAlbums,
  });

  // ── Create (optimistic) ────────────────────────────────────────────────────
  // The placeholder album appears immediately; if the request fails it rolls back.
  const createMutation = useMutation({
    mutationFn: createAlbumRequest,
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: ['albums'] });
      const prev = queryClient.getQueryData<Album[]>(['albums']);
      queryClient.setQueryData<Album[]>(['albums'], (old = []) => [
        {
          id: `temp-${Date.now()}`,
          name: name || 'My life album',
          createdAt: new Date().toISOString(),
          _count: { moments: 0 },
        },
        ...old,
      ]);
      return { prev };
    },
    onError: (_err, _name, ctx) => {
      queryClient.setQueryData(['albums'], ctx?.prev);
    },
    onSuccess: (album) => {
      setNewAlbumName('');
      router.push(`/albums/${album.id}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });

  // ── Rename (Server Action + optimistic) ───────────────────────────────────
  // Uses a Server Action — no separate API route needed for this simple mutation.
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameAlbumAction(id, name),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: ['albums'] });
      const prev = queryClient.getQueryData<Album[]>(['albums']);
      queryClient.setQueryData<Album[]>(['albums'], (old = []) =>
        old.map((a) => (a.id === id ? { ...a, name } : a))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['albums'], ctx?.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['albums'] });
      setEditingId(null);
    },
  });

  // ── Delete (Server Action + optimistic) ───────────────────────────────────
  // The album vanishes instantly; rolls back automatically on error.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAlbumAction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['albums'] });
      const prev = queryClient.getQueryData<Album[]>(['albums']);
      queryClient.setQueryData<Album[]>(['albums'], (old = []) =>
        old.filter((a) => a.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(['albums'], ctx?.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newAlbumName || 'My life album');
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    renameMutation.mutate({ id, name: editName });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this album and all its moments? This cannot be undone.')) return;
    deleteMutation.mutate(id);
  };

  const mutationError =
    (createMutation.error as Error | null)?.message ??
    (renameMutation.error as Error | null)?.message ??
    (deleteMutation.error as Error | null)?.message ??
    (fetchError as Error | null)?.message ??
    null;

  return (
    <>
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-medium text-nest-800">Your albums</h1>
        {session?.user?.name && (
          <p className="text-sm text-nest-500 mt-1">Welcome back, {session.user.name}</p>
        )}
      </div>

      {/* Create album */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-8">
        <input
          type="text"
          value={newAlbumName}
          onChange={(e) => setNewAlbumName(e.target.value)}
          placeholder="New album name…"
          className="flex-1 border border-nest-200 rounded-lg px-3 py-2 text-sm text-nest-900 placeholder:text-nest-400 focus:outline-none focus:ring-2 focus:ring-nest-300"
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="px-4 py-2 bg-nest-700 text-white rounded-lg font-medium text-sm hover:bg-nest-800 disabled:opacity-50 disabled:pointer-events-none"
        >
          {createMutation.isPending ? 'Creating…' : '+ New album'}
        </button>
      </form>

      {mutationError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{mutationError}</p>
      )}

      {isLoading && <p className="text-sm text-nest-500">Loading albums…</p>}

      {!isLoading && albums.length === 0 && (
        <div className="text-center py-20 text-nest-400">
          <p className="font-serif text-xl mb-2">No albums yet</p>
          <p className="text-sm">Create your first album above to start collecting moments.</p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {albums.map((album) => (
          <li
            key={album.id}
            onClick={() => editingId !== album.id && router.push(`/albums/${album.id}`)}
            className="bg-white border border-nest-200/80 rounded-xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          >
            {editingId === album.id ? (
              <div className="flex gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(album.id)}
                  autoFocus
                  className="flex-1 border border-nest-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-nest-300"
                />
                <button
                  onClick={() => handleRename(album.id)}
                  disabled={renameMutation.isPending}
                  className="text-xs text-nest-700 font-medium hover:text-nest-900 disabled:opacity-50"
                >
                  {renameMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-nest-400 hover:text-nest-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2 className="font-serif text-lg font-medium text-nest-800 group-hover:text-nest-600 transition-colors">
                {album.name}
              </h2>
            )}

            <div className="flex items-center justify-between mt-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs text-nest-400">
                {album._count.moments} moment{album._count.moments !== 1 ? 's' : ''}
                <span className="mx-1.5">·</span>
                {format(new Date(album.createdAt), 'MMM d, yyyy')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditingId(album.id);
                    setEditName(album.name);
                  }}
                  className="text-xs text-nest-400 hover:text-nest-600 transition-colors"
                >
                  Rename
                </button>
                <button
                  onClick={() => handleDelete(album.id)}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

type Album = {
  id: string;
  name: string;
  createdAt: string;
  _count: { moments: number };
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/albums');
      if (!res.ok) throw new Error('Failed to load');
      setAlbums(await res.json());
    } catch {
      setError('Failed to load albums');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  const createAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAlbumName || 'My life album' }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const album = await res.json();
      setNewAlbumName('');
      router.push(`/albums/${album.id}`);
    } catch {
      setError('Failed to create album');
      setCreating(false);
    }
  };

  const renameAlbum = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await fetch(`/api/albums/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      setAlbums((prev) => prev.map((a) => (a.id === id ? { ...a, name: editName } : a)));
      setEditingId(null);
    } catch {
      setError('Failed to rename album');
    }
  };

  const deleteAlbum = async (id: string) => {
    if (!confirm('Delete this album and all its moments? This cannot be undone.')) return;
    try {
      await fetch(`/api/albums/${id}`, { method: 'DELETE' });
      setAlbums((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError('Failed to delete album');
    }
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-medium text-nest-800">Your albums</h1>
        {session?.user?.name && (
          <p className="text-sm text-nest-500 mt-1">Welcome back, {session.user.name}</p>
        )}
      </div>

      {/* Create album */}
      <form onSubmit={createAlbum} className="flex gap-2 mb-8">
        <input
          type="text"
          value={newAlbumName}
          onChange={(e) => setNewAlbumName(e.target.value)}
          placeholder="New album name…"
          className="flex-1 border border-nest-200 rounded-lg px-3 py-2 text-sm text-nest-900 placeholder:text-nest-400 focus:outline-none focus:ring-2 focus:ring-nest-300"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 bg-nest-700 text-white rounded-lg font-medium text-sm hover:bg-nest-800 disabled:opacity-50 disabled:pointer-events-none"
        >
          {creating ? 'Creating…' : '+ New album'}
        </button>
      </form>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
      )}

      {loading && <p className="text-sm text-nest-500">Loading albums…</p>}

      {!loading && albums.length === 0 && (
        <div className="text-center py-20 text-nest-400">
          <p className="font-serif text-xl mb-2">No albums yet</p>
          <p className="text-sm">Create your first album above to start collecting moments.</p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {albums.map((album) => (
          <li
            key={album.id}
            className="bg-white border border-nest-200/80 rounded-xl p-5 shadow-sm"
          >
            {editingId === album.id ? (
              <div className="flex gap-2 mb-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && renameAlbum(album.id)}
                  autoFocus
                  className="flex-1 border border-nest-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-nest-300"
                />
                <button
                  onClick={() => renameAlbum(album.id)}
                  className="text-xs text-nest-700 font-medium hover:text-nest-900"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-nest-400 hover:text-nest-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => router.push(`/albums/${album.id}`)}
                className="text-left w-full group"
              >
                <h2 className="font-serif text-lg font-medium text-nest-800 group-hover:text-nest-600 transition-colors">
                  {album.name}
                </h2>
              </button>
            )}

            <div className="flex items-center justify-between mt-3">
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
                  onClick={() => deleteAlbum(album.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
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

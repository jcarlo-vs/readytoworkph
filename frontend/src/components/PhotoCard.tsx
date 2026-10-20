'use client';
import { useRef, useState } from 'react';
import { api, photoStore, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorText, Initials, card } from '@/components/ui';

const MAX_MB = 10;
const SIZE = 400;

// Center-crops to a square and shrinks to 400px JPEG in the browser. Re-encoding also drops
// EXIF data such as the GPS location phones store in photos.
async function squarePhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(SIZE, side);
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that image'))), 'image/jpeg', 0.85));
}

export function PhotoCard() {
  const { user } = useAuth();
  const [hasPhoto, setHasPhoto] = useState<boolean | undefined>(undefined);
  const [status, setStatus] = useState({ busy: false, error: '' });
  const picker = useRef<HTMLInputElement>(null);
  if (!user) return null;
  const current = hasPhoto ?? !!user.has_photo;

  async function run(task: () => Promise<unknown>, next: boolean) {
    setStatus({ busy: true, error: '' });
    try {
      await task();
      setHasPhoto(next);
      photoStore.bump();
      setStatus({ busy: false, error: '' });
    } catch (err) {
      setStatus({ busy: false, error: (err as Error).message });
    } finally {
      if (picker.current) picker.current.value = '';
    }
  }

  function upload(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setStatus({ busy: false, error: 'Please choose a JPEG, PNG or WebP image.' });
    if (file.size > MAX_MB * 1024 * 1024) return setStatus({ busy: false, error: `That image is over ${MAX_MB} MB. Please choose a smaller one.` });
    run(async () => uploadFile('/profile/photo', await squarePhoto(file)), true);
  }

  return (
    <section className={`${card} space-y-3 p-5`}>
      <h2 className="font-display text-base font-bold">Profile photo <span className="text-sm font-normal text-slate-400">(optional)</span></h2>
      <div className="flex items-center gap-4">
        <Initials name={user.name} id={user.id} size="h-20 w-20 text-2xl" />
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-600 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600/30">
              {status.busy ? 'Uploading…' : current ? 'Change' : 'Upload photo'}
              <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload profile photo"
                disabled={status.busy} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {current && (
              <button type="button" disabled={status.busy} onClick={() => run(() => api('/profile/photo', { method: 'DELETE' }), false)}
                className="rounded-lg px-3 py-1.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Remove</button>
            )}
          </div>
          <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to {MAX_MB} MB. We crop it to a square.</p>
        </div>
      </div>
      <ErrorText msg={status.error} />
    </section>
  );
}

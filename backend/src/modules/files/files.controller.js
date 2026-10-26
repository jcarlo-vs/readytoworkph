// Resumes (PDF) and profile photos, kept private in R2.
import { randomUUID } from 'node:crypto';
import { pdfText } from '../../lib/pdf.js';
import { bad, num } from '../../lib/validate.js';
import { hooks } from '../../services/hooks.js';
import * as Files from './files.model.js';
import { BLANK_GIF, deleteFile, imageType } from './files.service.js';

export const myResume = async (req, res) => {
  const p = await Files.findResume(req.user.id);
  if (!p?.resume_key) return res.json({ resume: null });
  res.json({ resume: { name: p.resume_name, uploaded_at: p.resume_uploaded_at, url: await hooks.storage.signedUrl(p.resume_key, p.resume_name) } });
};

// The browser sends the PDF as the raw request body, with its file name in the X-File-Name header.
export const uploadResume = async (req, res) => {
  const file = req.body;
  if (!Buffer.isBuffer(file) || !file.length) return bad(res, 'Choose a PDF file to upload');
  if (file.subarray(0, 5).toString('latin1') !== '%PDF-') return bad(res, 'Your resume must be a PDF file');
  let name = 'resume.pdf';
  try { name = decodeURIComponent(req.get('x-file-name') ?? '') || name; } catch { /* keep default */ }
  name = name.replace(/[^\w .()-]/g, '_').slice(0, 120);
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';

  const key = `resumes/${req.user.id}/${randomUUID()}.pdf`;
  const [text] = await Promise.all([pdfText(file), hooks.storage.put(key, file, 'application/pdf')]);
  const { saved, oldKey } = await Files.setResume(req.user.id, { key, name, text });
  await deleteFile(oldKey);
  res.json({ resume: { name: saved.resume_name, uploaded_at: saved.resume_uploaded_at, url: await hooks.storage.signedUrl(key, name) } });
};

export const removeResume = async (req, res) => {
  await deleteFile(await Files.removeResume(req.user.id));
  res.status(204).end();
};

export const photo = async (req, res) => {
  const key = await Files.findPhoto(num(req.params.id));
  res.set('Cache-Control', 'public, max-age=60');
  if (!key) return res.type('image/gif').send(BLANK_GIF);
  res.redirect(302, await hooks.storage.signedUrl(key, 'photo', 600));
};

export const uploadPhoto = async (req, res) => {
  const file = req.body;
  const type = Buffer.isBuffer(file) && file.length >= 12 ? imageType(file) : null;
  if (!type) return bad(res, 'Your photo must be a JPEG, PNG or WebP image');
  const key = `photos/${req.user.id}/${randomUUID()}.${type.split('/')[1]}`;
  await hooks.storage.put(key, file, type);
  await deleteFile(await Files.setPhoto(req.user.id, key));
  res.json({ ok: true });
};

export const removePhoto = async (req, res) => {
  await deleteFile(await Files.setPhoto(req.user.id, null));
  res.status(204).end();
};

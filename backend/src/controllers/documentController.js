import { randomUUID } from 'node:crypto';
import { HealthDocument } from '../models/HealthDocument.js';
import { documentView } from '../views/index.js';
import { presignUpload, presignDownload, objectExists, deleteObject } from '../services/storageService.js';
import { badRequest, notFound } from '../utils/errors.js';

const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

async function findDoc(req) {
  const d = await HealthDocument.findOne({ _id: req.params.documentId, petId: req.pet._id, deletedAt: null });
  if (!d) throw notFound('Document not found');
  return d;
}

/** Step 1: reserve a record and hand back a short-lived signed PUT URL. */
export async function requestUpload(req, res) {
  const { filename, contentType, sizeBytes, kind, title, linkedType, linkedId } = req.valid.body;
  if (!!linkedType !== !!linkedId) throw badRequest('linkedType and linkedId must be provided together');
  const fileKey = `pets/${req.userId}/${req.pet._id}/${randomUUID()}.${EXT[contentType]}`;
  const uploadUrl = await presignUpload(fileKey, contentType, sizeBytes); // throws 503 if storage isn't configured
  const doc = await HealthDocument.create({
    petId: req.pet._id, ownerId: req.userId, kind, title: title || filename,
    fileKey, contentType, sizeBytes, linkedType, linkedId,
  });
  res.status(201).json({ document: documentView(doc), uploadUrl, headers: { 'content-type': contentType } });
}

/** Step 2: after the client uploaded, verify the object really exists before marking it ready. */
export async function confirmUpload(req, res) {
  const doc = await findDoc(req);
  if (!(await objectExists(doc.fileKey))) throw badRequest('File has not been uploaded yet');
  doc.status = 'ready';
  await doc.save();
  res.json({ document: documentView(doc) });
}

export async function listDocuments(req, res) {
  const items = await HealthDocument.find({ petId: req.pet._id, deletedAt: null, status: 'ready' }).sort({ createdAt: -1 }).limit(200);
  res.json({ items: items.map(documentView) });
}

export async function documentUrl(req, res) {
  const doc = await findDoc(req);
  res.json({ url: await presignDownload(doc.fileKey), expiresInSeconds: 300 });
}

export async function deleteDocument(req, res) {
  const doc = await findDoc(req);
  doc.deletedAt = new Date();
  await doc.save();
  deleteObject(doc.fileKey).catch(() => {}); // best effort; orphan cleanup job can sweep leftovers
  res.status(204).end();
}

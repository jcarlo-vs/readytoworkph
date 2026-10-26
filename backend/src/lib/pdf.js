// Reading the text out of an uploaded PDF.
import { extractText, getDocumentProxy } from 'unpdf';

// Pulls the text out of a PDF once, at upload, so the analyzer can read it without re-downloading the file.
// Returns '' for scanned (image-only) or broken PDFs. Capped at roughly 4 pages of text.
export async function pdfText(buffer) {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buffer)), { mergePages: true });
    return text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 12000);
  } catch {
    return '';
  }
}

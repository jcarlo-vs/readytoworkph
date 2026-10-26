// Admin › Testing zone: try the Smart Score with Claude on Vertex AI or Anthropic. Nothing is saved.
import { pdfText } from '../../lib/pdf.js';
import { bad, str } from '../../lib/validate.js';
import { hooks } from '../../services/hooks.js';

// Step 1: the PDF's text, read the same way as a worker's resume.
export const resumeText = async (req, res) => {
    const file = req.body;
    if (!Buffer.isBuffer(file) || file.subarray(0, 5).toString('latin1') !== '%PDF-') return bad(res, 'Choose a PDF file');
    res.json({ text: await pdfText(file) });
  };

// Step 2: score that text against the job.
export const score = async (req, res) => {
  const title = str(req.body?.title, 200);
  const description = str(req.body?.description, 20000);
  const resumeText = str(req.body?.resume_text, 12000);
  const provider = req.body?.provider === 'anthropic' ? 'anthropic' : 'vertex';
  if (!title || !description) return bad(res, 'Add a job title and description');
  const started = Date.now();
  try {
    const result = await hooks.analyzeApplication({
      job: { title, description, skills: [], job_type: 'not specified' },
      applicant: { cover_letter: 'Not provided (resume-only test).', resume_text: resumeText },
    }, provider === 'vertex' ? hooks.vertexClient() : undefined);
    res.json({ provider, ms: Date.now() - started, ...result });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `${provider === 'vertex' ? 'Vertex AI' : 'Anthropic'} call failed: ${err.message}` });
  }
};

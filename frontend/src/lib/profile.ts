// Labels for the worker profile's optional fields, shared by the profile page and the edit page.
// The values match the API's allowed lists (backend bentoFields).
type Option = { value: string; label: string };

export const WORK_HOURS: Option[] = [
  { value: 'ph', label: 'Philippine daytime' },
  { value: 'us', label: 'US hours' },
  { value: 'uk', label: 'UK / Europe hours' },
  { value: 'au', label: 'Australia hours' },
  { value: 'flexible', label: 'Flexible, any time zone' },
];
export const START_WHEN: Option[] = [
  { value: 'now', label: 'Right away' },
  { value: '1w', label: 'In 1 week' },
  { value: '2w', label: 'In 2 weeks' },
  { value: '1m', label: 'In a month' },
];
export const ENGLISH: Option[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'fluent', label: 'Fluent' },
  { value: 'native', label: 'Native or bilingual' },
];
export const SETUP: Option[] = [
  { value: 'backup_power', label: 'Backup power (UPS or generator)' },
  { value: 'backup_internet', label: 'Backup internet (mobile data)' },
  { value: 'own_computer', label: 'Own laptop or PC' },
  { value: 'headset', label: 'Headset with microphone' },
];
export const labelOf = (list: Option[], value: string | null | undefined) => list.find((o) => o.value === value)?.label ?? null;

// Suggested skills, so most workers pick the same spelling (and show up in the same searches).
export const SKILL_SUGGESTIONS = [
  'Virtual assistant', 'Customer service', 'Email support', 'Chat support', 'Data entry', 'Bookkeeping', 'QuickBooks', 'Xero',
  'Excel', 'Google Sheets', 'Social media', 'Content writing', 'Copywriting', 'SEO', 'Graphic design', 'Canva', 'Photoshop',
  'Video editing', 'WordPress', 'Shopify', 'Amazon seller', 'Lead generation', 'Cold calling', 'Appointment setting',
  'Project management', 'Email marketing', 'Real estate', 'Medical billing', 'Transcription', 'React', 'Node.js',
  'JavaScript', 'TypeScript', 'Python', 'PHP', 'Laravel', 'Flutter', 'QA testing', 'UI/UX design', 'Technical support',
];

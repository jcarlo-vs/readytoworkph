// Writes the description of a sample job. Real posts are written by different people in different moods,
// so each post uses one of 20 styles (which parts, in what order, "we" or "I", headings or plain paragraphs),
// and every part has several wordings, including the code-word tricks employers use to filter applicants.
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const some = (a, n) => [...a].sort(() => Math.random() - 0.5).slice(0, n);
const chance = (p) => Math.random() < p;
const cap = (x) => x[0].toUpperCase() + x.slice(1);
const low = (x) => x[0].toLowerCase() + x.slice(1);
const an = (x) => (/^[AEIOU]/i.test(x) ? 'an' : 'a');
const and = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

// "Record transactions, reconcile accounts and prepare reports." -> the role's own tasks as separate duties.
// Only when every piece reads as its own task (starts with a lowercase verb, not "Gmail" or "working"),
// otherwise the summary stays one duty.
function tasksOf(summary) {
  const whole = summary.replace(/\.$/, '');
  const parts = whole.split(/,\s*(?:and\s+)?|:\s*/);
  const tasks = parts.length > 1 && parts.every((p, i) => p.split(' ').length >= 2 && (i === 0 || /^[a-z]+(?<!ing)\b/.test(p)));
  return tasks ? parts.map(cap) : [whole];
}

// Skills are stored in lowercase; brands and short forms get their usual spelling ("Next.js", "SEO", "TikTok").
const SPELLING = Object.fromEntries([
  'HTML', 'CSS', 'SEO', 'CRM', 'PPC', 'UI', 'UX', 'SQL', 'PHP', 'iOS', 'EHR', 'HIPAA', 'AWS', 'MLS', 'HR', 'HRIS', 'IT', 'BI', 'KPIs',
  'LMS', 'SaaS', 'SOP', 'GST', 'CPT', 'CPC', 'AP', 'TEFL', 'IELTS', 'USCIS', 'USPTO', 'US', 'APIs', 'REST', 'CI/CD', 'BIM', '2D', '3D',
  'DAX', 'MJML', 'V-Ray', 'ICD-10', 'Next.js', 'Node.js', 'Vue.js', 'TikTok', 'YouTube', 'LinkedIn', 'WordPress', 'HubSpot',
  'QuickBooks', 'JavaScript', 'TypeScript', 'PostgreSQL', 'MySQL', 'ChatGPT', 'ClickUp', 'ClickFunnels', 'GoHighLevel', 'SketchUp',
  'NetSuite', 'PowerPoint', 'InDesign', 'DocuSign', 'DoorDash', 'EagleView', 'eBay', 'AppFolio', 'ShipStation', 'RingCentral',
  'MemberPress', 'ManyChat', 'RxJS', 'RSpec', 'CapCut', 'Accubid', 'Adobe', 'Aegisub', 'Airbnb', 'Airtable', 'Alibaba', 'Amadeus',
  'Amazon', 'Android', 'Angular', 'Apollo', 'Articulate', 'Asana', 'Audacity', 'Audition', 'AutoCAD', 'Beehiiv', 'Bluebeam', 'Calendly',
  'Canva', 'Circle', 'Clio', 'Dart', 'Discord', 'Django', 'Docker', 'Encompass', 'Etsy', 'Excel', 'Expensify', 'Facebook', 'Figma',
  'Firebase', 'Flutter', 'Freshdesk', 'Gmail', 'Google', 'Gusto', 'Illustrator', 'Impact', 'Instagram', 'Instantly', 'Intercom',
  'Japanese', 'Jira', 'Kajabi', 'Keynote', 'Klaviyo', 'Laravel', 'Lightroom', 'Liquid', 'Loom', 'Make', 'Meta', 'Microsoft', 'Mojo',
  'Moodle', 'Notion', 'Photoshop', 'Pinterest', 'Premiere', 'Procore', 'Procreate', 'Python', 'Rails', 'React', 'Redux', 'Revit',
  'Ruby', 'Salesforce', 'Shopify', 'Spanish', 'Teachable', 'Trainerize', 'Trustpilot', 'Typeform', 'Unity', 'Walmart', 'Webflow',
  'Westlaw', 'Wix', 'Xero', 'Zapier', 'Zendesk', 'Zillow', 'Zoom', 'English', 'American', 'Office', 'Workspace', 'Sheets', 'Docs',
  'Slides', 'Ads', 'Analytics', 'Calendar', 'Seller', 'Central', 'Center', 'Suite', 'Pro', 'Effects', 'Final', 'Cut', 'Max', 'Defender',
  'Dialer', 'Recruiter', 'Native', 'Civil', '360', '365', 'C#', 'Guide', 'Word', 'Business', 'Manager',
  'AI', 'API', 'LLM', 'RAG', 'MongoDB', 'PyTorch', 'MLOps', 'OpenAI', 'LangChain', 'n8n', 'Clay', 'Runway', 'UGC', 'Midjourney', 'gRPC',
  'SDR', 'Go', 'Gorgias', 'Podio', 'Cypress', 'Screaming', 'Frog', 'Sales', 'Navigator', 'Search', 'Console', 'A/B',
].map((w) => [w.toLowerCase(), w]));
// Brand words only capitalised after a brand ("google sheets", "after effects"), not on their own ("office", "pro").
const AFTER_BRAND = new Set(['office', 'workspace', 'sheets', 'docs', 'slides', 'ads', 'analytics', 'calendar', 'seller', 'central',
  'center', 'suite', 'pro', 'effects', 'final', 'cut', 'max', 'defender', 'dialer', 'recruiter', 'native', 'civil', 'guide', 'word',
  'business', 'manager', 'sales', 'navigator', 'search', 'console', 'frog']);
const spell = (skill) => {
  const words = skill.split(' ');
  const brand = words.some((w) => SPELLING[w] && !AFTER_BRAND.has(w)) || /^(after|final) /.test(skill);
  const out = words.map((w) => (SPELLING[w] && (brand || !AFTER_BRAND.has(w)) ? SPELLING[w] : w)).join(' ');
  return /^(iOS|n8n|gRPC)/.test(out) ? out : cap(out);
};

// ---- What a post can say. Each part has several wordings; a style decides which parts, in what order, and how.

const OPENERS = [
  'We are a small, family-run business that has been growing steadily, and we need one more person on our remote team.',
  'Our team is fully remote, with people in the US, Australia and the Philippines.',
  'We are a young company that is growing fast and we need a reliable person to help us keep up.',
  'We have worked with Filipino team members for years and they are the heart of our business.',
  'We are an agency that helps small businesses grow online, with clients mostly in the US.',
  'We are a busy team of five looking for a long-term teammate, not just someone to finish a few tasks.',
  'We\'ve been in business for over eight years, and we have been fully remote since 2020.',
  'We are a startup with a small but very supportive team.',
  'We are a husband-and-wife business that started at our kitchen table and now serves customers all over the country.',
  'We are a growing company with a team of twelve, and half of us are in the Philippines.',
];
const HOW_WE_WORK = [
  'We talk on Slack during the day and have one short video call a week.',
  'Everything we do is written down in simple guides, so you will never be guessing.',
  'We work with clients in the US and Australia, so the work is steady all year.',
  'Most of our team has been with us for more than three years.',
  'We use Trello to track work, and you can always see what is next.',
  'Our customers are small business owners, and many of them have been with us since day one.',
  'We hire slowly and keep people for a long time.',
];
const CULTURE = [
  'We care about honest work, clear communication and treating people well.',
  'We don\'t do micromanaging. We give you the tools, then trust you to do the job.',
  'We celebrate wins together and fix mistakes without blaming anyone.',
  'If you like learning and want to grow with a company, you\'ll fit right in.',
  'We are relaxed and friendly, but we take deadlines seriously.',
];
const OWNER = [
  'I run a small online business and I can\'t do everything by myself anymore.',
  'I\'m the owner of a growing business and I need help so I can focus on clients.',
  'My business partner and I are looking for our first remote hire.',
  'I\'ve hired from the Philippines before and had a great experience, so I\'m back!',
  'I own a small company in the US and I\'m looking for someone I can rely on long term.',
  'I\'m a solo founder, and my business has grown faster than I expected.',
];
const WHY_HELP = [
  'Business has picked up a lot this year, and I\'m spending my evenings on work I should be handing off.',
  'Our last team member moved on after four great years, so this spot is open again.',
  'We just signed a few new clients and need another pair of hands.',
  'I\'ve been doing this part of the business myself, and it\'s time to give it to someone who does it better.',
  'We tried doing this in-house, but honestly, we need someone who does this every day.',
];
const GENERAL = [
  'Join a short team call every Monday to plan the week',
  'Keep your tasks updated in our project board',
  'Send a short end-of-day report of what you finished',
  'Ask questions early when something isn\'t clear',
  'Suggest better and faster ways of doing things',
  'Work closely with the owner and the rest of the team',
  'Keep files and notes tidy so anyone can pick up where you left off',
  'Let us know ahead of time if a deadline will be late',
];
const NEEDS = [
  'Good written and spoken English',
  'Reliable internet, plus a backup (like pocket WiFi) for brownouts',
  'Your own laptop or desktop computer',
  'A quiet place to work and a headset for calls',
  'Organised and able to work with little supervision',
  'Honest, reliable and quick to reply during work hours',
  'Willing to learn new tools and take feedback well',
  'Strong attention to detail',
];
const NICE = [
  'Experience working with clients in the US, UK or Australia',
  'Experience in a small business or startup',
  'Basic Canva skills',
  'Comfortable with Google Workspace (Docs, Sheets, Drive)',
  'Some experience with AI tools like ChatGPT',
  'A portfolio or past work you can show us',
  'Experience training or helping new team members',
];
const NOT_FOR = [
  'you need reminders to finish your tasks',
  'you disappear for days without telling anyone',
  'you\'re looking for something to do on the side for a month or two',
  'you don\'t like getting feedback',
  'you say "yes" even when you don\'t understand something',
  'you can\'t work during the hours we need',
];
const DAY = [
  'A normal day starts with checking messages and the task board, then working through the priorities for the day.',
  'Most days are quiet and focused. You\'ll get your tasks in the morning and send a short update before you log off.',
  'You\'ll usually work on two or three bigger tasks a day, plus small requests from the team as they come in.',
  'Some weeks are busier than others, especially before holidays, and we plan ahead so nobody burns out.',
];
const PERKS = [
  'Paid on time every two weeks through Wise or PayPal', '13th month pay', 'Paid Philippine holidays',
  'Yearly raise based on performance', 'Flexible hours as long as the work gets done', 'HMO allowance after six months',
  'Paid training at the start', 'Long-term work with room to grow', 'Paid birthday leave', 'Friendly team that doesn\'t micromanage',
  'Internet allowance', 'Christmas bonus',
];
const GIG_PERKS = ['Paid on time, half at the start and half when it\'s done', 'Clear brief and quick answers to your questions',
  'More projects for the right person', 'Flexible hours, as long as the deadline is met', 'A good review and referral if it goes well'];
const SCHEDULE = {
  'full-time': ['Full-time, 40 hours a week, Monday to Friday.', 'Full-time, 8 hours a day, mostly overlapping with US business hours.',
    'Full-time. We\'re flexible on the exact hours, but we need you online for team calls.', '40 hrs/week, Mon-Fri, US Eastern time.',
    'Full-time, Monday to Friday, 9am to 5pm Sydney time (that\'s 7am to 3pm in Manila).'],
  'part-time': ['Part-time, about 20 hours a week. You choose your hours.', 'Part-time, 4 hours a day, Monday to Friday.',
    'Around 15 to 20 hours a week to start, with more hours later.', '20 hrs/week, flexible schedule.',
    'Part-time, mornings in the Philippines (evenings in the US).'],
  gig: ['This is a one-time project, but there will be more work if it goes well.', 'Project-based. We have more projects for the right person.',
    'One project for now, and we hope to work together again.', 'Short project, start as soon as possible.',
    'A small project to start. If we like each other\'s work, there\'s plenty more.'],
};
const TRIAL = [
  'We start with a paid one-week trial so we can both see if it\'s a good fit.',
  'The first two weeks are a paid trial. We\'ll train you and give clear feedback along the way.',
  'There is a short paid test task before we hire, about two hours of work.',
  'You\'ll start with a 30-day trial. If it goes well, we\'ll talk about a long-term contract and a raise.',
];
// The tricks employers use to see who actually read the post.
const WORDS = ['AGENT', 'Mango', 'Sunflower', 'Blue Whale', 'Pineapple', 'Adobo', 'Lighthouse', 'Purple Cow', 'Rockstar',
  'Halo-halo', 'Coconut', 'Tiger', 'Ready to work', 'I read it all', 'Green Banana', 'Orange Juice'];
const TRICKS = [
  (w) => `Type "${w}" as the first word of your cover letter so we know you read this.`,
  (w) => `Start your application with the word "${w}". Applications without it are deleted without being read.`,
  (w) => `To show you read the whole post, end your cover letter with the word "${w}".`,
  (w) => `Put the code word "${w}" in the first line of your application.`,
  (w) => `IMPORTANT: write "${w}" at the top of your cover letter. We get hundreds of applications and this is how we filter.`,
  (w) => `Please write "${w}" and your expected rate in the first line of your application.`,
  (w) => `Use "${w}" as the title of your cover letter.`,
  (w) => `If you've read this far, mention "${w}" somewhere in your application.`,
];
const QUESTIONS = [
  'Why are you a good fit for this role?', 'What tools do you use every day for this kind of work?',
  'What would you do in your first week?', 'Tell us about a mistake you made at work and what you learned.',
  'What is your typing speed?', 'What is your internet speed, and do you have a backup?',
  'When can you start, and what hours work best for you?', 'What is your expected monthly rate?',
  'Do you know your DISC personality type? If yes, what is it?', 'Tell us about a similar job you did and the result.',
];
const APPLY = [
  'Tell us a little about yourself and your experience with this kind of work. Copy-pasted applications will be skipped.',
  'Write your cover letter in your own words. If it sounds like ChatGPT wrote it, we\'ll skip it.',
  'Only shortlisted applicants will be contacted. Thank you for understanding!',
  'Shortlisted applicants will be asked for a short voice recording, then a video call.',
  'Share a past project or result you\'re proud of and tell us what your part in it was.',
  'We read every application, but we only reply to the ones that follow the instructions.',
];
const SIGNOFFS = ['Thanks!', 'Salamat!', 'Looking forward to hearing from you.', 'Good luck!', 'God bless!', 'Thank you and have a great day.',
  'Can\'t wait to meet you!', 'Cheers,'];
const GREETS = ['Hi!', 'Hello!', 'Hey there,', 'Good day!', 'Hi everyone,', 'Kumusta!', 'Hello, applicants!'];

const pay = ({ salary_min: a, salary_max: b, salary_period: p }) =>
  `$${Number(a).toLocaleString('en-US')} to $${Number(b).toLocaleString('en-US')} ${p === 'fixed' ? 'for the project' : `per ${p}`}`;

// Every part is either a paragraph or a list. Lists show as bullets in a style that uses them, or
// fold into one sentence in a style that doesn't.
const PARTS = {
  greet: () => pick(GREETS),
  headline: ({ title, jobType }) => pick([`Now hiring: ${title}`, `We're hiring ${an(title)} ${title}!`, `${title.toUpperCase()} NEEDED`,
    `Looking for ${an(title)} ${title} (${jobType.replace('-', ' ')})`, `${title} - work from home`]),
  about: ({ voice }) => (voice === 'i' ? `${pick(OWNER)} ${pick(WHY_HELP)}`
    : [pick(OPENERS), ...some(HOW_WE_WORK, chance(0.5) ? 2 : 1), pick(CULTURE)].join(' ')),
  // With a duties list in the same post, the summary is already there as duties: only the extra line.
  role: ({ title, summary, voice, hasDuties }) => `${hasDuties ? '' : summary} ${pick([`This is a work-from-home ${title} role.`, 'You can work from anywhere in the Philippines.',
    voice === 'i' ? 'You\'ll be working directly with me.' : 'You\'ll report to our operations manager.', ''])}`.trim(),
  duties: { titles: ['Responsibilities', 'What you will do', 'Your tasks', 'Duties', 'Your day-to-day'],
    lead: ['Day to day, you will', 'Your main job will be to', 'You will'],
    items: ({ tasks }) => [...tasks, ...some(GENERAL, Math.max(2, 5 - tasks.length))] },
  needs: { titles: ['Requirements', 'Qualifications', 'What we are looking for', 'Must have', 'You must have'],
    lead: ['You\'ll need', 'We\'re looking for someone with', 'Must haves:'],
    items: ({ title, skills, years }) => [`${cap(years)} of experience as ${an(title)} ${title} or similar`,
      `Experience with ${and(skills.map(spell))}`, ...some(NEEDS, 3)] },
  nice: { titles: ['Nice to have', 'Bonus points', 'Good to have', 'Not required, but a plus'],
    lead: ['It\'s a plus if you have', 'Bonus points for'], items: () => some(NICE, 2) },
  notFor: { titles: ['This job is NOT for you if', 'Please don\'t apply if'],
    lead: ['Please don\'t apply if'], items: () => some(NOT_FOR, 3), or: true },
  day: () => pick(DAY),
  // Only named products count as tools ("Premiere Pro", not "video editing").
  tools: ({ skills }) => `${pick(['Tools you\'ll use', 'Our tools', 'You\'ll work with'])}: ${and([...skills.map(spell).filter((x, i) => x !== cap(skills[i])),
    ...some(['Slack', 'Google Drive', 'Trello', 'Zoom', 'Loom'], 2)])}.`,
  schedule: ({ jobType }) => pick(SCHEDULE[jobType]),
  pay: ({ job }) => `${pick(['Pay', 'Rate', 'Salary', 'Compensation'])}: ${pay(job)}, ${pick(['depending on experience', 'based on your skills', 'with a raise after the trial'])}.`,
  perks: { titles: ['Benefits', 'What we offer', 'Perks', 'Why work with us'],
    lead: ['A few nice things:', 'What you get:', 'Perks:'],
    items: ({ jobType }) => some(jobType === 'gig' ? GIG_PERKS : PERKS, 3) },
  trial: () => pick(TRIAL),
  questions: { titles: ['Answer these in your cover letter', 'Questions for you', 'In your application, answer'],
    lead: ['In your cover letter, please answer:'], items: () => some(QUESTIONS, 3), numbered: true },
  trick: () => pick(TRICKS)(pick(WORDS)),
  apply: () => pick(APPLY),
  signoff: ({ voice }) => `${pick(SIGNOFFS)}${voice === 'i' && chance(0.5) ? `\n${pick(['Mike', 'Sarah', 'Dan', 'Jess', 'Tom', 'Amy', 'Chris'])}` : ''}`,
};

const HEADINGS = [(x) => x, (x) => `${x}:`, (x) => x.toUpperCase(), (x) => `${x.toUpperCase()}:`, (x) => `== ${x} ==`, (x) => `>> ${x}`];
const BULLETS = ['-', '•', '*', '✔', '✅', '→', '1.'];

// The 20 ways people write job posts: [voice, uses headings?, parts in order]. A "?" part shows up about half the time.
const STYLES = [
  ['we', true, 'about role duties needs nice? schedule perks trick'],
  ['we', true, 'headline about duties needs schedule pay perks? apply'],
  ['we', false, 'greet about role needs schedule pay? trial? trick signoff'],
  ['i', false, 'greet about role day? needs schedule trial? apply signoff'],
  ['i', true, 'about duties needs notFor schedule trick signoff'],
  ['we', true, 'headline role duties needs schedule questions'],
  ['we', true, 'about role duties needs nice perks trial questions trick'],
  ['we', false, 'about role tools schedule pay apply trick'],
  ['i', false, 'about role needs notFor trick signoff'],
  ['we', true, 'headline about duties needs schedule pay'],
  ['we', true, 'role duties needs perks schedule trick'],
  ['we', false, 'greet headline role needs day? schedule perks? apply signoff'],
  ['i', true, 'greet about duties needs tools schedule pay questions signoff'],
  ['we', true, 'about role duties needs notFor perks schedule trial trick'],
  ['we', true, 'headline duties needs trick'],
  ['we', false, 'about role duties needs schedule questions trick signoff'],
  ['i', false, 'greet about role duties needs schedule pay trick'],
  ['we', true, 'about day duties needs nice tools schedule perks apply'],
  ['we', true, 'headline about role needs perks trial apply signoff'],
  ['i', true, 'about role duties needs notFor? schedule trial questions trick signoff'],
];

function write(part, ctx, headed, h, bullet) {
  const p = PARTS[part];
  if (typeof p === 'function') return p(ctx);
  const items = p.items(ctx);
  if (!headed) return `${pick(p.lead)} ${(p.numbered ? items : items.map(low)).join(p.numbered ? ' ' : '; ').replace(/;([^;]*)$/, `; ${p.or ? 'or' : 'and'}$1`)}${p.numbered ? '' : '.'}`;
  const mark = (i) => (p.numbered || bullet === '1.' ? `${i + 1}.` : bullet);
  return `${h(pick(p.titles))}\n${items.map((x, i) => `${mark(i)} ${x}`).join('\n')}`;
}

export function sampleDescription(job, title, skills, summary) {
  const [voice, headed, parts] = pick(STYLES);
  const ctx = { title, skills, summary, job, voice, jobType: job.job_type, tasks: tasksOf(summary), years: pick(['at least 1 year', 'at least 2 years', '3+ years', '2 or more years']) };
  const [h, bullet] = [pick(HEADINGS), pick(BULLETS)];
  const chosen = parts.split(' ').filter((p) => !p.endsWith('?') || chance(0.5)).map((p) => p.replace('?', ''))
    .filter((p) => !(p === 'notFor' && ctx.jobType === 'gig'));
  ctx.hasDuties = chosen.includes('duties');
  return chosen
    .map((p) => write(p, ctx, headed, h, bullet)).filter(Boolean).join('\n\n');
}

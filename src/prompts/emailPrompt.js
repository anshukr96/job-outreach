// File: src/prompts/emailPrompt.js
// Builds the prompt that Claude uses to generate each cold email.

const generatePrompt = (jobDescription, managerName, companyName, resume) => `
You are writing a cold outreach email from ${resume.name},
a ${resume.currentRole} with ${resume.yearsOfExperience} years of experience.

MANAGER NAME: ${managerName}
COMPANY: ${companyName}

JOB DESCRIPTION:
${jobDescription}

MY ACHIEVEMENTS:
${resume.achievements.join('\n')}

MY SKILLS: ${resume.skills.join(', ')}

RULES FOR THE EMAIL:
1. Subject line must be specific, not generic.
   BAD: "Interested in Frontend Role"
   GOOD: "Next.js Migration + 6 yrs Frontend — Quick note"
2. Email body must be 4 sentences MAX.
3. Sentence 1: Mention ONE specific tech from their JD and connect
   it to a specific achievement from my resume.
4. Sentence 2: Mention ONE specific thing about their company
   (their product, their scale, their stack) that genuinely interests you.
5. Sentence 3: One line credibility statement.
6. Sentence 4: Low friction CTA.
   NOT "Please find attached my resume."
   YES "Happy to do a 15-min technical chat if the timing works."
7. Do NOT use: "I hope this finds you well", "I am writing to",
   "Please consider my application"
8. Sign off with: Resume: ${resume.resumeUrl} | Portfolio: ${resume.portfolioUrl}
9. Tone: Direct, engineer-to-engineer. Not desperate.

OUTPUT FORMAT (JSON only, no extra text, no markdown fences):
{
  "subject": "...",
  "body": "..."
}
`;

module.exports = { generatePrompt };

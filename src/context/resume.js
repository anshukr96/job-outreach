// File: src/context/resume.js
// Fill this in with your actual data before running the pipeline.
// This is the static context Claude uses to personalize every email.

const MY_RESUME = {
  name: "Your Name",
  currentRole: "Senior Frontend Engineer",
  yearsOfExperience: 6,
  skills: [
    "React",
    "Next.js",
    "TypeScript",
    "Node.js",
    "GraphQL",
    "Performance Optimization",
    "Design Systems"
  ],
  achievements: [
    "Reduced bundle size by 60% at [Company] using code splitting",
    "Built a Design System used by 12 teams at [Company]",
    "Migrated legacy CRA app to Next.js, improving LCP by 40%",
    "Led frontend architecture for a team of 8 engineers"
  ],
  portfolioUrl: "https://yourportfolio.com",
  resumeUrl: "https://drive.google.com/your-resume-link",
  loomUrl: "https://loom.com/your-demo-video"
};

module.exports = MY_RESUME;

// File: src/context/resume.js
// Fill this in with your actual data before running the pipeline.
// This is the static context Claude uses to personalize every email.

const MY_RESUME = {
  name: "Anshu Dwivedi",
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
    "Reduced bundle size by 60% at HT Digtial using code splitting",
    "Built a Design System used by 12 teams at HT Digtial",
    "Migrated legacy CRA app to Next.js, improving LCP by 40%",
    "Led frontend architecture for a team of 8 engineers"
  ],
  portfolioUrl: "https://anshukr96.github.io/anshu-portfolio/",
  resumeUrl: "https://drive.google.com/file/d/1oLdWkUWx_A0blooc2QXnBuflm9kTQ79F/view?usp=sharing",
};

module.exports = MY_RESUME;

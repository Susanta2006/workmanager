// Developer profile shown on /developer, in the footer and in structured data.
// Keep these details accurate: they are public.

export type Experience = { role: string; org: string; period: string };
export type Education = { degree: string; school: string; period: string };
export type Writing = { title: string; venue: string; url: string };

export const DEVELOPER = {
  name: "Susanta Banik",
  title: "AI/ML Engineer and Researcher",
  company: "Shristi AI Web Creations",
  location: "Agartala, Tripura, India",
  udyam: "UDYAM-TR-08-0041945",
  email: "susanta.company4@gmail.com",
  website: "https://susanta-banik.vercel.app",
  profiles: [
    { label: "GitHub", url: "https://github.com/Susanta2006" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/susanta-banik" },
    { label: "DEV", url: "https://dev.to/susantabanik" },
  ],
  education: [
    { degree: "B.S. in Applied AI and Data Science", school: "IIT Jodhpur", period: "2025 – 2029" },
    { degree: "B.Tech in AI and Data Science", school: "Techno College of Engineering Agartala", period: "2025 – 2029" },
  ] satisfies Education[],
  certifications: ["IBM: Hadoop and Spark", "ISRO: Remote Sensing and AI"],
  experience: [
    { role: "Machine Learning Intern", org: "Codec Technologies India", period: "Feb 2026 – Mar 2026" },
    { role: "Machine Learning Intern", org: "Saiket Systems", period: "Sep 2025 – Oct 2025" },
    { role: "Machine Learning Engineer", org: "Cognifyz Technologies", period: "May 2025 – Jul 2025" },
    { role: "Full Stack Web Developer Intern", org: "Unified Mentor", period: "Apr 2025 – Jul 2025" },
    { role: "Data Analyst Intern", org: "Aspire Interns", period: "" },
  ] satisfies Experience[],
  writing: [
    {
      title: "Emergent Social Consciousness in a Minimalist Conversational Agent: A Case Study",
      venue: "International Journal of Scientific Research (IJSR)",
      url: "https://www.ijsr.net/getabstract.php?paperid=MR251206000138",
    },
    {
      title: "How I Trained a 193K-Pair MoE Model on a 4-Core Laptop Without a GPU (Introducing QNME-Omega)",
      venue: "DEV Community",
      url: "https://dev.to/susantabanik/how-i-trained-a-193k-pair-moe-model-on-a-4-core-laptop-without-a-gpu-introducing-qnme-omega-1ipp",
    },
    {
      title: "Beyond the Memory Wall: Architecting Controllable Edge-Native Intelligence for Next-Gen Full-Stack AI",
      venue: "DEV Community",
      url: "https://dev.to/susantabanik/beyond-the-memory-wall-architecting-controllable-edge-native-intelligence-for-next-gen-full-stack-1ec3",
    },
    {
      title: "Architecting Zero-Latency Computer Vision for Edge Medical Diagnostics",
      venue: "DEV Community",
      url: "https://dev.to/susantabanik/architecting-zero-latency-computer-vision-for-edge-medical-diagnostics-high-throughput-digital-25kp",
    },
  ] satisfies Writing[],
} as const;

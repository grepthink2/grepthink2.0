export interface RoleTag {
  id: string;
  label: string;
}

export const PRESET_SKILLS = [
  'Python',
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'Express',
  'Django',
  'FastAPI',
  'Figma',
  'Flask',
  'PostgreSQL',
  'MongoDB',
  'MySQL',
  'Redis',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'GCP',
  'Git',
  'CI/CD',
  'Machine Learning',
  'Data Science',
  'Design',
  'UI/UX',
  'GraphQL',
  'REST API',
  'TailwindCSS',
  'SASS',
  'Vue.js',
  'Angular',
  'Java',
  'C++',
  'C#',
  'Go',
  'Rust',
  'Swift',
  'Kotlin',
];

export const ROLE_OPTIONS: RoleTag[] = [
  { id: 'designer', label: 'Designer' },
  { id: 'frontend', label: 'Frontend Engineer' },
  { id: 'backend', label: 'Backend Engineer' },
  { id: 'database', label: 'Database' },
];

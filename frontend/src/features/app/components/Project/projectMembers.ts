/**
 * One teammate as the project page shows them: display-ready fields the page maps from the API's
 * member row (the role as a label, GitHub and LinkedIn as full URLs).
 */
export interface ProjectMember {
  id?: string;
  displayName: string;
  roleLabel: string;
  email?: string;
  githubUrl?: string;
  linkedInUrl?: string;
  imageUrl?: string;
}

export interface EditProjectFormData {
  name: string;
  description: string;
  teamSize: string;
  productOwnerId: string | null;
  scrumMasterId: string | null;
  adminIds: Set<string>;
}

export interface MemberOption {
  userId: string;
  displayName: string;
  email: string;
  projectRole: string;
}

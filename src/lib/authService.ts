import { UserAccount } from '../../types';

// Role helper checks
export const canView = (user: UserAccount | null): boolean => {
  return !!user; // Any signed in user can view
};

export const canCreate = (user: UserAccount | null): boolean => {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'editor';
};

export const canEdit = (user: UserAccount | null): boolean => {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'editor';
};

export const canDelete = (user: UserAccount | null): boolean => {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase().trim();
  return role === 'admin';
};

export const isAdmin = (user: UserAccount | null): boolean => {
  if (!user) return false;
  return user.role === 'admin';
};

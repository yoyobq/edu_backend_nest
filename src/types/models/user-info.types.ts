export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  SECRET = 'SECRET',
}

export enum UserState {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

export interface AccessGroupItem {
  name: string;
  [key: string]: any;
}

export interface GeographicInfo {
  province?: string;
  city?: string;
}

export interface TagItem {
  key: string;
  label: string;
}

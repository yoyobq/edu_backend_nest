import { EmploymentStatus } from '@app-types/models/account.types';
import { Gender } from '@app-types/models/user-info.types';

export type ManagerIdentityEntity = {
  id: number;
  accountId: number;
  name: string;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};

export type CoachIdentityEntity = {
  id: number;
  accountId: number;
  name: string;
  remark: string | null;
  level: number | null;
  description: string | null;
  avatarUrl: string | null;
  specialty: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};

export type StaffIdentityEntity = {
  id: number | string;
  accountId: number;
  name: string;
  departmentId: number | null;
  remark: string | null;
  jobTitle: string | null;
  employmentStatus: EmploymentStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerIdentityEntity = {
  id: number;
  accountId: number;
  name: string;
  contactPhone: string | null;
  preferredContactTime: string | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};

export type LearnerIdentityEntity = {
  id: number;
  accountId: number;
  customerId: number;
  name: string;
  gender: Gender;
  birthDate: string | null;
  avatarUrl: string | null;
  specialNeeds: string | null;
  countPerSession: number | null;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};

export type IdentityEntity =
  | ManagerIdentityEntity
  | CoachIdentityEntity
  | StaffIdentityEntity
  | CustomerIdentityEntity
  | LearnerIdentityEntity;


export enum UserRole {
  CLIENT = 'CLIENT',
  THERAPIST = 'THERAPIST',
  CLINIC_OWNER = 'CLINIC_OWNER',
  ADMIN = 'ADMIN',
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
  profilePictureUrl?: string | null; // Added for profile picture
}

export interface PracticeLocation {
  address: string;
  lat?: number; // Optional for now, for map integration
  lng?: number; // Optional for now, for map integration
  isPrimary?: boolean;
}

export interface Certification {
  id: string;
  name: string;
  fileUrl: string; // URL to the uploaded document
  uploadedAt: string; // ISO date string
  isVerified: boolean;
  verificationNotes?: string;
  country?: string; 
}

export interface Therapist {
  id: string; // Should match a User.id
  email?: string; // Added for admin panel convenience
  name: string;
  profilePictureUrl: string; // URL to profile picture
  introVideoUrl?: string; // URL to intro video
  specializations: string[];
  languages: string[];
  qualifications: string[];
  bio: string;
  rating: number;
  reviewCount: number;
  locations: PracticeLocation[];
  whatsappNumber: string;
  isFavorite?: boolean; 
  profileViews?: number; 
  likes?: number; 
  certifications?: Certification[];
  isVerified?: boolean; 
  availability?: string[]; 
  
  // New fields for account status and membership
  accountStatus: 'draft' | 'pending_approval' | 'live' | 'rejected';
  adminNotes?: string; // For admin feedback, especially on rejection
  membershipApplication?: { 
    date: string; // ISO date string of application/renewal
    paymentReceiptUrl?: string; 
    statusMessage?: string; // e.g. "Awaiting admin review"
  };
  membershipRenewalDate?: string; // ISO date string, if membership is active
}

export interface ClinicService { 
    id: string;
    name: string;
    price: number;
    durationMinutes?: number;
}

export interface ClinicSpaceListing {
  id: string;
  name: string;
  photos: string[]; 
  description: string;
  rentalPrice: number;
  rentalDuration: string; 
  rentalTerms: string; 
  features: string[]; 
  clinicId?: string; 
  clinicName?: string; 
  clinicAddress?: string;
}

export interface MembershipStatus {
  status: 'active' | 'pending_payment' | 'pending_approval' | 'expired' | 'cancelled' | 'none';
  tierName?: string; // e.g., "Standard Membership"
  renewalDate?: string; 
  applicationDate?: string; 
  paymentReceiptUrl?: string; 
}

export interface MembershipHistoryItem {
  id: string;
  date: string; 
  action: string; 
  details?: string; 
}

export interface Clinic {
  id: string; // Unique ID for the clinic itself
  ownerId: string; // User.id of the clinic owner
  name: string;
  profilePictureUrl?: string; // URL to clinic's main photo
  photos?: string[]; // Array of URLs for additional clinic photos
  amenities: string[]; 
  operatingHours: Record<string, string>; // e.g. {"Monday-Friday": "9am-6pm"}
  services?: ClinicService[]; 
  address: string;
  lat?: number;
  lng?: number;
  whatsappNumber: string; 
  description: string; 
  isVerified?: boolean; // Admin verification of the clinic itself
  
  theraWayMembership?: MembershipStatus; 
  
  accountStatus: 'draft' | 'pending_approval' | 'live' | 'rejected';
  adminNotes?: string; 
}


export interface Review {
  id: string;
  therapistId: string;
  clientId: string;
  clientName: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string; // ISO date string
}

// For Admin Dashboard
export interface SystemHealthMetric {
    name: string;
    value: string;
    status: 'good' | 'warning' | 'error';
}

export interface ActivityLog {
    id: string;
    timestamp: string; // ISO date string
    userId?: string; // ID of user performing action, or 'system'
    userName?: string; // Name of user, if applicable
    userRole?: UserRole; // Role of user, if applicable
    action: string; // e.g., "Therapist Approved", "Clinic Rejected", "User Login"
    targetId?: string; // ID of the entity being acted upon (e.g., therapistId, clinicId)
    targetType?: 'therapist' | 'clinic' | 'user_inquiry' | 'system' | 'user'; // Added 'user'
    details?: Record<string, any> | string; // Additional context
}

export interface UserManagementInfo extends User { // User already has profilePictureUrl
    lastLogin?: string;
    isActive: boolean;
}

export interface UserInquiry {
  id: string;
  userId?: string; 
  userEmail: string; 
  userName?: string; 
  subject: string;
  message: string;
  date: string; 
  status: 'open' | 'closed' | 'pending_admin_response' | 'escalated';
  adminReply?: string;
  priority?: 'low' | 'medium' | 'high';
  category?: 'general' | 'technical_support' | 'billing' | 'feedback';
}
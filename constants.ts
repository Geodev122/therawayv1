import { UserRole, User, Therapist, Clinic, MembershipStatus, PracticeLocation } from './types';

// In a real app, this would be set in the environment and NOT hardcoded.
// Polyfill process for browser environment if it doesn't exist
declare global {
    interface Window { process?: { env: { [key: string]: string | undefined; } }; }
}
  
// This polyfill ensures `process.env` exists for the SDK to attempt to read `API_KEY` from,
// even in browser environments where `process` isn't native.
// The actual value of API_KEY must be supplied by the execution environment.
if (typeof (window as any).process === 'undefined') {
    (window as any).process = { env: {} };
} else if (typeof (window as any).process.env === 'undefined') {
    // If process exists but process.env doesn't (less common for Node.js like environments but good to check)
    // Or if window.process was defined by something else without an env
    (window as any).process = { ...(window as any).process, env: {} };
}


// The API_KEY is expected to be in process.env.API_KEY when the GoogleGenAI client is initialized.
// Do NOT set a placeholder here. The application code should not manage this.
// Example SDK initialization (would happen in files using the SDK, not here):
// import { GoogleGenAI } from "@google/genai";
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


export const API_BASE_URL = '/backend/api'; // As per README.md

export const AVAILABILITY_OPTIONS = ['Weekdays', 'Weekends', 'Evenings', 'Mornings', 'Immediate'];
export const THERAPIST_MEMBERSHIP_FEE = 4; // USD per month
export const CLINIC_MEMBERSHIP_FEE = 8; // USD per month
export const STANDARD_MEMBERSHIP_TIER_NAME = "Standard Membership";


export const APP_NAME = "TheraWay";
export const DEFAULT_USER_ROLE = UserRole.CLIENT; 
export const VIDEO_MAX_DURATION_SECONDS = 30;
export const VIDEO_MAX_SIZE_MB = 10;
export const CERTIFICATION_MAX_SIZE_MB = 5;
export const PROFILE_PICTURE_MAX_SIZE_MB = 2;
export const CLINIC_PHOTO_MAX_SIZE_MB = 5;
export const CLINIC_SPACE_PHOTO_MAX_SIZE_MB = 3; 
export const PAYMENT_RECEIPT_MAX_SIZE_MB = 2;


export const SPECIALIZATIONS_LIST = [
  'Cognitive Behavioral Therapy (CBT)', 'Anxiety Counseling', 'Depression Management',
  'Trauma-Informed Care', 'PTSD Recovery', 'Grief Counseling', 'Family Therapy',
  'Relationship Counseling', 'Child Psychology', 'Mindfulness-Based Stress Reduction (MBSR)',
  'Existential Therapy', 'Cultural Sensitivity', 'Addiction Counseling',
  'Motivational Interviewing', 'Relapse Prevention', 'Eating Disorder Treatment',
  'Obsessive-Compulsive Disorder (OCD)', 'Borderline Personality Disorder (BPD)',
  'Art Therapy', 'Play Therapy', 'Dialectical Behavior Therapy (DBT)'
];

export const LANGUAGES_LIST = ['English', 'Spanish', 'French', 'German', 'Arabic', 'Mandarin', 'Japanese', 'Hindi', 'Portuguese', 'Russian'];

export const CLINIC_SPACE_FEATURES_LIST = [
    "Wi-Fi", "Whiteboard", "Projector", "Soundproof", "Air Conditioning", "Heating",
    "Comfortable Seating", "Waiting Area Access", "Kitchenette Access", "Restroom Access",
    "Natural Light", "Dimmable Lighting", "Secure Entry", "Wheelchair Accessible",
    "Tea/Coffee Making Facilities", "Reception Services", "Cleaning Services"
];

// --- MOCK DATA REMOVED ---
// All mock data arrays like MOCK_USERS_FOR_ADMIN, MOCK_THERAPISTS, MOCK_CLINICS,
// MOCK_SYSTEM_HEALTH, MOCK_ACTIVITY_LOGS, MOCK_USER_INQUIRIES
// have been removed from this file. The application is expected to fetch
// all dynamic data from a backend API.
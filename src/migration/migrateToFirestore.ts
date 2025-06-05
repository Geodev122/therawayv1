import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { firestore } from '../firebase/config';
import { User, UserRole, Therapist, Clinic, ClinicSpaceListing, Certification, UserInquiry, ActivityLog, MembershipHistoryItem } from '../../types';

// Function to migrate users from MySQL to Firestore
export const migrateUsers = async (mysqlUsers: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const user of mysqlUsers) {
    const userData: User = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      profilePictureUrl: user.profile_picture_url || null
    };
    
    const userRef = doc(firestore, 'users', user.id);
    batch.set(userRef, {
      ...userData,
      createdAt: new Date(user.created_at).toISOString(),
      updatedAt: new Date(user.updated_at).toISOString()
    });
    
    count++;
    
    // Firestore batches are limited to 500 operations
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlUsers.length} users to Firestore`);
};

// Function to migrate therapists from MySQL to Firestore
export const migrateTherapists = async (mysqlTherapists: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const therapist of mysqlTherapists) {
    const therapistData: Therapist = {
      id: therapist.user_id,
      name: therapist.name || '',
      email: therapist.email || '',
      profilePictureUrl: therapist.profile_picture_url || '',
      introVideoUrl: therapist.intro_video_url || '',
      specializations: JSON.parse(therapist.specializations || '[]'),
      languages: JSON.parse(therapist.languages || '[]'),
      qualifications: JSON.parse(therapist.qualifications || '[]'),
      bio: therapist.bio || '',
      rating: therapist.rating || 0,
      reviewCount: therapist.review_count || 0,
      locations: JSON.parse(therapist.locations || '[]'),
      whatsappNumber: therapist.whatsapp_number || '',
      accountStatus: therapist.account_status || 'draft',
      adminNotes: therapist.admin_notes || '',
      isVerified: Boolean(therapist.is_overall_verified),
      availability: JSON.parse(therapist.availability || '[]'),
      profileViews: therapist.profile_views || 0,
      likes: therapist.likes_count || 0,
      membershipApplication: {
        date: therapist.membership_application_date || null,
        paymentReceiptUrl: therapist.membership_payment_receipt_url || null,
        statusMessage: therapist.membership_status_message || null
      },
      membershipRenewalDate: therapist.membership_renewal_date || null
    };
    
    const therapistRef = doc(firestore, 'therapists_data', therapist.user_id);
    batch.set(therapistRef, {
      ...therapistData,
      createdAt: new Date(therapist.created_at).toISOString(),
      updatedAt: new Date(therapist.updated_at).toISOString()
    });
    
    count++;
    
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlTherapists.length} therapists to Firestore`);
};

// Function to migrate certifications from MySQL to Firestore
export const migrateCertifications = async (mysqlCertifications: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const cert of mysqlCertifications) {
    const certData: Certification = {
      id: cert.id,
      name: cert.name,
      fileUrl: cert.file_url,
      uploadedAt: new Date(cert.uploaded_at).toISOString(),
      isVerified: Boolean(cert.is_verified_by_admin),
      verificationNotes: cert.verification_notes || '',
      country: cert.country || ''
    };
    
    const certRef = doc(firestore, 'certifications', cert.id);
    batch.set(certRef, certData);
    
    count++;
    
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlCertifications.length} certifications to Firestore`);
};

// Function to migrate clinics from MySQL to Firestore
export const migrateClinics = async (mysqlClinics: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const clinic of mysqlClinics) {
    const clinicData: Clinic = {
      id: clinic.clinic_id,
      ownerId: clinic.user_id,
      name: clinic.clinic_name,
      description: clinic.description || '',
      address: clinic.address || '',
      lat: clinic.latitude || null,
      lng: clinic.longitude || null,
      profilePictureUrl: clinic.clinic_profile_picture_url || null,
      photos: JSON.parse(clinic.clinic_photos || '[]'),
      amenities: JSON.parse(clinic.amenities || '[]'),
      operatingHours: JSON.parse(clinic.operating_hours || '{}'),
      services: JSON.parse(clinic.services || '[]'),
      whatsappNumber: clinic.whatsapp_number || '',
      isVerified: Boolean(clinic.is_verified_by_admin),
      accountStatus: clinic.account_status || 'draft',
      adminNotes: clinic.admin_notes || '',
      theraWayMembership: {
        status: clinic.theraway_membership_status || 'none',
        tierName: clinic.theraway_membership_tier_name || null,
        renewalDate: clinic.theraway_membership_renewal_date || null,
        applicationDate: clinic.theraway_membership_application_date || null,
        paymentReceiptUrl: clinic.theraway_membership_payment_receipt_url || null
      }
    };
    
    const clinicRef = doc(firestore, 'clinics_data', clinic.clinic_id);
    batch.set(clinicRef, {
      ...clinicData,
      createdAt: new Date(clinic.created_at).toISOString(),
      updatedAt: new Date(clinic.updated_at).toISOString()
    });
    
    count++;
    
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlClinics.length} clinics to Firestore`);
};

// Function to migrate clinic spaces from MySQL to Firestore
export const migrateClinicSpaces = async (mysqlSpaces: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const space of mysqlSpaces) {
    const spaceData: ClinicSpaceListing = {
      id: space.id,
      name: space.name,
      description: space.description || '',
      photos: JSON.parse(space.photos || '[]'),
      rentalPrice: parseFloat(space.rental_price) || 0,
      rentalDuration: space.rental_duration || 'per hour',
      rentalTerms: space.rental_terms || '',
      features: JSON.parse(space.features || '[]'),
      clinicId: space.clinic_id,
      clinicName: space.clinicName || '',
      clinicAddress: space.clinicAddress || ''
    };
    
    const spaceRef = doc(firestore, 'clinic_spaces', space.id);
    batch.set(spaceRef, {
      ...spaceData,
      createdAt: new Date(space.created_at).toISOString(),
      updatedAt: new Date(space.updated_at).toISOString()
    });
    
    count++;
    
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlSpaces.length} clinic spaces to Firestore`);
};

// Function to migrate client favorites from MySQL to Firestore
export const migrateClientFavorites = async (mysqlFavorites: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const favorite of mysqlFavorites) {
    const favoriteId = `${favorite.client_user_id}_${favorite.therapist_user_id}`;
    const favoriteData = {
      clientId: favorite.client_user_id,
      therapistId: favorite.therapist_user_id,
      createdAt: new Date(favorite.created_at).toISOString()
    };
    
    const favoriteRef = doc(firestore, 'client_therapist_favorites', favoriteId);
    batch.set(favoriteRef, favoriteData);
    
    count++;
    
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlFavorites.length} client favorites to Firestore`);
};

// Function to migrate user inquiries from MySQL to Firestore
export const migrateUserInquiries = async (mysqlInquiries: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const inquiry of mysqlInquiries) {
    const inquiryData: UserInquiry = {
      id: inquiry.id,
      userId: inquiry.user_id || null,
      userName: inquiry.user_name || null,
      userEmail: inquiry.user_email,
      subject: inquiry.subject,
      message: inquiry.message,
      date: new Date(inquiry.date).toISOString(),
      status: inquiry.status || 'open',
      adminReply: inquiry.admin_reply || null,
      priority: inquiry.priority || 'medium',
      category: inquiry.category || 'general'
    };
    
    const inquiryRef = doc(firestore, 'user_inquiries', inquiry.id);
    batch.set(inquiryRef, inquiryData);
    
    count++;
    
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlInquiries.length} user inquiries to Firestore`);
};

// Function to migrate activity logs from MySQL to Firestore
export const migrateActivityLogs = async (mysqlLogs: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const log of mysqlLogs) {
    let details: any;
    
    try {
      details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
    } catch (e) {
      details = log.details || null;
    }
    
    const logData: ActivityLog = {
      id: log.id,
      timestamp: new Date(log.timestamp).toISOString(),
      userId: log.user_id || null,
      userName: log.user_name || null,
      userRole: log.user_role || null,
      action: log.action,
      targetId: log.target_id || null,
      targetType: log.target_type || null,
      details: details
    };
    
    const logRef = doc(firestore, 'activity_logs', log.id);
    batch.set(logRef, logData);
    
    count++;
    
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlLogs.length} activity logs to Firestore`);
};

// Function to migrate membership history from MySQL to Firestore
export const migrateMembershipHistory = async (mysqlHistory: any[]): Promise<void> => {
  const batch = writeBatch(firestore);
  let count = 0;
  
  for (const item of mysqlHistory) {
    let details: any;
    
    try {
      details = typeof item.details_json === 'string' ? JSON.parse(item.details_json) : item.details_json;
    } catch (e) {
      details = item.details_json || null;
    }
    
    const historyData: MembershipHistoryItem = {
      id: item.id,
      targetId: item.target_id,
      targetType: item.target_type,
      date: new Date(item.action_date).toISOString(),
      action: item.action_description,
      details: details
    };
    
    const historyRef = doc(firestore, 'membership_history', item.id);
    batch.set(historyRef, historyData);
    
    count++;
    
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  console.log(`Migrated ${mysqlHistory.length} membership history items to Firestore`);
};

// Main migration function
export const migrateAllData = async (mysqlData: {
  users: any[],
  therapists: any[],
  certifications: any[],
  clinics: any[],
  clinicSpaces: any[],
  clientFavorites: any[],
  userInquiries: any[],
  activityLogs: any[],
  membershipHistory: any[]
}): Promise<void> => {
  try {
    console.log('Starting migration to Firestore...');
    
    // Migrate in order of dependencies
    await migrateUsers(mysqlData.users);
    await migrateTherapists(mysqlData.therapists);
    await migrateCertifications(mysqlData.certifications);
    await migrateClinics(mysqlData.clinics);
    await migrateClinicSpaces(mysqlData.clinicSpaces);
    await migrateClientFavorites(mysqlData.clientFavorites);
    await migrateUserInquiries(mysqlData.userInquiries);
    await migrateActivityLogs(mysqlData.activityLogs);
    await migrateMembershipHistory(mysqlData.membershipHistory);
    
    console.log('Migration to Firestore completed successfully!');
  } catch (error: any) {
    console.error('Error during migration:', error);
    throw new Error(error.message || 'Failed to migrate data to Firestore');
  }
};

// Check if collection is empty (useful to avoid duplicate migrations)
export const isCollectionEmpty = async (collectionName: string): Promise<boolean> => {
  try {
    const querySnapshot = await getDocs(collection(firestore, collectionName));
    return querySnapshot.empty;
  } catch (error: any) {
    console.error(`Error checking if ${collectionName} is empty:`, error);
    throw new Error(error.message || `Failed to check if ${collectionName} is empty`);
  }
};
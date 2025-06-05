import { migrateAllData, isCollectionEmpty } from './migrateToFirestore';

// Function to fetch data from MySQL API endpoints
const fetchMySQLData = async (token: string) => {
  try {
    console.log('Fetching data from MySQL API endpoints...');
    
    // Fetch users
    const usersResponse = await fetch('/backend/api/admin_users.php', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const usersData = await usersResponse.json();
    const users = usersData.status === 'success' ? usersData.data : [];
    
    // Fetch therapists
    const therapistsResponse = await fetch('/backend/api/admin_therapists.php', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const therapistsData = await therapistsResponse.json();
    const therapists = therapistsData.status === 'success' ? therapistsData.data : [];
    
    // Fetch clinics
    const clinicsResponse = await fetch('/backend/api/admin_clinics.php', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const clinicsData = await clinicsResponse.json();
    const clinics = clinicsData.status === 'success' ? clinicsData.data : [];
    
    // Fetch clinic spaces
    const clinicSpaces: any[] = [];
    for (const clinic of clinics) {
      const spacesResponse = await fetch(`/backend/api/clinic_spaces.php?clinicId=${clinic.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const spacesData = await spacesResponse.json();
      if (spacesData.status === 'success' && spacesData.spaces) {
        clinicSpaces.push(...spacesData.spaces);
      }
    }
    
    // Fetch certifications
    const certifications: any[] = [];
    for (const therapist of therapists) {
      const certsResponse = await fetch(`/backend/api/therapist_certifications.php?therapist_user_id=${therapist.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const certsData = await certsResponse.json();
      if (certsData.status === 'success' && certsData.certifications) {
        certifications.push(...certsData.certifications);
      }
    }
    
    // Fetch client favorites (requires admin access)
    const favoritesResponse = await fetch('/backend/api/admin_client_favorites.php', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const favoritesData = await favoritesResponse.json();
    const clientFavorites = favoritesData.status === 'success' ? favoritesData.data : [];
    
    // Fetch user inquiries
    const inquiriesResponse = await fetch('/backend/api/admin_inquiries.php', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const inquiriesData = await inquiriesResponse.json();
    const userInquiries = inquiriesData.status === 'success' ? inquiriesData.data : [];
    
    // Fetch activity logs
    const logsResponse = await fetch('/backend/api/admin_activitylog.php', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const logsData = await logsResponse.json();
    const activityLogs = logsData.status === 'success' ? logsData.data : [];
    
    // Fetch membership history
    const membershipHistory: any[] = [];
    // For therapists
    for (const therapist of therapists) {
      const historyResponse = await fetch(`/backend/api/therapist_membership_history.php?userId=${therapist.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const historyData = await historyResponse.json();
      if (historyData.status === 'success' && historyData.history) {
        membershipHistory.push(...historyData.history);
      }
    }
    // For clinics
    for (const clinic of clinics) {
      const historyResponse = await fetch(`/backend/api/clinic_membership_history.php?clinicId=${clinic.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const historyData = await historyResponse.json();
      if (historyData.status === 'success' && historyData.history) {
        membershipHistory.push(...historyData.history);
      }
    }
    
    return {
      users,
      therapists,
      certifications,
      clinics,
      clinicSpaces,
      clientFavorites,
      userInquiries,
      activityLogs,
      membershipHistory
    };
  } catch (error) {
    console.error('Error fetching MySQL data:', error);
    throw new Error('Failed to fetch data from MySQL API endpoints');
  }
};

// Main migration function
export const migrateDataToFirestore = async (token: string) => {
  try {
    // Check if users collection is empty to avoid duplicate migrations
    const usersEmpty = await isCollectionEmpty('users');
    
    if (!usersEmpty) {
      console.log('Firestore collections already contain data. Migration skipped.');
      return { success: false, message: 'Firestore already contains data. Migration skipped.' };
    }
    
    // Fetch data from MySQL API endpoints
    const mysqlData = await fetchMySQLData(token);
    
    // Migrate data to Firestore
    await migrateAllData(mysqlData);
    
    return { success: true, message: 'Data migration completed successfully!' };
  } catch (error: any) {
    console.error('Error during migration:', error);
    return { success: false, message: error.message || 'Failed to migrate data to Firestore' };
  }
};
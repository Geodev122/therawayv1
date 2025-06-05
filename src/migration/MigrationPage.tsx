import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { usePageTitle } from '../../hooks/usePageTitle';
import { Button } from '../../components/common/Button';
import { migrateDataToFirestore } from './migrateData';

export const MigrationPage: React.FC = () => {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  usePageTitle('Data Migration');
  
  const handleMigration = async () => {
    if (!token || !user) {
      setResult({ success: false, message: 'You must be logged in as an admin to perform migration.' });
      return;
    }
    
    if (user.role !== 'ADMIN') {
      setResult({ success: false, message: 'Only admins can perform data migration.' });
      return;
    }
    
    setIsLoading(true);
    setLogs([]);
    addLog('Starting migration process...');
    
    try {
      const migrationResult = await migrateDataToFirestore(token);
      setResult(migrationResult);
      
      if (migrationResult.success) {
        addLog('Migration completed successfully!');
      } else {
        addLog(`Migration failed: ${migrationResult.message}`);
      }
    } catch (error: any) {
      console.error('Migration error:', error);
      setResult({ success: false, message: error.message || 'An unexpected error occurred during migration.' });
      addLog(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">MySQL to Firestore Migration Tool</h1>
      
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <p className="text-yellow-700">
          <strong>Warning:</strong> This tool will migrate data from MySQL to Firestore. This process is irreversible and should only be performed once.
          Make sure you have a backup of your MySQL database before proceeding.
        </p>
      </div>
      
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Migration Steps:</h2>
        <ol className="list-decimal list-inside space-y-1">
          <li>Fetch data from MySQL API endpoints</li>
          <li>Transform data to Firestore format</li>
          <li>Upload data to Firestore collections</li>
          <li>Verify migration success</li>
        </ol>
      </div>
      
      <div className="mb-6">
        <Button
          variant="primary"
          onClick={handleMigration}
          disabled={isLoading}
          className="mb-4"
        >
          {isLoading ? 'Migrating...' : 'Start Migration'}
        </Button>
        
        {result && (
          <div className={`p-4 rounded-md ${result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            <p className="font-semibold">{result.success ? 'Success!' : 'Error:'}</p>
            <p>{result.message}</p>
          </div>
        )}
      </div>
      
      {logs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Migration Logs:</h2>
          <div className="bg-gray-100 p-4 rounded-md h-64 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="text-sm font-mono mb-1">{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
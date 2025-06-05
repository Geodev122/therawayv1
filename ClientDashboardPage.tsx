
import React from 'react';
import { useTranslation } from '../hooks/useTranslation';

const DeprecatedClientDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
      <h1 className="text-2xl font-semibold text-textOnLight mb-4">{t('pageDeprecated')}</h1>
      <p className="text-textOnLight/80">
        {t('pageDeprecatedMessage')}
      </p>
    </div>
  );
};

export default DeprecatedClientDashboardPage;
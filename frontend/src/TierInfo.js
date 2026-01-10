import React, { useState, useEffect } from 'react';
import app_API from './config.js';

const TierInfo = ({ token }) => {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchUsage = async () => {
    try {
      const response = await fetch(`${app_API}/api/me/usage`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
    } catch (err) {
      console.error('Erro ao buscar usage:', err);
    } finally {
      setLoading(false);
    }
  };

  fetchUsage();
}, [token]);

  if (loading) return <div style={styles.container}>Carregando...</div>;
  if (!usage) return null;

  const isUnlimited = usage.requests_unlimited;
  const percentage = isUnlimited ? 100 : (usage.requests_used / usage.requests_limit) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h3 style={styles.title}>Seu Plano: {usage.tier_name}</h3>
        
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Requisições usadas</span>
            <span style={styles.statValue}>
              {usage.requests_used} / {usage.requests_limit || '∞'}
            </span>
          </div>
          
          <div style={styles.progressBar}>
            <div 
              style={{
                ...styles.progressFill, 
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: percentage > 80 ? '#e53e3e' : '#3182ce'
              }}
            />
          </div>
          
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Distância máxima</span>
            <span style={styles.statValue}>
              {usage.max_distance_km ? `${usage.max_distance_km}km` : 'Ilimitado'}
            </span>
          </div>
          
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Reset em</span>
            <span style={styles.statValue}>{usage.days_until_reset} dias</span>
          </div>
        </div>

        <div style={styles.features}>
          <h4 style={styles.featuresTitle}>Features:</h4>
          {Object.entries(usage.features).map(([key, enabled]) => (
            <div key={key} style={styles.feature}>
              <span style={enabled ? styles.featureEnabled : styles.featureDisabled}>
                {enabled ? '✓' : '✗'}
              </span>
              <span>{formatFeatureName(key)}</span>
            </div>
          ))}
        </div>

        <button 
          style={styles.upgradeButton} 
          disabled
          title="Sistema de pagamento em desenvolvimento"
        >
          Upgrade (Em Breve)
        </button>
      </div>
    </div>
  );
};

const formatFeatureName = (key) => {
  const names = {
    traffic_optimization: 'Otimização de Tráfego',
    weather_optimization: 'Dados Climáticos',
    ai_recommendations: 'Recomendações IA',
    alternative_routes: 'Rotas Alternativas',
    traffic_incidents: 'Incidentes de Tráfego'
  };
  return names[key] || key;
};

const styles = {
  container: {
    padding: '20px',
    maxWidth: '500px',
    margin: '0 auto'
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  },
  title: {
    margin: '0 0 20px 0',
    color: '#2d3748',
    fontSize: '24px'
  },
  stats: {
    marginBottom: '20px'
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px'
  },
  statLabel: {
    color: '#718096'
  },
  statValue: {
    fontWeight: 'bold',
    color: '#2d3748'
  },
  progressBar: {
    height: '8px',
    background: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden',
    margin: '10px 0 20px 0'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  features: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #e2e8f0'
  },
  featuresTitle: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    color: '#2d3748'
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '14px'
  },
  featureEnabled: {
    color: '#48bb78',
    fontWeight: 'bold'
  },
  featureDisabled: {
    color: '#cbd5e0',
    fontWeight: 'bold'
  },
  upgradeButton: {
    width: '100%',
    padding: '12px',
    background: '#cbd5e0',
    color: '#718096',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: 'bold',
    marginTop: '20px',
    cursor: 'not-allowed'
  }
};

export default TierInfo;
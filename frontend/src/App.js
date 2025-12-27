import React, { useState, useEffect } from 'react';
import Login from './Login';
import Register from './Register';  // ← NOVO
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [showRegister, setShowRegister] = useState(false);  // ← NOVO

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'SESSION_EXPIRED') {
        alert('Sessão expirada! Faça login novamente.');
        handleLogout();
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="App">
      {token ? (
        <div className="dashboard-container">
          <header className="app-header">
            <span>SmartRoute GPS - Autenticado</span>
            <button onClick={handleLogout} className="logout-button">Sair</button>
          </header>
          
          <div className="map-wrapper">
            <iframe 
              src={`http://localhost:5000?token=${token}`}
              title="GPS Map"
              style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none' }}
            />
          </div>
        </div>
      ) : (
        // ⚠️ NOVO: Alterna entre Login e Cadastro
        showRegister ? (
          <Register setShowRegister={setShowRegister} />
        ) : (
          <Login setToken={setToken} setShowRegister={setShowRegister} />
        )
      )}
    </div>
  );
}

export default App;

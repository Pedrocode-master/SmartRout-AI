import React, { useState } from 'react';

const Login = ({ setToken, setShowRegister }) => {  // ← Adicione setShowRegister
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    if (username.length < 3) {
      setError("O usuário deve ter pelo menos 3 caracteres.");
      return false;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return false;
    }
    return true;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.access_token);
        setToken(data.access_token);
      } else {
        setError(data.erro || "Falha na autenticação.");
      }
    } catch (err) {
      setError("Não foi possível conectar ao servidor Flask.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form onSubmit={handleLogin} className="login-card">
        <div className="logo-area">
          <span className="logo-icon">🚀</span>
          <h1>SmartRoute IA</h1>
        </div>
        <p>Sistema de Gerenciamento de Rotas</p>
        
        {error && <div className="error-message">{error}</div>}

        <input
          type="text"
          placeholder="Usuário"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Validando...' : 'Entrar no Sistema'}
        </button>

        {/* ⚠️ NOVO: Botão de cadastro */}
        <button 
          type="button" 
          onClick={() => setShowRegister(true)}
          style={{ background: '#28a745', marginTop: '10px' }}
        >
          Criar Nova Conta
        </button>
      </form>
    </div>
  );
};

export default Login;
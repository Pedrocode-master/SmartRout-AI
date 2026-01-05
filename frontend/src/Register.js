import React, { useState } from 'react';

const Register = ({ setShowRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return false;
    }
    return true;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch(`${app_API}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Conta criada com sucesso! Redirecionando para login...');
        setTimeout(() => {
          setShowRegister(false); // Volta para tela de login
        }, 2000);
      } else {
        setError(data.erro || "Erro ao criar conta.");
      }
    } catch (err) {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form onSubmit={handleRegister} className="login-card">
        <div className="logo-area">
          <span className="logo-icon">🚀</span>
          <h1>Criar Conta</h1>
        </div>
        <p>Sistema de Gerenciamento de Rotas</p>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <input
          type="text"
          placeholder="Usuário (mínimo 3 caracteres)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        
        <input
          type="password"
          placeholder="Senha (mínimo 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Confirmar senha"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Criando conta...' : 'Criar Conta'}
        </button>

        <button 
          type="button" 
          onClick={() => setShowRegister(false)}
          style={{ background: '#6c757d', marginTop: '10px' }}
        >
          Voltar para Login
        </button>
      </form>
    </div>
  );
};

export default Register;

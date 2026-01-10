// src/Login.test.js
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from './Login';

// Mock do fetch global
global.fetch = jest.fn();

describe('Login Component', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('renderiza formulário de login', () => {
    const mockSetToken = jest.fn();
    const mockSetShowRegister = jest.fn();
    
    render(<Login setToken={mockSetToken} setShowRegister={mockSetShowRegister} />);
    
    expect(screen.getByPlaceholderText('Usuário')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Senha')).toBeInTheDocument();
    expect(screen.getByText('Entrar no Sistema')).toBeInTheDocument();
  });

  test('valida username muito curto', async () => {
    const mockSetToken = jest.fn();
    const mockSetShowRegister = jest.fn();
    
    render(<Login setToken={mockSetToken} setShowRegister={mockSetShowRegister} />);
    
    const usernameInput = screen.getByPlaceholderText('Usuário');
    const passwordInput = screen.getByPlaceholderText('Senha');
    const submitButton = screen.getByText('Entrar no Sistema');
    
    fireEvent.change(usernameInput, { target: { value: 'ab' } }); // Muito curto
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/pelo menos 3 caracteres/i)).toBeInTheDocument();
    });
  });

  test('login com sucesso', async () => {
    const mockSetToken = jest.fn();
    const mockSetShowRegister = jest.fn();
    
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'fake-token-123' })
    });
    
    render(<Login setToken={mockSetToken} setShowRegister={mockSetShowRegister} />);
    
    const usernameInput = screen.getByPlaceholderText('Usuário');
    const passwordInput = screen.getByPlaceholderText('Senha');
    const submitButton = screen.getByText('Entrar no Sistema');
    
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith('fake-token-123');
    });
  });

  test('mostra tela de cadastro ao clicar no botão', () => {
    const mockSetToken = jest.fn();
    const mockSetShowRegister = jest.fn();
    
    render(<Login setToken={mockSetToken} setShowRegister={mockSetShowRegister} />);
    
    const registerButton = screen.getByText('Criar Nova Conta');
    fireEvent.click(registerButton);
    
    expect(mockSetShowRegister).toHaveBeenCalledWith(true);
  });
});
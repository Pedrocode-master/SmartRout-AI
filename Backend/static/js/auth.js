// auth.js - Gerenciamento de autenticação
let authToken = null;

/**
 * Inicializa o token pegando da URL
 */
export function initAuth() {
    const params = new URLSearchParams(window.location.search);
    authToken = params.get('token');
    
    if (authToken) {
        console.log('[AUTH] Token JWT detectado e carregado');
    } else {
        console.warn('[AUTH] Nenhum token JWT encontrado na URL');
    }
}

/**
 * Retorna o token atual
 */
export function getAuthToken() {
    return authToken;
}

/**
 * Retorna headers com autenticação
 */
export function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    return headers;
}
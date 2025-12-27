// ui_utils.js
// Exporta funções utilitárias de UI para uso por outros módulos (ex: route_logic, events).

/**
 * Exibe uma mensagem de feedback na tela (modal centralizado).
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - O tipo de mensagem ('info', 'success', 'error').
 */
export const showMessage = (message, type = 'info') => {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.textContent = message;
        messageContainer.className = `message-box ${type}`;
        messageContainer.style.display = 'block';

        // 🚨 NOVO: Lógica para auto-ocultar a mensagem de sucesso após 3 segundos
        if (type === 'success') {
            // Limpa qualquer timeout anterior para garantir que uma nova mensagem sempre apareça
            if (window.currentMessageTimeout) {
                clearTimeout(window.currentMessageTimeout);
            }
            window.currentMessageTimeout = setTimeout(() => {
                clearMessage();
            }, 3000); // Esconde após 3 segundos
        }
    }
};

/**
 * Limpa a mensagem de feedback.
 */
export const clearMessage = () => {
    // 🚨 NOVO: Limpa o timeout para evitar conflitos se a mensagem for limpa manualmente
    if (window.currentMessageTimeout) {
        clearTimeout(window.currentMessageTimeout);
        window.currentMessageTimeout = null;
    }
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.style.display = 'none';
        messageContainer.textContent = '';
        messageContainer.className = 'message-box';
    }
};

/**
 * 🚨 CORRIGIDO: Atualiza o painel de informações da rota na folha inferior (bottom sheet).
 * @param {string} distance - Distância formatada.
 * @param {string} duration - Duração formatada.
 */
export const updateRouteInfo = (distance, duration) => {
    const infoContainer = document.getElementById('sheet-info');
    const distanceEl = document.getElementById('route-distance');
    const durationEl = document.getElementById('route-duration');
    
    if (infoContainer) {
        infoContainer.classList.remove('hidden');
        // Garantir que exibimos strings válidas (defensivo contra NaN)
        const distStr = (typeof distance === 'number') ? (Number.isFinite(distance) ? `${distance}` : 'N/A') : (distance || 'N/A');
        const durStr = (typeof duration === 'number') ? (Number.isFinite(duration) ? `${duration}` : 'N/A') : (duration || 'N/A');
        if (distanceEl) distanceEl.textContent = distStr;
        if (durationEl) durationEl.textContent = durStr;
    }
};

// Dispara um evento para o bottom sheet abrir e mostrar detalhes adicionais.
export const showRouteDetails = ({ distance = '-', duration = '-', infoText = '', extraHTML = '', state = 'medium' } = {}) => {
    const payload = { distance, duration, infoText, extraHTML, state };
    document.dispatchEvent(new CustomEvent('showRouteDetails', { detail: payload }));
};
// map_ui_utils.js
// Funções utilitárias de UI específicas do mapa (Status e Interações - SRP).
import { getMapInstance } from './map_data.js'; // Importa a instância do mapa

/**
 * 🚨 EXPORT CORRIGIDO: Usado por todos os módulos para atualizar o console de status e a UI.
 * @param {string} text - Mensagem de status.
 */
export function updateStatus(text) {
  console.log('[status]', text);
  const statusElement = document.getElementById('status-message');
  if (statusElement) {
    statusElement.textContent = text;
  }
}

/**
 * 🚨 EXPORT CORRIGIDO: Funções para desativar interações do OpenLayers
 */
export function disableMapInteractions() {
  const mapInstance = getMapInstance();
  if (mapInstance) {
    mapInstance.getInteractions().forEach(i => i.setActive(false));
    console.log("[MAP_UI] Interações do mapa desativadas.");
  }
}

/**
 * 🚨 EXPORT CORRIGIDO: Funções para reativar interações do OpenLayers
 */
export function enableMapInteractions() {
  const mapInstance = getMapInstance();
  if (mapInstance) {
    // Reativa as interações padrão (pan, zoom, etc.)
    mapInstance.getInteractions().forEach(i => i.setActive(true));
    console.log("[MAP_UI] Interações do mapa reativadas.");
  }
}
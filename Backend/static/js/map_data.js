// static/js/map_data.js - Armazena o estado global do mapa e das coordenadas para OpenLayers.
// Este módulo utiliza Getters e Setters para garantir a arquitetura modular correta (SRP).

let mapInstance = null;
let vectorSource = null; // Fonte de vetor para a rota e marcadores
let vectorLayer = null; // Camada de vetor (contém a fonte)
let rotatual = null; // Feature da rota atual (ol.Feature)

let originMarker = null; // ol.Feature para origem
let destinationMarker = null; // ol.Feature para destino

let originCoords = null; // { lon: 0, lat: 0 } 🚨 NOVO: Coordenadas da Origem (string ou GPS)
let destinationCoords = null; // { lon: 0, lat: 0 } 🚨 NOVO: Coordenadas do Destino
// Preferência: permite injetar o URL público por `window.__API_BASE_URL` para testes rápidos
let apiBaseUrl = (typeof window !== 'undefined' && window.__API_BASE_URL) ? window.__API_BASE_URL : null; // URL do Ngrok injetada

// --- Variáveis de Estado de GPS ---
let markerFeature = null; // Marcador do GPS do usuário (ol.Feature)
let accuracyFeature = null; // Círculo de precisão do GPS (ol.Feature)
let following = true; // Se o mapa deve seguir o usuário
let currentPos = null; // Posição atual [lon, lat]
let watchId = null; // ID do rastreamento (para cancelar)
let currentAccuracy = null; // precisão em metros
let currentPosTimestamp = null; // timestamp em ms

// --- Funções Getters e Setters (EXPORTADAS) ---

/** Obtém a instância atual do mapa OpenLayers. */
export function getMapInstance() { return mapInstance; }
/** Define a instância do mapa OpenLayers. */
export function setMapInstance(map) { mapInstance = map; }

/** Obtém a fonte de vetor. */
export function getVectorSource() { return vectorSource; }
/** Define a fonte de vetor. */
export function setVectorSource(source) { vectorSource = source; }

/** Obtém a camada de vetor. */
export function getVectorLayer() { return vectorLayer; }
/** Define a camada de vetor. */
export function setVectorLayer(layer) { vectorLayer = layer; }

/** Obtém o Feature da rota atual. */
export function getRotatual() { return rotatual; }
/** Define o Feature da rota atual. */
export function setRotatual(route) { rotatual = route; }

/** Obtém o Feature do marcador de origem. */
export function getOriginMarker() { return originMarker; }
/** Define o Feature do marcador de origem. */
export function setOriginMarker(marker) { originMarker = marker; }

/** Obtém o Feature do marcador de destino. */
export function getDestinationMarker() { return destinationMarker; }
/** Define o Feature do marcador de destino. */
export function setDestinationMarker(marker) { destinationMarker = marker; }

// --- Funções Getters e Setters para Coordenadas de Rota ---

/** Obtém as coordenadas de origem { lon: number, lat: number }. */
export function getOriginCoords() { return originCoords; }
/** Define as coordenadas de origem { lon: number, lat: number }. */
export function setOriginCoords(coords) { originCoords = coords; console.debug('[MAP_DATA] originCoords set ->', coords); }

/** Obtém as coordenadas de destino { lon: number, lat: number }. */
export function getDestinationCoords() { return destinationCoords; }
/** Define as coordenadas de destino { lon: number, lat: number }. */
export function setDestinationCoords(coords) { destinationCoords = coords; console.debug('[MAP_DATA] destinationCoords set ->', coords); }

// --- Funções Getters e Setters para API ---

/** Obtém a URL base da API. */
export function getApiBaseUrl() { return apiBaseUrl; }
/** Define a URL base da API. */
export function setApiBaseUrl(url) {
    apiBaseUrl = url;
    console.log(`[MÓDULO] URL Ngrok definida para: ${apiBaseUrl}`);
}

// --- Funções Getters e Setters para GPS ---

/** Obtém o feature do marcador GPS do usuário. */
export function getMarkerFeature() { return markerFeature; }
/** Obtém o feature do círculo de precisão. */
export function getAccuracyFeature() { return accuracyFeature; }
/** Obtém o estado de 'seguir'. */
export function isFollowing() { return following; }
/** Obtém a posição atual [lon, lat]. */
export function getCurrentPos() { return currentPos; }
/** Obtém a precisão atual (metros). */
export function getCurrentAccuracy() { return currentAccuracy; }
/** Obtém timestamp da última posição (ms). */
export function getCurrentPosTimestamp() { return currentPosTimestamp; }
/** Obtém o ID do watchPosition. */
export function getWatchId() { return watchId; }


/** Define o feature do marcador de posição. */
export function setMarkerFeature(marker) { 
    markerFeature = marker;
}
/** Define o feature do círculo de precisão. */
export function setAccuracyFeature(accuracy) { 
    accuracyFeature = accuracy;
}

/** Define a posição atual [lon, lat]. */
export function setCurrentPos(coords) { currentPos = coords; currentPosTimestamp = Date.now(); }
/** Define a precisão atual (metros). */
export function setCurrentAccuracy(acc) { currentAccuracy = acc; }
/** Alterna o estado de 'seguir'. */
export function toggleFollowingState(state) { following = state; }
/** Define o ID do watchPosition. */
export function setWatchId(id) { watchId = id; }
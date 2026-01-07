// geolocation.js
// Funções para obter e monitorar a localização GPS. (SRP)

import { updateStatus } from './map_ui_utils.js';
import { markerStyle, accuracyStyle } from './styles.js'; 
import { 
    getMapInstance, 
    getVectorSource,
    getMarkerFeature, 
    getAccuracyFeature, 
    isFollowing, 
    getCurrentPos, 
    getWatchId,
    setMarkerFeature, 
    setAccuracyFeature, 
    setCurrentPos, 
    toggleFollowingState, 
    setWatchId,
    getCurrentAccuracy, 
    setCurrentAccuracy,
    getCurrentPosTimestamp
} from './map_data.js';


// Threshold (meters) under which we consider a GPS reading 'reliable' for routing
const GPS_RELIABLE_THRESHOLD = 150; // meters
const ENABLE_AUTO_CENTER_ON_START = true;

// 🚨 NOVO (mínimo necessário): controla primeira leitura
let hasInitialFix = false;

function handlePosition(pos, forceInitialCenter = false) {
  if (!getMapInstance() || !getVectorSource()) {
      updateStatus("Erro interno: Mapa não inicializado para GPS.");
      return; 
  } 

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const accuracy = pos.coords.accuracy;
  const coord = ol.proj.fromLonLat([lon, lat]);

  try {
    console.debug('[GPS DEBUG] raw lon,lat:', lon, lat, 'accuracy(m):', accuracy);
    console.debug('[GPS DEBUG] projected (EPSG:3857):', coord);
  } catch(e) {}

  setCurrentPos([lon, lat]);
  setCurrentAccuracy(accuracy);

  let shouldCenter = false;
  let marker = getMarkerFeature();
  let accuracyFeature = getAccuracyFeature();

  if (!marker) {
    marker = new ol.Feature(new ol.geom.Point(coord));
    marker.setStyle(markerStyle); 
    getVectorSource().addFeature(marker);
    setMarkerFeature(marker);
    shouldCenter = true;
  } else {
    marker.setGeometry(new ol.geom.Point(coord));
  }
  
  const accuracyGeom = new ol.geom.Circle(coord, accuracy);
  
  if (!accuracyFeature) {
      accuracyFeature = new ol.Feature(accuracyGeom);
      accuracyFeature.setStyle(accuracyStyle); 
      getVectorSource().addFeature(accuracyFeature);
      setAccuracyFeature(accuracyFeature);
  } else {
      accuracyFeature.setGeometry(accuracyGeom);
  }

  // 🚨 Centralização inicial (controlável)
  if (!hasInitialFix && ENABLE_AUTO_CENTER_ON_START) {
    getMapInstance().getView().setCenter(coord);
    getMapInstance().getView().setZoom(Math.max(16, getMapInstance().getView().getZoom()));
    hasInitialFix = true;
    updateStatus(`GPS inicial obtido. Precisão: ${accuracy.toFixed(1)}m.`);
    return;
  }


  // Depois da primeira leitura, aplica as regras normais
  if ((shouldCenter || forceInitialCenter || isFollowing()) && accuracy <= GPS_RELIABLE_THRESHOLD) {
      getMapInstance().getView().setCenter(coord);
      getMapInstance().getView().setZoom(Math.max(16, getMapInstance().getView().getZoom()));
  }

  if (accuracy > GPS_RELIABLE_THRESHOLD) {
      updateStatus(`GPS ativo, precisão baixa: ${accuracy.toFixed(1)}m. Aguarde leituras melhores.`);
  } else {
      updateStatus(`GPS Ativo. Precisão: ${accuracy.toFixed(1)}m. ${isFollowing() ? '(Seguindo)' : ''}`);
  }
}

function handleError(err) {
  console.error(`[GPS ERROR] (${err.code}): ${err.message}`);
  let msg = "Erro GPS: Sinal indisponível.";
  if (err.code === 1) {
      msg = "Erro GPS: Permissão negada pelo usuário.";
  }
  updateStatus(msg);
}

// 🚨 ALTERAÇÃO: watchPosition é o ÚNICO ponto de entrada
function startWatching(forceInitialCenter = false) {
  if (!('geolocation' in navigator)) {
    updateStatus('Geolocation não suportado.');
    return;
  }

  if (getWatchId()) {
    updateStatus("Rastreamento GPS já está ativo.");
    return;
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => handlePosition(pos, forceInitialCenter),
    handleError,
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );

  setWatchId(id);
  toggleFollowingState(FontFaceSetLoadEvent);
}

export function disableFollowOnMapDrag() {
    if (isFollowing()) {
        toggleFollowingState(false);
        updateStatus("Modo Seguir Desativado (Movimento manual detectado).");
        
        const btnFollow = document.getElementById('btn-follow');
        if (btnFollow) {
            btnFollow.textContent = '▶ Seguir: OFF';
        }
    }
}

// 🚨 ALTERAÇÃO: função agora só inicia o watch (sem getCurrentPosition)
export function getCurrentOnceAndStartWatch(forceCenter = false) {
    startWatching(forceCenter);
}

export function stopWatching() {
    const watchId = getWatchId();
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
        toggleFollowingState(false);
        hasInitialFix = false; // 🚨 reset correto
        updateStatus("Rastreamento GPS desativado.");
    }
}

export function toggleFollow() {
    toggleFollowingState(!isFollowing());
    updateStatus(isFollowing() ? "Modo Seguir Ativado." : "Modo Seguir Desativado.");
    
    const btnFollow = document.getElementById('btn-follow');
    if (btnFollow) {
        btnFollow.textContent = isFollowing() ? '▶ Seguir: ON' : '▶ Seguir: OFF';
    }
}

export function initMapWithCurrentPosition(forceCenter = true) {
    if (!('geolocation' in navigator)) { 
        updateStatus('Geolocation não suportado.');
        return; 
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            handlePosition(pos, forceCenter); 
            if (!getMapInstance()) {
                createMap(); // ⚠️ certifique-se de ter a função de criação do mapa
            }
            if (!getWatchId()) {
                startWatching();
            }
        },
        (err) => {
            console.warn('[GPS] Falha ao obter posição inicial:', err.message || err);
            startWatching();
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
}


export function centerMapOnCurrentPos() {
    const currentPos = getCurrentPos();
    const map = getMapInstance();
    if (currentPos && map) {
        const coord = ol.proj.fromLonLat(currentPos);
        map.getView().setCenter(coord);
        map.getView().setZoom(Math.max(16, map.getView().getZoom()));
        updateStatus("Mapa centralizado na sua posição atual.");
    } else {
        updateStatus("Posição GPS atual não disponível para centralizar.");
    }
}

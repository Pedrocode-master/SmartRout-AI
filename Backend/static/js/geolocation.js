// geolocation.js
// Funções para obter e monitorar a localização GPS. (SRP)
import { updateStatus } from './map_ui_utils.js'; // 🚨 IMPORT CORRIGIDO
// 🚨 NOVO: Importa os estilos do módulo 'styles.js'
import { markerStyle, accuracyStyle } from './styles.js'; 
import { 
    getMapInstance, 
    getVectorSource,
    // 🚨 CORRIGIDO: getFollowingState renomeado para isFollowing
    getMarkerFeature, getAccuracyFeature, isFollowing, getCurrentPos, getWatchId, // Leitura
    setMarkerFeature, setAccuracyFeature, setCurrentPos, toggleFollowingState, setWatchId, // Escrita
    getCurrentAccuracy, setCurrentAccuracy, getCurrentPosTimestamp
} from './map_data.js';


// Threshold (meters) under which we consider a GPS reading 'reliable' for routing
const GPS_RELIABLE_THRESHOLD = 150; // meters

function handlePosition(pos, isInitialCenter = false) {
  // Garante que o mapa esteja carregado antes de manipular features
  if (!getMapInstance() || !getVectorSource()) {
      updateStatus("Erro interno: Mapa não inicializado para GPS.");
      return; 
  } 

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const accuracy = pos.coords.accuracy;
  const coord = ol.proj.fromLonLat([lon, lat]);
    // Diagnostic logging para ajudar a entender deslocamentos/offsets
    try {
            console.debug('[GPS DEBUG] raw lon,lat:', lon, lat, 'accuracy(m):', accuracy);
            console.debug('[GPS DEBUG] projected (EPSG:3857):', coord);
    } catch(e) {
            // Não bloquear em caso de erro de debug
    }
    setCurrentPos([lon, lat]); // Atualiza a posição no estado compartilhado (map_data)
    setCurrentAccuracy(accuracy);

  let shouldCenter = false;
  let marker = getMarkerFeature();
  let accuracyFeature = getAccuracyFeature();

    if (!marker) {
    // Primeira vez que recebe GPS:
    marker = new ol.Feature(new ol.geom.Point(coord));
    // 🚨 CORRIGIDO: Usa a constante de estilo importada
    marker.setStyle(markerStyle); 
    getVectorSource().addFeature(marker);
    setMarkerFeature(marker);
    shouldCenter = true; // Força a centralização na primeira vez
  } else {
    marker.setGeometry(new ol.geom.Point(coord));
  }
  
  // Lidar com o círculo de precisão
  const accuracyGeom = new ol.geom.Circle(coord, accuracy);
  
  if (!accuracyFeature) {
      accuracyFeature = new ol.Feature(accuracyGeom);
      // 🚨 CORRIGIDO: Usa a constante de estilo importada
      accuracyFeature.setStyle(accuracyStyle); 
      getVectorSource().addFeature(accuracyFeature);
      setAccuracyFeature(accuracyFeature);
  } else {
      accuracyFeature.setGeometry(accuracyGeom);
  }

  // Centraliza o mapa se for o primeiro carregamento, se for forçado, ou se estiver em modo 'follow'
  // Só centra automaticamente se a precisão for aceitável ou se o centro for forçado.
  if ((shouldCenter || isInitialCenter || isFollowing()) && accuracy <= GPS_RELIABLE_THRESHOLD) { 
      getMapInstance().getView().setCenter(coord);
      getMapInstance().getView().setZoom(Math.max(16, getMapInstance().getView().getZoom())); // Aumenta o zoom para ver a precisão
  }

  // Atualiza o status com indicação clara quando a precisão é baixa
  if (accuracy > GPS_RELIABLE_THRESHOLD) {
      updateStatus(`GPS ativo, precisão baixa: ${accuracy.toFixed(1)}m. Aguarde leituras melhores.`);
  } else {
      updateStatus(`GPS Ativo. Precisão: ${accuracy.toFixed(1)}m. ${isFollowing() ? '(Seguindo)' : ''}`);
  }
}


function handleError(err) {
  console.error(`[GPS ERROR] (${err.code}): ${err.message}`);
  // 1: PERMISSION_DENIED (Usuário bloqueou)
  // 2: POSITION_UNAVAILABLE (Sem sinal, ex: em túnel)
  // 3: TIMEOUT
  let msg = "Erro GPS: Sinal indisponível.";
  if (err.code === 1) {
      msg = "Erro GPS: Permissão negada pelo usuário.";
  }
  updateStatus(msg);
  // Não fazemos stopWatching() aqui, para permitir que o usuário ligue de novo se quiser.
}

function startWatching() {
  if (!('geolocation' in navigator)) { updateStatus('Geolocation não suportado.'); return; }
  // watchId é armazenado no escopo do módulo de dados.
  const id = navigator.geolocation.watchPosition(handlePosition, handleError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
  setWatchId(id);
  toggleFollowingState(true); // Começa seguindo por padrão
}

// 🚨 NOVO EXPORT: Função para desativar o modo de seguir quando o usuário interage com o mapa
export function disableFollowOnMapDrag() {
    // Se estiver seguindo, desliga o modo de seguir
    if (isFollowing()) {
        toggleFollowingState(false);
        updateStatus("Modo Seguir Desativado (Movimento manual detectado).");
        
        // Atualizar o botão (Se existir)
        const btnFollow = document.getElementById('btn-follow');
        if (btnFollow) {
            btnFollow.textContent = '▶ Seguir: OFF';
        }
    }
}

// 🚨 EXPORT: Esta função deve ser chamada por events.js ou header.js (para ligar o GPS)
export function getCurrentOnceAndStartWatch(forceCenter = false) {
  if (!('geolocation' in navigator)) { updateStatus('Geolocation não suportado.'); return; }
  
  // Verifica se já está rastreando antes de iniciar um novo watch
  if (!getWatchId()) { 
      // Tenta obter uma leitura única inicial com alta precisão, mas não bloqueia
      navigator.geolocation.getCurrentPosition((pos) => {
          handlePosition(pos, forceCenter);
          // Se a precisão inicial for ruim, mantemos o watch para tentar leituras melhores
          startWatching();
      }, (err) => {
          // Em caso de falha na leitura inicial, ainda iniciamos o watch para tentar posteriormente
          console.warn('[GPS] Falha ao obter posição inicial:', err.message || err);
          startWatching();
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  } else {
      updateStatus("Rastreamento GPS já está ativo.");
  }
}

// 🚨 EXPORT: Função para parar o rastreamento GPS
export function stopWatching() {
    const watchId = getWatchId();
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
        toggleFollowingState(false);
        updateStatus("Rastreamento GPS desativado.");
    }
}

// 🚨 EXPORT: Alterna o estado de seguir (usado no botão)
export function toggleFollow() {
    toggleFollowingState(!isFollowing()); // 🚨 CORRIGIDO: Usa 'isFollowing()'
    updateStatus(isFollowing() ? "Modo Seguir Ativado." : "Modo Seguir Desativado."); // 🚨 CORRIGIDO: Usa 'isFollowing()'
    
    // Atualizar o botão
    const btnFollow = document.getElementById('btn-follow');
    if (btnFollow) {
        btnFollow.textContent = isFollowing() ? '▶ Seguir: ON' : '▶ Seguir: OFF'; // 🚨 CORRIGIDO: Usa 'isFollowing()'
    }
}

// 🚨 EXPORT: Centraliza o mapa na posição atual (usado no botão 'Centralizar')
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

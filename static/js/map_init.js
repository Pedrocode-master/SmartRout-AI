// static/js/map_init.js
// Inicialização do mapa, camadas e estilos globais

// 🚨 DECLARAÇÃO ÚNICA: Estas variáveis são o estado global.
let map; // Instância do OpenLayers.Map
let markerFeature = null; // Marcador de posição atual
let accuracyFeature = null; // Círculo de precisão do GPS
let watchId = null;
let following = false;
let currentPos = null;   // [lon, lat] da posição atual
let lat1 = null, lon1 = null; // Coordenadas da Origem (texto ou GPS)
let rotatual = null;     // camada de rota atualmente desenhada
let vectorSource;        // Fonte do OpenLayers para features
let vectorLayer;         // Camada do OpenLayers para features

// Variáveis Globais de UI (Referência aos elementos, definidas APÓS o carregamento do DOM)
const btnFollow = document.getElementById('btn-follow');


/* Funções de Estilo (podem ser definidas antes da inicialização do mapa) */
const markerStyle = new ol.style.Style({
  image: new ol.style.Circle({ radius: 8, fill: new ol.style.Fill({ color: '#ff5722' }), stroke: new ol.style.Stroke({ color: '#fff', width: 2 }) })
});
const accuracyStyle = new ol.style.Style({
  fill: new ol.style.Fill({ color: 'rgba(33,150,243,0.1)' }),
  stroke: new ol.style.Stroke({ color: 'rgba(33,150,243,0.6)', width: 1 })
});

/* Funções de utilidade */
// 🚨 Global: Usando window. para escopo global.
window.updateStatus = function(text) {
  console.log('[status]', text);
}

// Funções para desativar/ativar interações do OpenLayers
// 🚨 Global: Usando window. para escopo global.
window.disableMapInteractions = function() {
  if (map) {
    map.getInteractions().forEach(i => i.setActive(false));
  }
}

// 🚨 Global: Usando window. para escopo global.
window.enableMapInteractions = function() {
  if (map) {
    map.getInteractions().forEach(i => i.setActive(true));
  }
}


// =======================================================
// INICIALIZAÇÃO DO MAPA APÓS O DOM ESTAR PRONTO
// =======================================================
window.addEventListener('load', () => {
    // Inicialização da fonte e camada
    vectorSource = new ol.source.Vector();
    vectorLayer = new ol.layer.Vector({ source: vectorSource });

    /* Inicialização do mapa OpenLayers */
    map = new ol.Map({
      target: 'map',
      layers: [
        new ol.layer.Tile({ source: new ol.source.OSM() }), 
        vectorLayer // Adiciona a camada de features
      ],
      view: new ol.View({ 
        center: ol.proj.fromLonLat([-46.633308, -23.55052]), 
        zoom: 14 
      })
    });
    
    // As interações de clique (singleclick) são tratadas em events.js
});

// static/js/styles.js - Constantes de estilo para OpenLayers (SRP).
// OpenLayers imports (assumindo que o ol está globalmente disponível via CDN no HTML)
const ol = window.ol; 

// 1. Estilo para o marcador do usuário (um círculo simples)
export const markerStyle = new ol.style.Style({
    image: new ol.style.Circle({
        radius: 8,
        fill: new ol.style.Fill({ color: 'rgba(0, 102, 204, 1.0)' }), // Azul
        stroke: new ol.style.Stroke({ color: 'white', width: 3 })
    })
});

// 2. Estilo para o círculo de precisão
export const accuracyStyle = new ol.style.Style({
    fill: new ol.style.Fill({
        color: 'rgba(0, 102, 204, 0.2)'
    }),
    stroke: new ol.style.Stroke({
        color: 'rgba(0, 102, 204, 0.5)',
        width: 1
    })
});

// 3. Estilo para o Marcador de Origem (Verde) 🚨 NOVO
export const originMarkerStyle = new ol.style.Style({
    image: new ol.style.Icon({
        anchor: [0.5, 1], // Ajusta o âncora para a parte inferior do ícone
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        scale: 0.7
    }),
    text: new ol.style.Text({
        text: 'A',
        font: 'bold 12px sans-serif',
        fill: new ol.style.Fill({ color: 'white' }),
        offsetY: -35 // Ajuste para ficar sobre o ícone
    })
});

// 4. Estilo para o Marcador de Destino (Vermelho) 🚨 NOVO
export const destinationMarkerStyle = new ol.style.Style({
    image: new ol.style.Icon({
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        scale: 0.7
    }),
    text: new ol.style.Text({
        text: 'B',
        font: 'bold 12px sans-serif',
        fill: new ol.style.Fill({ color: 'white' }),
        offsetY: -35
    })
});

// 5. Estilo da Rota (Azul) - Reexportado para uso em map_utils
export const routeStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({
        color: 'rgba(66, 133, 244, 0.9)', // Google Blue
        width: 6,
    }),
});
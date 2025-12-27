// static/js/map_utils.js - SUBSTITUA O ARQUIVO COMPLETO
import { 
    getMapInstance, 
    getVectorSource, 
    getRotatual, 
    setRotatual,
    getOriginMarker,
    getDestinationMarker,
    setOriginMarker,
    setDestinationMarker,
    getOriginCoords,
    getDestinationCoords,
    setOriginCoords,
    setDestinationCoords
} from './map_data.js';

import {
    originMarkerStyle,
    destinationMarkerStyle,
    routeStyle
} from './styles.js';

const ol = window.ol; 

// 🆕 Armazena features de tráfego/incidentes para limpeza posterior
let trafficFeatures = [];
let incidentFeatures = [];

export function clearRoute() {
    const vectorSource = getVectorSource();
    const rotatual = getRotatual();
    
    if (vectorSource) {
        // 1. Limpar rota principal
        if (rotatual) {
            vectorSource.removeFeature(rotatual);
            setRotatual(null);
        }
        
        // 2. Limpar Marcadores A/B
        const markers = [getOriginMarker(), getDestinationMarker()];
        markers.forEach(marker => {
            if (marker) {
                vectorSource.removeFeature(marker);
            }
        });
        setOriginMarker(null);
        setDestinationMarker(null);

        // 🆕 3. Limpar segmentos de tráfego
        trafficFeatures.forEach(feature => {
            try {
                vectorSource.removeFeature(feature);
            } catch (e) {
                console.debug('[MAP_UTILS] Feature de tráfego já removida:', e);
            }
        });
        trafficFeatures = [];

        // 🆕 4. Limpar incidentes
        incidentFeatures.forEach(feature => {
            try {
                vectorSource.removeFeature(feature);
            } catch (e) {
                console.debug('[MAP_UTILS] Feature de incidente já removida:', e);
            }
        });
        incidentFeatures = [];
        
        // 5. Limpar Coordenadas Armazenadas
        setOriginCoords(null);
        setDestinationCoords(null);
        
        console.log("[MAP_UTILS] Rota, tráfego e incidentes removidos.");
    }
}

export function drawRouteMarkers() {
    const vectorSource = getVectorSource();
    const originCoords = getOriginCoords();
    const destinationCoords = getDestinationCoords();
    
    if (!vectorSource) {
        console.warn('[MAP_UTILS] Fonte de vetor ainda não disponível. Aguardando mapReady...');
        document.addEventListener('mapReady', () => {
            const vs = getVectorSource();
            const o = getOriginCoords();
            const d = getDestinationCoords();
            if (vs && o && d) {
                drawRouteMarkers();
            }
        }, { once: true });
        return;
    }

    if (!originCoords || !destinationCoords) {
        console.warn('[MAP_UTILS] Coordenadas ausentes. Aborting drawRouteMarkers.');
        return;
    }

    // Limpa marcadores antigos antes de desenhar novos
    const oldOrigin = getOriginMarker();
    const oldDest = getDestinationMarker();
    if (oldOrigin) vectorSource.removeFeature(oldOrigin);
    if (oldDest) vectorSource.removeFeature(oldDest);

    // 1. Marcador de Origem (A)
    const originPoint = ol.proj.fromLonLat([originCoords.lon, originCoords.lat]);
    const originMarkerFeature = new ol.Feature({
        geometry: new ol.geom.Point(originPoint),
        name: 'Origem'
    });
    originMarkerFeature.setStyle(originMarkerStyle);
    vectorSource.addFeature(originMarkerFeature);
    setOriginMarker(originMarkerFeature);
    
    // 2. Marcador de Destino (B)
    const destinationPoint = ol.proj.fromLonLat([destinationCoords.lon, destinationCoords.lat]);
    const destinationMarkerFeature = new ol.Feature({
        geometry: new ol.geom.Point(destinationPoint),
        name: 'Destino'
    });
    destinationMarkerFeature.setStyle(destinationMarkerStyle);
    vectorSource.addFeature(destinationMarkerFeature);
    setDestinationMarker(destinationMarkerFeature);
    
    console.log("[MAP_UTILS] Marcadores A/B desenhados.");
}

function drawTrafficSegments(segments) {
    const vectorSource = getVectorSource();
    const ol = window.ol;

    if (!vectorSource || !segments || segments.length === 0) {
        return;
    }

    console.log(`[TRAFFIC] 🎨 Desenhando ${segments.length} segmentos coloridos`);

    segments.forEach((segment, idx) => {
        try {
            // 🔧 CORREÇÃO: Acessa properties corretamente
            const props = segment.properties || segment;
            const geom = segment.geometry;
            
            console.log(`[TRAFFIC] Segmento ${idx}:`, {
                start: geom.coordinates[0],
                end: geom.coordinates[1],
                color: props.color,
                status: props.status
            });

            // Converte coordenadas para o sistema do OpenLayers
            const startCoord = ol.proj.fromLonLat([
                parseFloat(geom.coordinates[0][0]), 
                parseFloat(geom.coordinates[0][1])
            ]);
            const endCoord = ol.proj.fromLonLat([
                parseFloat(geom.coordinates[1][0]), 
                parseFloat(geom.coordinates[1][1])
            ]);

            const lineCoords = [startCoord, endCoord];
            const color = props.color || '#00FF00';
            const status = props.status || 'light';

            const segmentFeature = new ol.Feature({
                geometry: new ol.geom.LineString(lineCoords),
                name: `Traffic_Segment_${idx}`,
                traffic_status: status
            });

            const segmentStyle = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: color,
                    width: 8,
                    lineCap: 'round',
                    lineJoin: 'round'
                }),
                zIndex: 200
            });

            segmentFeature.setStyle(segmentStyle);
            vectorSource.addFeature(segmentFeature);
            trafficFeatures.push(segmentFeature);

        } catch (e) {
            console.error(`[TRAFFIC] ❌ Erro ao desenhar segmento ${idx}:`, e);
        }
    });

    console.log(`[TRAFFIC] 🎉 ${trafficFeatures.length} segmentos adicionados ao mapa`);
}

function drawTrafficIncidents(incidents) {
    const vectorSource = getVectorSource();
    if (!vectorSource || !incidents || incidents.length === 0) {
        return;
    }

    console.log(`[MAP_UTILS] Desenhando ${incidents.length} incidentes de tráfego`);

    incidents.forEach((incident, idx) => {
        try {
            const coords = incident.geometry.coordinates;
            const icon = incident.properties.icon || '⚠️';
            const severity = incident.properties.severity || 'LOW';
            const description = incident.properties.description || 'Incidente';

            const point = ol.proj.fromLonLat(coords);

            const incidentFeature = new ol.Feature({
                geometry: new ol.geom.Point(point),
                name: `Incident_${idx}`,
                incident_type: incident.properties.incident_type,
                severity: severity,
                description: description
            });

            // Estilo: texto com emoji + cor baseada na severidade
            const severityColors = {
                'LOW': '#FFA500',      // Laranja
                'MODERATE': '#FF6600', // Laranja escuro
                'HIGH': '#FF0000',     // Vermelho
                'CRITICAL': '#8B0000'  // Vermelho escuro
            };

            const incidentStyle = new ol.style.Style({
                text: new ol.style.Text({
                    text: icon,
                    font: 'bold 20px sans-serif',
                    fill: new ol.style.Fill({ color: '#fff' }),
                    stroke: new ol.style.Stroke({ 
                        color: severityColors[severity] || '#FFA500', 
                        width: 3 
                    }),
                    offsetY: 0
                }),
                zIndex: 200  // Fica acima de tudo
            });

            incidentFeature.setStyle(incidentStyle);
            vectorSource.addFeature(incidentFeature);
            incidentFeatures.push(incidentFeature);

        } catch (e) {
            console.error(`[MAP_UTILS] Erro ao desenhar incidente ${idx}:`, e);
        }
    });

    console.log(`[MAP_UTILS] ✅ ${incidentFeatures.length} incidentes desenhados`);
}

/**
 * Desenha a rota no mapa a partir do GeoJSON
 * 🆕 AGORA SUPORTA: Segmentos de tráfego coloridos + Incidentes
 */
export function drawRouteOnMap(geojsonResult) {
    const map = getMapInstance();
    const vectorSource = getVectorSource();

    if (!map || !vectorSource || !geojsonResult) {
        console.error("[MAP_UTILS] Dependências ausentes para desenhar a rota.");
        return;
    }
    
    // Limpa rota anterior (mas mantém marcadores A/B)
    const rotatual = getRotatual();
    if (rotatual) {
        vectorSource.removeFeature(rotatual);
        setRotatual(null);
    }

    // Limpa segmentos/incidentes anteriores
    trafficFeatures.forEach(f => vectorSource.removeFeature(f));
    trafficFeatures = [];
    incidentFeatures.forEach(f => vectorSource.removeFeature(f));
    incidentFeatures = [];
    
    try {
        const features = geojsonResult.features || [];
        
        if (features.length === 0) {
            console.error("[MAP_UTILS] GeoJSON sem features.");
            return { distance: null, duration: null, extraHTML: '' };
        }

        // 🆕 Separa features por tipo
        const routeFeatures = features.filter(f => 
            f.properties?.feature_type === 'route_reference' || 
            f.properties?.feature_type === 'route_basic' ||
            (!f.properties?.feature_type && f.geometry?.type === 'LineString')
        );
        
        const trafficSegments = features.filter(f => 
            f.properties?.feature_type === 'traffic_segment'
        );
        
        const incidents = features.filter(f => 
            f.properties?.feature_type === 'traffic_incident'
        );

        console.log(`[MAP_UTILS] Features recebidas: ${routeFeatures.length} rotas, ${trafficSegments.length} segmentos, ${incidents.length} incidentes`);

        // 1. Desenha rota base (invisível se houver tráfego)
        let routeFeature = null;
        let extracted = { distance: null, duration: null, extraHTML: '' };

        if (routeFeatures.length > 0) {
            const mainRoute = routeFeatures[0];
            
            const format = new ol.format.GeoJSON();
            const olFeatures = format.readFeatures(mainRoute, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });

            if (olFeatures.length > 0) {
                routeFeature = olFeatures[0];
                
                // Se não houver segmentos de tráfego, desenha a rota normalmente
                if (trafficSegments.length === 0) {
                    routeFeature.setStyle(routeStyle);
                    vectorSource.addFeature(routeFeature);
                    setRotatual(routeFeature);
                } else {
                    // Se houver segmentos, rota base fica invisível (só para fitExtent)
                    routeFeature.setStyle(new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: 'rgba(0,0,0,0)',  // Invisível
                            width: 0
                        })
                    }));
                    vectorSource.addFeature(routeFeature);
                    setRotatual(routeFeature);
                }

                // Extrai metadados
                const props = mainRoute.properties || {};
                const dist = props.distance || props.summary?.distance;
                const dur = props.duration || props.summary?.duration;

                if (dist) extracted.distance = (dist / 1000).toFixed(2) + ' km';
                if (dur) extracted.duration = Math.round(dur / 60) + ' min';

                // Ajusta visualização
                const view = map.getView();
                view.fit(routeFeature.getGeometry().getExtent(), {
                    padding: [100, 100, 100, 100],
                    duration: 1000
                });
            }
        }

        // 🆕 2. Desenha segmentos de tráfego coloridos
        if (trafficSegments.length > 0) {
            drawTrafficSegments(trafficSegments);
        }

        // 🆕 3. Desenha incidentes
        if (incidents.length > 0) {
            drawTrafficIncidents(incidents);
        }

        console.log('[MAP_UTILS] Rota desenhada com sucesso.');
        return extracted;

    } catch (e) {
        console.error("[MAP_UTILS] Erro ao processar rota:", e);
        return { distance: null, duration: null, extraHTML: '' };
    }
}
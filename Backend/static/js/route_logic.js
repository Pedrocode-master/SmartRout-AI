import { showMessage, updateRouteInfo, showRouteDetails } from './ui_utils.js';
import { drawRouteOnMap, clearRoute, drawRouteMarkers } from './map_utils.js';
import { getApiBaseUrl, setOriginCoords, setDestinationCoords, getCurrentPos, getCurrentAccuracy, getOriginCoords, getDestinationCoords } from './map_data.js';
import { getAuthHeaders } from './auth.js';

export { clearRoute };

const GPS_RELIABLE_THRESHOLD = 150;

/**
 * 🆕 Coleta constraints do bottom sheet
 */
function getRouteConstraints() {
    const constraints = {
        avoid: [],
        prefer: []
    };
    
    const avoidCheckboxes = document.querySelectorAll('input[name="avoid"]:checked');
    avoidCheckboxes.forEach(checkbox => {
        constraints.avoid.push(checkbox.value);
    });
    
    const preferRadio = document.querySelector('input[name="prefer"]:checked');
    if (preferRadio) {
        constraints.prefer.push(preferRadio.value);
    }
    
    return constraints;
}

/**
 * 🆕 Exibe status de otimização no bottom sheet
 */
function showOptimizationStatus(message, type = 'info') {
    const statusDiv = document.getElementById('optimization-status');
    if (!statusDiv) return;
    
    statusDiv.style.display = 'block';
    statusDiv.className = `optimization-status ${type}`;
    statusDiv.textContent = message;
    
    if (type !== 'error') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 10000);
    }
}

/**
 * 🆕 NOVA FUNÇÃO: Exibe legenda de tráfego e resumo de incidentes
 */
function displayTrafficLegend(geojsonResult) {
    const legendDiv = document.getElementById('traffic-legend');
    const incidentSummary = document.getElementById('incident-summary');
    
    if (!legendDiv || !incidentSummary) {
        console.warn('[TRAFFIC] Elementos de legenda não encontrados no DOM');
        return;
    }

    const features = geojsonResult.features || [];
    const trafficSegments = features.filter(f => f.properties?.feature_type === 'traffic_segment');
    const incidents = features.filter(f => f.properties?.feature_type === 'traffic_incident');

    // Mostra legenda se houver segmentos de tráfego
    if (trafficSegments.length > 0) {
        legendDiv.style.display = 'block';

        const greenCount = trafficSegments.filter(s => s.properties.color === '#00FF00').length;
        const yellowCount = trafficSegments.filter(s => s.properties.color === '#FFFF00').length;
        const redCount = trafficSegments.filter(s => s.properties.color === '#FF0000').length;

        console.log(`[TRAFFIC] 🟢 ${greenCount} | 🟡 ${yellowCount} | 🔴 ${redCount} segmentos`);
    } else {
        legendDiv.style.display = 'none';
    }

    // Mostra resumo de incidentes
    if (incidents.length > 0) {
        incidentSummary.style.display = 'block';

        const incidentTypes = {};
        incidents.forEach(inc => {
            const type = inc.properties.incident_type || 'OTHER';
            incidentTypes[type] = (incidentTypes[type] || 0) + 1;
        });

        const typeNames = {
            'ACCIDENT': '🚗 Acidentes',
            'ROAD_WORKS': '🚧 Obras',
            'ROAD_CLOSED': '🚫 Vias fechadas',
            'JAM': '🚦 Congestionamentos',
            'FLOODING': '🌊 Alagamentos',
            'BROKEN_DOWN_VEHICLE': '🔧 Veículos quebrados'
        };

        const typesText = Object.entries(incidentTypes)
            .map(([type, count]) => {
                const name = typeNames[type] || '⚠️ Outros';
                return `${name}: ${count}`;
            })
            .join(' • ');

        incidentSummary.innerHTML = `
            <strong>⚠️ ${incidents.length} incidente${incidents.length > 1 ? 's' : ''} detectado${incidents.length > 1 ? 's' : ''}</strong><br>
            <span style="font-size: 0.8em; color: #856404;">${typesText}</span>
        `;

        console.log(`[INCIDENTS] ${incidents.length} incidentes:`, incidentTypes);
    } else {
        incidentSummary.style.display = 'none';
    }
}

/**
 * Geocodifica um endereço em coordenadas
 */
async function geocodeAddress(address) {
    const ngrokUrl = getApiBaseUrl();
    if (!ngrokUrl) {
        showMessage('Erro: URL do servidor não definida.', 'error');
        return null;
    }
    
    const coord = parseCoordinateString(address);
    if (coord) {
        console.log(`[GEOCODING] Entrada detectada como coordenadas: ${coord.lat.toFixed(6)}, ${coord.lon.toFixed(6)}`);
        return coord;
    }

    const url = `${ngrokUrl}/geocoding`; 
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ address: address })
        });

        if (response.status === 401) {
            showMessage('Sessão expirada. Faça login novamente.', 'error');
            setTimeout(() => {
            window.parent.postMessage({ type: 'SESSION_EXPIRED' }, '*');
            }, 2000);
        return null;
        }
    

        const result = await response.json();
        
        if (response.ok && result.lon && result.lat) {
            console.log(`[GEOCODING] Endereço '${address}' convertido para: ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`);
            return { lon: result.lon, lat: result.lat };
        } else {
            showMessage(`Erro de geocodificação para: "${address}". Detalhe: ${result.erro || 'Endereço não encontrado'}`, 'error');
            console.error(`[GEOCODING] Falha ao geocodificar ${address}:`, result);
            return null;
        }
    } catch (error) {
        console.error('Erro no fetch de geocodificação:', error);
        showMessage('Erro de conexão ao geocodificar o endereço.', 'error');
        return null;
    }
}

/**
 * Tenta interpretar string como coordenadas
 */
function parseCoordinateString(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.trim();
    const m = cleaned.match(/^\s*([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;

    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
        return { lon: b, lat: a };
    }
    if (Math.abs(b) <= 90 && Math.abs(a) <= 180) {
        return { lon: a, lat: b };
    }
    return null;
}

/**
 * Calcula rota a partir de endereços (com geocoding)
 */
export async function calculateRouteFromAddresses(originInput, destinationInput) {
    clearRoute();
    showMessage('Calculando rota...', 'info');

    // 1. Processar Origem
    let originCoords = null;
    if (originInput.toUpperCase() === 'GPS') {
        const currentPos = getCurrentPos();
        if (currentPos) {
            const acc = getCurrentAccuracy && getCurrentAccuracy();
            const ACC_THRESHOLD = GPS_RELIABLE_THRESHOLD;
            if (acc && acc > ACC_THRESHOLD) {
                showMessage(`Posição GPS disponível, mas imprecisa (${acc.toFixed(0)} m). Aguarde leituras melhores ou insira um endereço.`, 'error');
                return;
            }
            originCoords = { lon: currentPos[0], lat: currentPos[1] };
            showMessage(`Origem definida pela sua localização GPS.`, 'info');
        } else {
            showMessage('Erro: Posição GPS não disponível. Tente novamente ou insira um endereço de origem.', 'error');
            return;
        }
    } else {
        originCoords = await geocodeAddress(originInput);
        if (!originCoords) {
            return;
        }
    }

    // 2. Processar Destino
    const destinationCoords = await geocodeAddress(destinationInput);
    if (!destinationCoords) {
        return;
    }

    // 3. Salvar Coordenadas
    setOriginCoords(originCoords);
    setDestinationCoords(destinationCoords);
    
    // 4. Aguardar mapa pronto
    await waitForMapReady();

    // 5. Desenhar Marcadores A/B
    if (getOriginCoords() && getDestinationCoords()) {
        drawRouteMarkers();
    } else {
        showMessage('Coordenadas inválidas para desenhar marcadores.', 'error');
        return;
    }
    
    // 6. Coletar constraints
    const constraints = getRouteConstraints();
    const hasConstraints = constraints.avoid.length > 0 || constraints.prefer.length > 0;
    
    if (hasConstraints) {
        console.log('[ROUTE_LOGIC] Constraints detectadas:', constraints);
        showOptimizationStatus('🧠 Analisando tráfego, clima e otimizando rota...', 'info');
    }
    
    // 7. Chamar API
    await fetchRouteData(originCoords, destinationCoords, hasConstraints ? constraints : null);
}

/**
 * Função isolada para chamar a API com coordenadas
 */
async function fetchRouteData(origin, destination, constraints = null) {
    const ngrokUrl = getApiBaseUrl();
    if (!ngrokUrl) {
        showMessage('Erro: URL do servidor não definida.', 'error');
        return;
    }

    const coords = [
        [origin.lon, origin.lat],
        [destination.lon, destination.lat]
    ];
    
    try {
        const preferredRouteEndpoint = (typeof window !== 'undefined' && window.__API_BASE_URL) 
            ? '/calculate_route'
            : '/rota';
        
        let requestBody = { coordinates: coords };
        
        if (preferredRouteEndpoint === '/calculate_route') {
            requestBody = {
                origin: { lat: origin.lat, lon: origin.lon },
                destination: { lat: destination.lat, lon: destination.lon }
            };
        }
        
        if (constraints) {
            requestBody.constraints = constraints;
            console.log('[ROUTE_LOGIC] Enviando constraints ao backend:', constraints);
        }

        const response = await fetch(`${ngrokUrl}${preferredRouteEndpoint}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });
        
        const geojsonResult = await response.json();

        if (!response.ok) {
            const detail = geojsonResult.detalhe || geojsonResult.error || geojsonResult.erro || geojsonResult.message || JSON.stringify(geojsonResult);
            console.error('[ERRO API ORS]', response.status, detail);

            if (response.status === 401 || response.status === 403) {
                showMessage(
                    `Acesso negado ao serviço de rotas (ORS). Verifique sua chave ORS e permissões da conta. Detalhe: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
                    'error'
                );
                showOptimizationStatus('❌ Erro de acesso à API de rotas', 'error');
                setTimeout(() => {
                window.parent.postMessage({ type: 'SESSION_EXPIRED' }, '*');
            }, 2000);
                return;
            }

            showMessage(`Erro ao calcular a rota: ${geojsonResult.erro || 'Erro desconhecido.'}`, 'error');
            showOptimizationStatus('❌ Falha ao calcular rota', 'error');
            return;
        }
        
        // Verifica dados de otimização
        let optimizationData = null;
        try {
            if (geojsonResult.features && geojsonResult.features[0] && geojsonResult.features[0].properties) {
                optimizationData = geojsonResult.features[0].properties.optimization;
            }
        } catch (e) {
            console.debug('[ROUTE_LOGIC] Nenhum dado de otimização encontrado');
        }
        
        // 1. Desenhar a rota no mapa
        let mapExtract = null;
        try {
            mapExtract = drawRouteOnMap(geojsonResult) || null;
        } catch (e) {
            console.debug('[ROUTE] drawRouteOnMap returned error:', e);
            mapExtract = null;
        }
        
        // 🔧 CORREÇÃO: Chama displayTrafficLegend APÓS desenhar a rota
        displayTrafficLegend(geojsonResult);
        
        // 2. Extrair informações da rota
        let distance = 'N/A';
        let duration = 'N/A';
        let stepsArray = null;

        function tryNumber(v) {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        }

        let found = false;
        if (!found && geojsonResult.routes && geojsonResult.routes[0] && geojsonResult.routes[0].summary) {
            const s = geojsonResult.routes[0].summary;
            const rawDist = tryNumber(s.distance);
            const rawDur = tryNumber(s.duration);
            if (rawDist !== null) { distance = (rawDist / 1000).toFixed(2) + ' km'; found = true; }
            if (rawDur !== null) { duration = Math.round(rawDur / 60) + ' min'; found = true; }
        }

        if (!found && Array.isArray(geojsonResult.features) && geojsonResult.features.length > 0) {
            const props = geojsonResult.features[0].properties || {};
            if (props.summary) {
                const rawDist = tryNumber(props.summary.distance || props.summary.distance_in_meters || props.summary.distance_m);
                const rawDur = tryNumber(props.summary.duration || props.summary.duration_in_seconds || props.summary.duration_s);
                if (rawDist !== null) { distance = (rawDist / 1000).toFixed(2) + ' km'; found = true; }
                if (rawDur !== null) { duration = Math.round(rawDur / 60) + ' min'; found = true; }
            }

            if (!found && props.segments && Array.isArray(props.segments) && props.segments.length > 0) {
                const seg = props.segments[0];
                const rawDist = tryNumber(seg.distance || seg.summary && seg.summary.distance);
                const rawDur = tryNumber(seg.duration || seg.summary && seg.summary.duration);
                if (rawDist !== null) { distance = (rawDist / 1000).toFixed(2) + ' km'; found = true; }
                if (rawDur !== null) { duration = Math.round(rawDur / 60) + ' min'; found = true; }

                if (Array.isArray(seg.steps)) {
                    stepsArray = seg.steps;
                }
            }
        }

        if (!found) {
            try {
                const walk = (obj) => {
                    if (!obj || typeof obj !== 'object') return null;
                    if (obj.distance && obj.duration) return { distance: tryNumber(obj.distance), duration: tryNumber(obj.duration) };
                    for (const k of Object.keys(obj)) {
                        const v = obj[k];
                        if (v && typeof v === 'object') {
                            const r = walk(v);
                            if (r) return r;
                        }
                    }
                    return null;
                };
                const r = walk(geojsonResult);
                if (r) {
                    if (r.distance !== null) { distance = (r.distance / 1000).toFixed(2) + ' km'; found = true; }
                    if (r.duration !== null) { duration = Math.round(r.duration / 60) + ' min'; found = true; }
                }
            } catch (e) {
                console.debug('[ROUTE] recursive summary search failed', e);
            }
        }

        console.debug('[ROUTE] summary extraction result:', { distance, duration, found });
        
        if ((!found || distance === 'N/A' || duration === 'N/A') && mapExtract) {
            if (!found && mapExtract.distance) distance = mapExtract.distance;
            if (!found && mapExtract.duration) duration = mapExtract.duration;
        }
        
        updateRouteInfo(distance, duration);

        let extraHTML = '';
        try {
            let steps = stepsArray;
            if (!steps) {
                if (geojsonResult.routes && geojsonResult.routes[0] && geojsonResult.routes[0].segments && geojsonResult.routes[0].segments[0] && Array.isArray(geojsonResult.routes[0].segments[0].steps)) {
                    steps = geojsonResult.routes[0].segments[0].steps;
                } else if (Array.isArray(geojsonResult.features) && geojsonResult.features[0] && geojsonResult.features[0].properties && geojsonResult.features[0].properties.segments && Array.isArray(geojsonResult.features[0].properties.segments) && Array.isArray(geojsonResult.features[0].properties.segments[0].steps)) {
                    steps = geojsonResult.features[0].properties.segments[0].steps;
                }
            }

            if (Array.isArray(steps) && steps.length > 0) {
                extraHTML = '<ol class="route-steps">' + steps.map(s => {
                    const instr = s.instruction || s.description || 'Passo';
                    const distm = tryNumber(s.distance) || 0;
                    return `<li>${instr} (${Math.round(distm)} m)</li>`;
                }).join('') + '</ol>';
            }
            
            if (optimizationData && optimizationData.enabled) {
                extraHTML = `
                    <div style="background: #e7f3ff; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #007bff;">
                        <strong>✨ Rota Otimizada</strong><br>
                        <small style="color: #004085; line-height: 1.6;">
                            ${optimizationData.reasoning || 'Rota ajustada considerando tráfego e clima.'}<br>
                            <span style="display: inline-block; margin-top: 5px;">
                                🌤️ ${optimizationData.weather || 'Clima: não disponível'}<br>
                                🚦 Tráfego: ${((optimizationData.traffic_factor || 1) * 100 - 100).toFixed(0)}% acima do normal
                            </span>
                        </small>
                    </div>
                ` + extraHTML;
            }
            
        } catch (err) {
            console.debug('[ROUTE_LOGIC] failed to build extra steps HTML', err);
            extraHTML = '';
        }

        try {
            showRouteDetails({ 
                distance, 
                duration, 
                infoText: `Distância: ${distance} • Duração: ${duration}`, 
                extraHTML, 
                state: 'medium' 
            });
        } catch (err) {
            console.error('[ROUTE_LOGIC] failed to show route details', err);
        }
        
        if (optimizationData && optimizationData.enabled) {
            showOptimizationStatus(
                `✅ Rota otimizada! ${optimizationData.reasoning ? optimizationData.reasoning.substring(0, 80) : 'Ajustes aplicados com sucesso.'}`,
                'success'
            );
        }

        console.log("[SUCCESS] GeoJSON recebido. Rota desenhada e UI atualizada.");
        showMessage(`Rota calculada! Distância: ${distance}, Duração: ${duration}`, 'success');

    } catch (error) {
        console.error('Erro no fetch da rota:', error);
        showMessage('Erro de conexão ao calcular a rota. Verifique a URL do Ngrok e o servidor Flask.', 'error');
        showOptimizationStatus('❌ Erro de conexão com o servidor', 'error');
    }
}

/**
 * Calcula rota a partir de coordenadas diretas (clique no mapa)
 */
export async function calculateAndDrawRoute(origin, destination) {
    clearRoute();
    showMessage('Calculando rota por coordenadas...', 'info');

    setOriginCoords(origin);
    setDestinationCoords(destination);
    
    await waitForMapReady();
    drawRouteMarkers();
    
    const constraints = getRouteConstraints();
    const hasConstraints = constraints.avoid.length > 0 || constraints.prefer.length > 0;
    
    if (hasConstraints) {
        showOptimizationStatus('🧠 Otimizando rota com suas preferências...', 'info');
    }
    
    await fetchRouteData(origin, destination, hasConstraints ? constraints : null);
}

window.drawRoute = calculateAndDrawRoute; 

/**
 * Aguarda o evento mapReady
 */
function waitForMapReady() {
    return import('./map_data.js').then(mod => {
        if (mod.getVectorSource()) return;
        return new Promise((resolve) => {
            document.addEventListener('mapReady', () => resolve(), { once: true });
        });
    });
}
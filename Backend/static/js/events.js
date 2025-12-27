// events.js (Código Corrigido para IDs do Header e Fluxo de Rota)
import { clearRoute } from './map_utils.js'; 
import { getCurrentOnceAndStartWatch, toggleFollow, centerMapOnCurrentPos, stopWatching } from './geolocation.js'; // 🚨 NOVO: stopWatching
import { showMessage } from './ui_utils.js';
import { getMapInstance, getCurrentPos, setOriginCoords, setDestinationCoords } from './map_data.js';
import { calculateRouteFromAddresses, calculateAndDrawRoute } from './route_logic.js'; // 🚨 NOVO: calculateRouteFromAddresses

let originCoord = null;
let destinationCoord = null;
    
window.addEventListener('load', () => { 
    // --- Elementos de UI ---
    const btnGPS = document.getElementById('locate-button'); 
    const btnFollow = document.getElementById('btn-follow');
    const btnCenter = document.getElementById('btn-center');
    const btnClear = document.getElementById('clear-button'); // 🚨 NOVO: Botão Limpar
    
    const btnGenerateRoute = document.getElementById('rota'); 
    const inputStart = document.getElementById('start');
    const inputEnd = document.getElementById('end');
    // Desativa o botão de gerar rota até que o mapa esteja pronto (evita chamadas antes de mapReady)
    if (btnGenerateRoute) btnGenerateRoute.disabled = true;
    
    // --- Listeners de Geolocalização ---
    if (btnGPS) {
        btnGPS.addEventListener('click', () => {
            // Se o GPS já tem posição, centraliza. Se não, inicia o rastreamento.
            if (getCurrentPos()) {
                centerMapOnCurrentPos();
                showMessage('Mapa centralizado na sua localização.', 'info');
            } else {
                showMessage('Iniciando rastreamento GPS...', 'info');
                // O parâmetro 'true' indica para centrar na primeira leitura
                getCurrentOnceAndStartWatch(true); 
            }
        });
    }
    
    if (btnFollow) {
         btnFollow.addEventListener('click', toggleFollow);
    }

    if (btnCenter) { 
         btnCenter.addEventListener('click', centerMapOnCurrentPos);
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            clearRoute(); // Função importada de map_utils
            stopWatching(); // Para o rastreamento GPS
            showMessage('Rota e GPS limpos.', 'info');
            // Limpa os campos de input, se necessário
            if (inputStart) inputStart.value = '';
            if (inputEnd) inputEnd.value = '';
        });
    }

    // --- Listener para o botão 'Gerar Rota' (ID: 'rota') ---
    if (btnGenerateRoute) {
        btnGenerateRoute.addEventListener('click', async () => {
            const startValue = inputStart.value.trim();
            const endValue = inputEnd.value.trim();
            
            if (!endValue) {
                showMessage('Por favor, insira um endereço de DESTINO.', 'error');
                return;
            }

            let originValue;
            if (startValue.toLowerCase() === 'gps' || startValue === '') {
                // Se a origem é vazia, tenta usar o GPS
                const currentPos = getCurrentPos();
                if (currentPos) {
                    originValue = 'GPS';
                } else {
                    showMessage('Origem GPS não disponível. Por favor, insira o endereço de origem.', 'error');
                    return;
                }
            } else {
                originValue = startValue;
            }
            
            // Chama a nova função de lógica de rota que faz Geocoding e ORS
            await calculateRouteFromAddresses(originValue, endValue);
        });
    }

    // --- Listener de clique no mapa para Rota (Click-to-Route) ---
    // Ativa o listener apenas quando o mapa estiver pronto
    document.addEventListener('mapReady', () => {
        const map = getMapInstance();
        
        // Habilita os botões de rota/limpar agora que o mapa e a fonte estão prontos
        if (btnGenerateRoute) btnGenerateRoute.disabled = false;
        const btnClearLocal = document.getElementById('clear-button');
        if (btnClearLocal) btnClearLocal.disabled = false;

        if (map) {
            const mapClickHandler = function(event) {
                const lonLat = ol.proj.toLonLat(event.coordinate);
                const lon = lonLat[0];
                const lat = lonLat[1];
                const clickCoord = { lon: lon, lat: lat };

                if (originCoord === null) {
                    // 1. Primeiro clique: Define Origem
                    originCoord = clickCoord;
                    showMessage(`📍 Origem por clique: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, 'info');
                    // Opcional: Pré-preencher o campo de origem com as coordenadas
                    if (inputStart) inputStart.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`; 
                    
                } else {
                    // 2. Segundo clique: Define Destino e Processa Rota
                    destinationCoord = clickCoord;
                    showMessage(`🏁 Destino por clique: ${lat.toFixed(4)}, ${lon.toFixed(4)}. Processando...`, 'info');
                    
                    // Opcional: Pré-preencher o campo de destino com as coordenadas
                    if (inputEnd) inputEnd.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`; 

                    clearRoute(); // Limpa marcadores e rotas antigas
                    
                    // Usa a função que aceita COORDENADAS (calculateAndDrawRoute, que é o window.drawRoute)
                    if (window.drawRoute) { 
                        window.drawRoute(originCoord, destinationCoord)
                            .then(() => { originCoord = null; destinationCoord = null; }) // Reseta para o próximo ciclo
                            .catch(error => {
                                console.error('Erro rota por clique:', error);
                                originCoord = null; 
                                destinationCoord = null;
                            });
                    } else {
                        showMessage('Erro: drawRoute (calculateAndDrawRoute) não carregado.', 'error');
                        originCoord = null; 
                        destinationCoord = null;
                    }
                }
            };

            // Salva a referência para possível remoção futura (não usado, mas boa prática)
            window.mapClickRef = mapClickHandler;
            map.on('click', mapClickHandler); 
            console.log("✅ Listener de clique no mapa ativado.");

        } else {
            console.error("❌ Erro Crítico: mapReady disparou, mas a instância do mapa é null.");
        }
    });
});
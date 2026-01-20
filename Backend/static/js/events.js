// events.js (Código Corrigido para IDs do Header e Fluxo de Rota)
import { clearRoute } from './map_utils.js'; 
import { getCurrentOnceAndStartWatch, toggleFollow, centerMapOnCurrentPos, stopWatching } from './geolocation.js'; // 🚨 NOVO: stopWatching
import { showMessage } from './ui_utils.js';
import { getMapInstance, getCurrentPos, setOriginCoords, setDestinationCoords } from './map_data.js';
import { calculateRouteFromAddresses, calculateAndDrawRoute } from './route_logic.js'; // 🚨 NOVO: calculateRouteFromAddresses

let originCoord = null;
let destinationCoord = null;
    
window.addEventListener('load', () => { 
    // 🔧 FUNÇÃO HELPER: Pega elemento mobile OU desktop
    function getElement(mobileId, desktopId) {
        const mobile = document.getElementById(mobileId);
        const desktop = document.getElementById(desktopId);
        return mobile || desktop; // Retorna o que estiver visível
    }
    
    // 🔧 FUNÇÃO HELPER: Adiciona listener em ambas as versões
    function addDualListener(mobileId, desktopId, event, handler) {
        const mobile = document.getElementById(mobileId);
        const desktop = document.getElementById(desktopId);
        
        if (mobile) mobile.addEventListener(event, handler);
        if (desktop) desktop.addEventListener(event, handler);
    }
    
    // --- Elementos de UI (agora suporta ambas versões) ---
    addDualListener('locate-button', 'locate-button-desktop', 'click', () => {
        if (getCurrentPos()) {
            centerMapOnCurrentPos();
            showMessage('Mapa centralizado na sua localização.', 'info');
        } else {
            showMessage('Iniciando rastreamento GPS...', 'info');
            getCurrentOnceAndStartWatch(true); 
        }
    });
    
    addDualListener('btn-follow', 'btn-follow-desktop', 'click', toggleFollow);
    addDualListener('btn-center', 'btn-center-desktop', 'click', centerMapOnCurrentPos);
    
    addDualListener('clear-button', 'clear-button-desktop', 'click', () => {
        clearRoute();
        stopWatching();
        showMessage('Rota e GPS limpos.', 'info');
        
        // Limpa AMBOS os pares de inputs
        const startMobile = document.getElementById('start');
        const startDesktop = document.getElementById('start-desktop');
        const endMobile = document.getElementById('end');
        const endDesktop = document.getElementById('end-desktop');
        
        if (startMobile) startMobile.value = '';
        if (startDesktop) startDesktop.value = '';
        if (endMobile) endMobile.value = '';
        if (endDesktop) endDesktop.value = '';
    });
    
    // Botão Gerar Rota
    addDualListener('rota', 'rota-desktop', 'click', async () => {
        const inputStart = document.getElementById('start') || document.getElementById('start-desktop');
        const inputEnd = document.getElementById('end') || document.getElementById('end-desktop');
        
        const startValue = inputStart.value.trim();
        const endValue = inputEnd.value.trim();
        
        if (!endValue) {
            showMessage('Por favor, insira um endereço de DESTINO.', 'error');
            return;
        }

        let originValue;
        if (startValue.toLowerCase() === 'gps' || startValue === '') {
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
        
        await calculateRouteFromAddresses(originValue, endValue);
    });

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
// 🆕 SISTEMA DE TABS MOBILE
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        
        // Remove active de todos
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        // Ativa o clicado
        btn.classList.add('active');
        document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
});

// 🆕 SINCRONIZA BOTÕES DUPLICADOS (desktop/mobile)
function syncButtons() {
    const pairs = [
        ['btn-center', 'btn-center-desktop'],
        ['btn-follow', 'btn-follow-desktop'],
        ['start', 'start-desktop'],
        ['end', 'end-desktop'],
        ['rota', 'rota-desktop']
    ];
    
    pairs.forEach(([mobileId, desktopId]) => {
        const mobile = document.getElementById(mobileId);
        const desktop = document.getElementById(desktopId);
        
        if (mobile && desktop) {
            // Sincroniza eventos de clique
            mobile.addEventListener('click', (e) => {
                desktop.click();
            });
            desktop.addEventListener('click', (e) => {
                if (e.target === desktop) { // Evita loop infinito
                    mobile.click();
                }
            });
            
            // Sincroniza valores de input
            if (mobile.tagName === 'INPUT') {
                mobile.addEventListener('input', () => {
                    desktop.value = mobile.value;
                });
                desktop.addEventListener('input', () => {
                    mobile.value = desktop.value;
                });
            }
        }
    });
}

syncButtons();
});
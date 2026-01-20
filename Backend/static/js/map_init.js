// static/js/map_init.js - Inicialização do mapa OpenLayers e configuração inicial.
import { 
    setMapInstance, 
    setVectorSource,
    setVectorLayer,
    getMapInstance
} from './map_data.js';
import { setApiBaseUrl } from './map_data.js';
import { disableFollowOnMapDrag } from './geolocation.js'; 
import { initAuth } from './auth.js';



function initializeMap() {
    initAuth();
    console.log("[INIT] Inicializando mapa OpenLayers...");

    // 1. Cria a fonte de vetor (para marcadores e rota)
    const vectorSource = new ol.source.Vector({
        features: [], // Começa vazio
    });
    
    // 2. Cria a camada de vetor (para exibir a fonte)
    const vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: new ol.style.Style({}) // Estilo padrão vazio
    });

    // 3. Cria a instância do mapa
    const map = new ol.Map({
        target: 'map', // ID do elemento HTML
        layers: [
            // Camada base (OpenStreetMap)
            new ol.layer.Tile({
                source: new ol.source.OSM()
            }),
            vectorLayer // Camada de vetores (para rota/marcadores)
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([-46.633309, -23.55052]), // São Paulo
            zoom: 10
        })
    });
    const zoomControl = new ol.control.Zoom({
        className: 'ol-zoom ol-zoom-custom',
        zoomInLabel: '+',
        zoomOutLabel: '\u2212' // caractere '−'
    });

    // Adiciona o controle ao mapa
    map.addControl(zoomControl);

    // --- Adiciona controle de botões de Zoom customizado (Top-left) ---
    // Cria um controle DOM com dois botões (+ / -) e adiciona ao mapa.
    /*function createZoomButtonsControl() {
        const container = document.createElement('div');
        container.className = 'custom-zoom-buttons ol-unselectable ol-control';

        const btnIn = document.createElement('button');
        btnIn.type = 'button';
        btnIn.className = 'zoom-in-btn';
        btnIn.title = 'Zoom In';
        btnIn.innerHTML = '+';

        const btnOut = document.createElement('button');
        btnOut.type = 'button';
        btnOut.className = 'zoom-out-btn';
        btnOut.title = 'Zoom Out';
        btnOut.innerHTML = '\u2212'; // sinal menos

        container.appendChild(btnIn);
        container.appendChild(btnOut);

        const control = new ol.control.Control({ element: container });
        return { control, btnIn, btnOut };
    }*/

    // 🚨 CRÍTICO: CORREÇÃO DO RACE CONDITION
    // O mapa precisa ser totalmente carregado para evitar o erro.
    map.once('rendercomplete', () => {
        // 4. Salvar instâncias no módulo de dados após a inicialização
        setMapInstance(map);
        setVectorSource(vectorSource);
        setVectorLayer(vectorLayer);
        
        // 5. REMOVIDO: Lógica de Ngrok

        // 🚨 NOVO: Listener para desativar o modo 'seguir' quando o usuário arrasta o mapa
        map.on('pointerdrag', () => {
            disableFollowOnMapDrag();
        });

        // 6. Avisa outros módulos que a instância do mapa está pronta para uso (events.js usa isso)
        console.log("[INIT] Sistema frontend pronto e estável com OpenLayers.");
            // Define a URL base da API no cliente: prefira a URL injetada pelo Flask (ngrok),
            // se não houver, usa `location.origin` como fallback (localhost).
            const injected = window.__NGROK_URL || null;
            const apiUrl = injected && injected !== 'None' ? injected : window.location.origin;
            setApiBaseUrl(apiUrl);

            /*try {
                const zoomButtons = createZoomButtonsControl();
                map.addControl(zoomButtons.control);
                zoomButtons.btnIn.addEventListener('click', () => {
                    const view = map.getView();
                    view.setZoom(view.getZoom() + 1);
                });
                zoomButtons.btnOut.addEventListener('click', () => {
                    const view = map.getView();
                    view.setZoom(view.getZoom() - 1);
                });
            } catch (e) {
                console.warn('[INIT] Falha ao adicionar botões customizados de zoom:', e);
            }*/

            document.dispatchEvent(new CustomEvent('mapReady'));
    });

    // Tratamento de Erros (opcional, mas bom)
    map.getLayers().getArray().forEach(layer => {
        if (layer instanceof ol.layer.Tile) {
            const source = layer.getSource();
            if (source.on) {
                source.on('tileloaderror', (e) => {
                    console.error("[OL ERROR] Erro ao carregar o Tile:", e);
                });
            }
        }
    });
}

// Inicia a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initializeMap);

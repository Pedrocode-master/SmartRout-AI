// bottom_sheet.js
// Lógica para controle da folha inferior (bottom sheet)
import { disableMapInteractions, enableMapInteractions } from './map_ui_utils.js'; // Importa funções de controle do mapa

document.addEventListener('DOMContentLoaded', () => {
    console.debug('[BOTTOM_SHEET] DOMContentLoaded - initializing bottom sheet');
    const bottomSheet = document.getElementById('sheet'); 
    const handle = bottomSheet ? bottomSheet.querySelector('.handle') : null;
    const toggleButton = document.getElementById('toggleBtn');
    const closeButton = document.getElementById('bottom-sheet-close');

    // --- Variáveis de Controle ---
    let startY = 0;
    let sheetTop = 0; // Posição Y atual do sheet (topo da folha)
    let isDragging = false;

    // Obtém os offsets definidos no CSS (usados para snaps) de forma robusta
    function readCssVar(name) {
        try {
            return getComputedStyle(document.documentElement).getPropertyValue(name) || '';
        } catch (e) {
            return '';
        }
    }

    function toPixels(raw) {
        if (!raw) return NaN;
        const s = String(raw).trim();
        // Se for em 'vh'
        if (s.endsWith('vh')) {
            const n = parseFloat(s.slice(0, -2));
            if (Number.isFinite(n)) return window.innerHeight - (n / 100) * window.innerHeight;
        }
        // Se for em 'px'
        if (s.endsWith('px')) {
            const n = parseFloat(s.slice(0, -2));
            if (Number.isFinite(n)) return window.innerHeight - n;
        }
        // Tentar apenas número (consideramos como vh se between 0-100)
        const num = parseFloat(s);
        if (Number.isFinite(num)) {
            if (num > 0 && num <= 100) return window.innerHeight - (num / 100) * window.innerHeight;
            return window.innerHeight - num;
        }
        return NaN;
    }

    const rawExpanded = readCssVar('--sheet-offset-expanded');
    const rawMedium = readCssVar('--sheet-offset-medium');
    const rawMin = readCssVar('--sheet-offset-min');

    const TMP_PIXEL_EXPANDED = toPixels(rawExpanded);
    const TMP_PIXEL_MEDIUM = toPixels(rawMedium);
    const TMP_PIXEL_MIN = toPixels(rawMin);
    // Fallbacks caso as variáveis CSS não estejam definidas ou parsing falhe
    const DEFAULT_EXPANDED = Math.round(window.innerHeight * 0.1); // 10% from top
    const DEFAULT_MEDIUM = Math.round(window.innerHeight * 0.5);
    const DEFAULT_MIN = Math.round(window.innerHeight * 0.85);

    const FINAL_PIXEL_EXPANDED = Number.isFinite(TMP_PIXEL_EXPANDED) ? TMP_PIXEL_EXPANDED : DEFAULT_EXPANDED;
    const FINAL_PIXEL_MEDIUM = Number.isFinite(TMP_PIXEL_MEDIUM) ? TMP_PIXEL_MEDIUM : DEFAULT_MEDIUM;
    const FINAL_PIXEL_MIN = Number.isFinite(TMP_PIXEL_MIN) ? TMP_PIXEL_MIN : DEFAULT_MIN;

    // 🚨 Checagem de segurança
    if (!bottomSheet || !handle) {
        console.error("Erro Crítico: Elementos 'sheet' ou '.handle' não encontrados no DOM.");
        return;
    }
    
    // Converte os offsets de 'calc(100vh - X)' para valores de pixel na tela
    function getOffsetInPixels(vh) {
        return window.innerHeight - (vh / 100) * window.innerHeight;
    }
    
    // Legacy variables kept for compatibility in rest of the file
    const PIXEL_EXPANDED = FINAL_PIXEL_EXPANDED; // Como o CSS usa VH, precisamos das posições Y da tela
    const PIXEL_MEDIUM = FINAL_PIXEL_MEDIUM;
    const PIXEL_MIN = FINAL_PIXEL_MIN;

    // Posição inicial do sheet (onde ele está parado - 70px)
    sheetTop = PIXEL_MIN;

    // --- Funções de Estado ---

    function setSheetState(state) {
        // Remove todas as classes de estado e transição
        bottomSheet.classList.remove('expanded', 'medium', 'sheet-transition-off');
        enableMapInteractions(); // Padrão: interações ativas

        if (state === 'expanded') {
            bottomSheet.classList.add('expanded');
            sheetTop = PIXEL_EXPANDED;
            if (toggleButton) toggleButton.textContent = 'Fechar Detalhes';
            disableMapInteractions(); // Desativa no estado expandido
        } else if (state === 'medium') {
            bottomSheet.classList.add('medium');
            sheetTop = PIXEL_MEDIUM;
            if (toggleButton) toggleButton.textContent = 'Detalhes';
        } else { // 'min' (estado padrão)
            // sheetTop é PIXEL_MIN por padrão
            if (toggleButton) toggleButton.textContent = 'Detalhes';
        }
        
        const posText = Number.isFinite(sheetTop) ? sheetTop.toFixed(2) : 'NaN';
        console.log(`[BOTTOM_SHEET] Novo estado: ${state}. Posição Y: ${posText}`);
    }

    // --- Lógica de Arrastar (Drag) ---

    function startDrag(e) {
        try {
            isDragging = true;
            // Obter a posição Y inicial do toque/mouse
            startY = e.touches ? e.touches[0].clientY : e.clientY;

            // Desliga a transição CSS para o movimento ser suave
            bottomSheet.classList.add('sheet-transition-off');

            // Remove as classes de estado, o estado será definido no 'endDrag'
            bottomSheet.classList.remove('expanded', 'medium');

            // Obtém a posição Y atual da folha antes de começar a arrastar
            const computedStart = getComputedStyle(bottomSheet).transform;
            if (computedStart && computedStart !== 'none') {
                try {
                    const transformMatrix = new WebKitCSSMatrix(computedStart);
                    sheetTop = Number.isFinite(transformMatrix.m42) ? transformMatrix.m42 : PIXEL_MIN; // m42 é translateY
                } catch (err) {
                    sheetTop = PIXEL_MIN;
                }
            } else {
                sheetTop = PIXEL_MIN;
            }

            const posText = Number.isFinite(sheetTop) ? sheetTop.toFixed(2) : 'NaN';
            console.log(`[DRAG] Início do arrasto. Posição inicial Y: ${posText}`);
        } catch (err) {
            console.error('[BOTTOM_SHEET] error in startDrag', err);
            isDragging = false;
        }
    }

    function onDrag(e) {
        try {
            if (!isDragging) return;

            const currentY = e.touches ? e.touches[0].clientY : e.clientY;
            const deltaY = currentY - startY; // Movimento vertical (positivo = para baixo)

            // Calcula a nova posição, limitando o topo ao PIXEL_EXPANDED (ou 0, já que 90vh é 10% do topo)
            let newSheetTop = sheetTop + deltaY;

            // Garante que a folha não suba acima do estado expandido
            newSheetTop = Math.max(newSheetTop, PIXEL_EXPANDED);

            // Aplica a nova posição imediatamente sem transição
            bottomSheet.style.transform = `translateY(${newSheetTop}px)`;
            console.debug('[BOTTOM_SHEET] onDrag', { startY, currentY, deltaY, newSheetTop });
        } catch (err) {
            console.error('[BOTTOM_SHEET] error in onDrag', err);
        }
    }

    function endDrag(e) {
        try {
            if (!isDragging) return;
            isDragging = false;

            // Reativa a transição CSS
            bottomSheet.classList.remove('sheet-transition-off');
            bottomSheet.style.transform = ''; // Limpa o estilo em linha para que o CSS de classe assuma

            // Calcula a posição Y final do topo da folha
            const finalY = (e.changedTouches ? e.changedTouches[0].clientY : e.clientY);

            // Movimento total (para calcular a velocidade do snap)
            const totalMovement = finalY - startY;

            // Obtém a posição Y final exata (após o arrasto)
            const computedEnd = getComputedStyle(bottomSheet).transform;
            let currentSheetY = sheetTop;
            if (computedEnd && computedEnd !== 'none') {
                try {
                    const transformMatrix = new WebKitCSSMatrix(computedEnd);
                    currentSheetY = Number.isFinite(transformMatrix.m42) ? transformMatrix.m42 : sheetTop;
                } catch (err) {
                    currentSheetY = sheetTop;
                }
            }

            // --- Lógica de Snap (Para qual estado ir?) ---
            let newState = 'min'; // Padrão: estado minimizado

            // O ponto de 'meio' entre Expanded e Medium
            const snapPoint1 = (PIXEL_EXPANDED + PIXEL_MEDIUM) / 2;
            // O ponto de 'meio' entre Medium e Min
            const snapPoint2 = (PIXEL_MEDIUM + PIXEL_MIN) / 2;

            if (currentSheetY < snapPoint1) {
                // Está mais perto do Expanded
                newState = 'expanded';
            } else if (currentSheetY < snapPoint2) {
                // Está entre Expanded/Medium e Medium/Min, mais perto de Medium
                newState = 'medium';
            } else {
                // Está mais perto de Min
                newState = 'min';
            }

            // Aplica o snap para o estado mais próximo
            setSheetState(newState);
            console.log(`[DRAG] Fim do arrasto. Snap para: ${newState}`, { totalMovement, currentSheetY, snapPoint1, snapPoint2 });
        } catch (err) {
            console.error('[BOTTOM_SHEET] error in endDrag', err);
        }
    }

    // --- Inicialização de Listeners ---
    
    // 1. Listeners de Arrastar (usando o handle)
    // Mobile
    // Use passive listeners where we don't call preventDefault to avoid scroll jank warnings
    handle.addEventListener('touchstart', startDrag, { passive: true });
    document.addEventListener('touchmove', onDrag, { passive: true });
    document.addEventListener('touchend', endDrag, { passive: true });
    
    // Desktop (para testes)
    handle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);


    // 2. Listener do Botão de Alternar (Toggle Button)
    if (toggleButton) {
        toggleButton.style.display = 'block';

        toggleButton.addEventListener('click', () => {
            const isExpanded = bottomSheet.classList.contains('expanded');
            
            if (isExpanded) {
                // FECHAR: Vai para o estado 'min'
                setSheetState('min');
            } else {
                // ABRIR: Vai para o estado 'expanded'
                setSheetState('expanded');
            }
        });
    }

    // 3. Listener do Botão de Fechar
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            // FECHAR: Vai para o estado 'min'
            setSheetState('min');
        });
    }

    // 4. Abrir o sheet quando receber evento com detalhes da rota
    document.addEventListener('showRouteDetails', (ev) => {
        // Evita erro se não houver payload
        const state = ev && ev.detail && ev.detail.state ? ev.detail.state : 'medium';
        // Atualiza o conteúdo se houver dados
        if (ev && ev.detail && ev.detail.distance) {
            const distEl = document.getElementById('route-distance');
            const durEl = document.getElementById('route-duration');
            const infoEl = document.getElementById('sheet-info');
            const extraEl = document.getElementById('route-extra');
            if (distEl) distEl.textContent = ev.detail.distance;
            if (durEl) durEl.textContent = ev.detail.duration;
            if (infoEl && ev.detail.infoText) infoEl.textContent = ev.detail.infoText;
            if (extraEl && ev.detail.extraHTML) extraEl.innerHTML = ev.detail.extraHTML;
        }
        // Garante que o botão de toggle esteja visível
        if (toggleButton) toggleButton.style.display = 'block';
        setSheetState(state);
    });
});

// Localização: seu_projeto_gps/static/js/bottom_sheet.js
// Lógica do Bottom Sheet (Snaps, Drag, Toggle)
// =======================================================

// =======================================================
// VARIÁVEIS GLOBAIS
// =======================================================
const sheet = document.getElementById('sheet');
const handle = sheet ? sheet.querySelector('.handle') : null;
const toggleBtn = document.getElementById('toggleBtn');
const sheetInfo = document.getElementById('sheet-info'); // sheetInfo declarado aqui
let dragging = false;
let startY = null;
let startMax = null;
let currentSnap = 'closed'; 

// Variáveis para os Snap Points (serão definidas em setupBottomSheet)
let SNAP_MIN, SNAP_MID, SNAP_FULL, SNAP_CLOSED; 

// =======================================================
// FUNÇÃO DE CONFIGURAÇÃO (Chamada ao carregar a janela)
// =======================================================

function setupBottomSheet() {
    // 1. Define os Snap Points baseados na altura atual da janela
    SNAP_MIN = 70; // Altura mínima (peek)
    SNAP_MID = window.innerHeight * 0.5; // Meio da tela: 50% VH
    SNAP_FULL = window.innerHeight; // Tela cheia: 100% VH
    SNAP_CLOSED = 0; // Fechado (0px)

    // 2. Inicializa o sheet no estado fechado
    // Isso garante que a altura é definida corretamente na inicialização
    openSheet(SNAP_CLOSED); 
}


/**
 * Abre o sheet para um ponto de snap específico e atualiza o estado.
 * @param {number} maxHeightValue - O valor (em px) de SNAP_MIN, SNAP_MID, SNAP_FULL, ou SNAP_CLOSED.
 */
// ATENÇÃO: Declarado no objeto window para ser acessível globalmente (ex: por route_logic.js)
window.openSheet = function(maxHeightValue) {
    if (!sheet) return;

    const mh = `${Math.round(maxHeightValue)}px`;
    sheet.style.maxHeight = mh;

    // Atualiza o estado
    if (maxHeightValue === SNAP_CLOSED) {
        currentSnap = 'closed';
        if (toggleBtn) {
            toggleBtn.style.display = 'block';
            toggleBtn.textContent = 'Detalhes';
        }
        sheet.setAttribute('aria-hidden', 'true');
    } else {
        // Assume que os snaps points estão definidos
        if (typeof SNAP_MID === 'undefined') setupBottomSheet(); 

        currentSnap = maxHeightValue === SNAP_FULL ? 'full' : (maxHeightValue === SNAP_MID ? 'mid' : 'min');
        if (toggleBtn) {
            toggleBtn.style.display = 'none';
        }
        sheet.setAttribute('aria-hidden', 'false');
    }

    // ⚠️ CRUCIAL: Chama map.updateSize() para redesenhar o OpenLayers.
    // O setTimeout garante que o navegador finalize a animação/redimensionamento.
    // Note que "map" é definido em map_init.js
    if (typeof map !== 'undefined' && typeof map.updateSize === 'function') {
        setTimeout(() => { map.updateSize(); }, 300);
    }
}


/**
 * Preenche o bottom sheet com os detalhes da rota (Distância/Duração) e o abre.
 */
// ATENÇÃO: Declarado no objeto window para ser acessível globalmente (ex: por route_logic.js)
window.updateSheetContent = function(distance, duration, origemText, destinoText) {
    if (!sheetInfo) return; // Garante que sheetInfo existe

    sheetInfo.innerHTML = `
        <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
            <p style="font-size: 1.2em; font-weight: bold; color: #333; margin: 5px 0;">
                Distância: <span>${distance}</span>
            </p>
            <p style="font-size: 1.2em; font-weight: bold; color: #007bff; margin: 5px 0;">
                Tempo Estimado: <span>${duration}</span>
            </p>
        </div>
        <p><strong>De:</strong> ${origemText}</p>
        <p><strong>Para:</strong> ${destinoText}</p>
    `;

    openSheet(SNAP_MID); 
}


// =======================================================
// EVENTOS DE INTERAÇÃO (DRAG/TOGGLE)
// =======================================================

// Chamada de inicialização após o carregamento da janela
window.addEventListener('load', setupBottomSheet);

// Atualiza snaps points se a janela for redimensionada (para manter 50% VH)
window.addEventListener('resize', () => {
    // Recalcula snaps points na hora
    SNAP_MID = window.innerHeight * 0.5; 
    SNAP_FULL = window.innerHeight;
    
    // Se o sheet estiver aberto em MID ou FULL, ajusta a altura
    const currentHeight = parseFloat(getComputedStyle(sheet).maxHeight) || 0;
    
    // Tenta reposicionar o sheet para o snap point mais próximo
    if (currentSnap === 'mid' && Math.abs(currentHeight - SNAP_MID) > 5) {
        openSheet(SNAP_MID);
    } else if (currentSnap === 'full' && Math.abs(currentHeight - SNAP_FULL) > 5) {
        openSheet(SNAP_FULL);
    }

    // 🔴 CRÍTICO: Garante que map.updateSize() só é chamado se 'map' for definido
    if (typeof map !== 'undefined' && typeof map.updateSize === 'function') {
        map.updateSize();
    }
});


// ======== DRAG (Touch/Mouse) ========
if (handle && sheet) {
  const startEvents = ['mousedown', 'touchstart'];
  const moveEvents = ['mousemove', 'touchmove'];
  const endEvents = ['mouseup', 'touchend'];

  const getClientY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

  const handleStart = (e) => {
    if(e.touches) e.preventDefault(); 
    
    dragging = true;
    startY = getClientY(e);
    startMax = parseFloat(getComputedStyle(sheet).maxHeight) || 0;
    
    sheet.classList.add('sheet-transition-off'); 
    
    // Assume que disableMapInteractions é global (definido em map_init.js)
    if (typeof disableMapInteractions === 'function') disableMapInteractions(); 
  };

  const handleMove = (e) => {
    if (!dragging) return;
    if(e.touches) e.preventDefault(); 

    const y = getClientY(e);
    const dy = startY - y;
    
    // Limita o arrasto entre o mínimo (0) e o máximo (SNAP_FULL)
    // O SNAP_FULL precisa ser definido no setup.
    if (typeof SNAP_FULL === 'undefined') setupBottomSheet();
    
    const newMax = Math.min(SNAP_FULL, Math.max(0, startMax + dy));

    sheet.style.maxHeight = `${newMax}px`;
  };

  const handleEnd = () => {
    if (!dragging) return;
    dragging = false;

    sheet.classList.remove('sheet-transition-off');

    // Assume que enableMapInteractions é global
    if (typeof enableMapInteractions === 'function') enableMapInteractions();

    const cur = parseFloat(getComputedStyle(sheet).maxHeight) || 0;

    // ==== Sistema de SNAP ====
    // Se arrastar para baixo mais de 30% do mínimo
    if (cur < SNAP_MIN * 0.7) { 
      openSheet(SNAP_CLOSED); 
      return;
    }
    
    // Encontra o Snap Point mais próximo
    let targetSnap = SNAP_MIN;
    if (Math.abs(cur - SNAP_FULL) < Math.abs(cur - SNAP_MID) && Math.abs(cur - SNAP_FULL) < Math.abs(cur - SNAP_MIN)) {
        targetSnap = SNAP_FULL;
    } else if (Math.abs(cur - SNAP_MID) < Math.abs(cur - SNAP_MIN)) {
        targetSnap = SNAP_MID;
    }
    
    openSheet(targetSnap);
  };

  startEvents.forEach(event => handle.addEventListener(event, handleStart, { passive: false }));
  moveEvents.forEach(event => document.addEventListener(event, handleMove, { passive: false }));
  endEvents.forEach(event => document.addEventListener(event, handleEnd));
}

// ======== TOGGLE BUTTON ========
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        if (currentSnap === 'closed') {
            openSheet(SNAP_MIN); // Abre para o estado MÍNIMO (peek)
        } else {
            openSheet(SNAP_CLOSED); // Se estiver aberto, fecha.
        }
    });
}

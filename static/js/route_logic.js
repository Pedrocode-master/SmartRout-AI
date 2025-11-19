// static/js/route_logic.js
// Funções para geocodificação e desenho de rotas

// Depende das variáveis globais e funções de map_init.js e bottom_sheet.js

// 🚨 REUTILIZAÇÃO: 'rotatual' já foi declarado com 'let' em map_init.js. Não declare novamente.

// 🚨 COMPARTILHADO: Usando 'var' para variáveis de estado global compartilhadas para evitar SyntaxError.
var is_drawing_route = false;

/* remove rota atual se existir */
// 🚨 Global: Usando window. para escopo global
window.remove_route = function() {
  // map e rotatual são globais (declarados em map_init.js)
  if (rotatual) {
    try {
      map.removeLayer(rotatual);
    } catch (e) {
      console.warn('Erro ao remover layer:', e);
    }
    rotatual = null;
  }
}

/* geocode via Nominatim (OpenStreetMap) */
// ATENÇÃO: Declarado no objeto window para ser acessível globalmente por events.js
window.geocode = async function(endereco) {
  if (!endereco || endereco.trim() === '') throw new Error('endereço vazio');
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data || data.length === 0) {
    throw new Error(`Endereço "${endereco}" não encontrado`);
  }
  // Retorna {lat, lon}
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), raw: data[0] };
}

/**
 * Chama o backend /rota e desenha a rota no mapa.
 * Agora coleta Distância e Duração do Flask.
 */
// ATENÇÃO: Declarado no objeto window para ser acessível globalmente por events.js
window.drawRoute = async function(origemCoord, destinoCoord, origemText = 'Posição Atual', destinoText = 'Ponto Clicado') {
    // is_drawing_route é global (declarado com var acima)
    if (is_drawing_route) {
        console.warn('Desenho de rota anterior em progresso. Ignorando novo pedido rápido.');
        return;
    }

    is_drawing_route = true; 
    // remove_route é global (declarado com window. acima)
    remove_route(); 

    try {
        // 🚨 1. Monta o payload JSON NO FORMATO ESPERADO PELO app.py
        const payload = { 
            origem: { lon: origemCoord[0], lat: origemCoord[1] }, 
            destino: { lon: destinoCoord[0], lat: destinoCoord[1] } 
        };

        const resp = await fetch('/rota', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!resp.ok) {
            let errorText = resp.statusText;
            try {
                const errorData = await resp.json();
                if (errorData.error) {
                    errorText = errorData.error;
                }
            } catch {}
            throw new Error(`Servidor Flask retornou erro (${resp.status}): ${errorText}`);
        }
        
        const data = await resp.json();
        
        if (data.error) {
            throw new Error('Erro ao gerar rota: ' + data.error);
        }

        // 2. DESENHAR ROTA (Usando o 'geojson' retornado pelo Flask/ORS)
        const rotaFeatures = new ol.format.GeoJSON().readFeatures(data.geojson, { 
            featureProjection: map.getView().getProjection() 
        });
        
        const rotaStyle = new ol.style.Style({
          stroke: new ol.style.Stroke({ color: 'blue', width: 4 })
        });
        
        const rotaLayer = new ol.layer.Vector({
            source: new ol.source.Vector({ features: rotaFeatures }),
            style: rotaStyle
        });
        rotatual = rotaLayer; // rotatual é global
        map.addLayer(rotatual);
        updateStatus('Rota adicionada ao mapa.');
        
        if (rotaFeatures.length > 0) {
            map.getView().fit(rotaFeatures[0].getGeometry(), { 
                padding: [100, 100, 100, 100], 
                duration: 1000 
            });
        }

        // 3. EXIBIR DADOS DA ROTA NO SHEET
        if (typeof updateSheetContent !== 'undefined') {
            updateSheetContent(
                data.distance || 'N/A', 
                data.duration || 'N/A', 
                origemText, 
                destinoText
            );
        } 

    } catch (e) {
        updateStatus('Falha ao calcular rota: ' + e.message);
        console.error(e);
        if (typeof openSheet !== 'undefined' && typeof SNAP_CLOSED !== 'undefined') {
            openSheet(SNAP_CLOSED);
        }
    } finally {
        is_drawing_route = false;
    }
}

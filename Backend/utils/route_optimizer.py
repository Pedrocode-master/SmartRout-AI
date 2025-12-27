# utils/route_optimizer.py


import logging
from typing import Dict, List, Optional, Tuple
from services.tomtom import TomTomService
from services.openweather import OpenWeatherService
from services.groq_llm import GroqLLMService

# ============================================================================
# NOVA DEPENDÊNCIA: geopy para cálculo de distâncias geodésicas
# Instalar com: pip install geopy
# ============================================================================
try:
    from geopy.distance import geodesic
except ImportError:
    raise ImportError(
        "geopy é necessário para amostragem adaptativa. "
        "Instale com: pip install geopy"
    )

logger = logging.getLogger(__name__)


class RouteOptimizer:
    """
    Orquestrador de otimização de rotas com amostragem adaptativa
    
    NOVIDADE v2.0: Reduz requisições de API em até 97% para rotas longas
    """
    
    # ========================================================================
    # NOVAS CONSTANTES: Configurações de amostragem adaptativa
    # ========================================================================
    URBAN_THRESHOLD_KM = 15      # Até 15km = rota urbana
    MEDIUM_THRESHOLD_KM = 100    # 15-100km = rota média
    
    URBAN_INTERVAL_KM = 0.8      # Urbano: amostra a cada 800m
    MEDIUM_INTERVAL_KM = 3.0     # Médio: amostra a cada 3km
    LONG_INTERVAL_KM = 15.0      # Longo: amostra a cada 15km
    
    MAX_SAMPLES = 25             # Trava de segurança: máximo 25 pontos
    
    def __init__(
        self, 
        tomtom_key: str,
        openweather_key: str,
        groq_key: str
    ):
        self.tomtom = TomTomService(tomtom_key)
        self.weather = OpenWeatherService(openweather_key)
        self.llm = GroqLLMService(groq_key)
        logger.info("RouteOptimizer v2.0 inicializado com amostragem adaptativa")
    
    def optimize_route(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        constraints: Optional[Dict] = None
    ) -> Optional[Dict]:
        """
        Pipeline completo de otimização de rota com amostragem adaptativa
        
        Args:
            origin: (lat, lon) origem
            destination: (lat, lon) destino
            constraints: Dict com {"avoid": [...], "prefer": [...]}
            
        Returns:
            Dict com rota otimizada + justificativa
            
        MODIFICAÇÕES v2.0:
        - Agora amostra múltiplos pontos da geometria (adaptativo)
        - Coleta tráfego em cada ponto amostrado
        - Clima otimizado (apenas origem + destino)
        - Logs detalhados de performance
        """
        if constraints is None:
            constraints = {"avoid": [], "prefer": ["fastest"]}
        
        logger.info(f"[v2.0] Otimizando rota: {origin} -> {destination}")
        logger.info(f"[v2.0] Constraints: {constraints}")
        
        # ====================================================================
        # ETAPA 1: Obter rotas alternativas do TomTom (INALTERADO)
        # ====================================================================
        tomtom_routes = self.tomtom.get_route_with_traffic(
            origin, 
            destination, 
            alternatives=2
        )
        
        if not tomtom_routes or not tomtom_routes.get("routes"):
            logger.error("[v2.0] TomTom não retornou rotas")
            return None
        
        logger.info(f"[v2.0] TomTom retornou {len(tomtom_routes['routes'])} rotas")
        
        # ====================================================================
        # ETAPA 2: Enriquecer rotas com AMOSTRAGEM ADAPTATIVA
        # ====================================================================
        candidates = []
        for idx, route in enumerate(tomtom_routes["routes"]):
            distance_km = route["distance_meters"] / 1000
            geometry = route.get("geometry", [])
            
            # ================================================================
            # VALIDAÇÃO: Verifica se geometria existe
            # ================================================================
            if not geometry or len(geometry) < 2:
                logger.warning(f"[v2.0] Rota {idx+1} sem geometria válida, usando apenas summary")
                # Fallback: usa dados do summary do TomTom
                base_time = route["travel_time_seconds"]
                traffic_delay = route.get("traffic_delay_seconds", 0)
                traffic_factor = 1.0 + (traffic_delay / base_time) if base_time > 0 else 1.0

            
                
                # Clima no ponto médio (fallback)
                mid_point = self._get_route_midpoint(origin, destination)
                weather_data = self.weather.get_weather(mid_point[0], mid_point[1])
                weather_factor = self.weather.calculate_weather_factor(weather_data)
                
                candidate = {
                    "id": idx + 1,
                    "distance_km": distance_km,
                    "duration_base_min": base_time / 60,
                    "traffic_factor": traffic_factor,
                    "weather_factor": weather_factor,
                    "toll_count": 0,
                    "unpaved_meters": 0,
                    "weather_description": self.weather.get_weather_description(weather_data),
                    "score_preliminary": base_time * traffic_factor * weather_factor
                }
                candidates.append(candidate)
                continue
            
            # ================================================================
            # NOVO: Amostragem adaptativa da geometria
            # ================================================================
            sampled_points = self._smart_sample_route(geometry, distance_km)
            logger.info(
                f"[v2.0] Rota {idx+1}: {distance_km:.1f}km -> "
                f"{len(sampled_points)} pontos amostrados (de {len(geometry)} totais) "
                f"[Redução: {100*(1-len(sampled_points)/len(geometry)):.0f}%]"
            )
            
            # ================================================================
            # NOVO: Coleta tráfego nos pontos amostrados
            # ================================================================
            traffic_factors = []
            for i, (lat, lon) in enumerate(sampled_points):
                try:
                    traffic = self.tomtom.get_traffic_flow(lat, lon)
                    if traffic:
                        factor = self.tomtom.calculate_traffic_factor(traffic)
                        traffic_factors.append(factor)
                        logger.debug(f"[v2.0] Ponto {i+1}/{len(sampled_points)}: fator tráfego = {factor:.2f}x")
                except Exception as e:
                    logger.warning(f"[v2.0] Erro ao coletar tráfego do ponto {i+1}: {e}")
                    continue
            
            # Calcula fator médio de tráfego
            if traffic_factors:
                avg_traffic_factor = sum(traffic_factors) / len(traffic_factors)
                logger.info(f"[v2.0] Rota {idx+1}: fator tráfego médio = {avg_traffic_factor:.2f}x")
            else:
                # Fallback: usa dados do summary do TomTom
                base_time = route["travel_time_seconds"]
                traffic_delay = route.get("traffic_delay_seconds", 0)
                avg_traffic_factor = 1.0 + (traffic_delay / base_time) if base_time > 0 else 1.0
                logger.warning(f"[v2.0] Rota {idx+1}: usando fator tráfego do summary = {avg_traffic_factor:.2f}x")
            
            # ================================================================
            # OTIMIZAÇÃO: Clima apenas na origem e destino (não em todos os pontos)
            # ANTES: Consultava clima no ponto médio (1 requisição)
            # DEPOIS: Consulta clima na origem e destino (2 requisições, mais preciso)
            # ================================================================
            try:
                weather_origin = self.weather.get_weather(sampled_points[0][0], sampled_points[0][1])
                weather_dest = self.weather.get_weather(sampled_points[-1][0], sampled_points[-1][1])
                
                weather_factor_origin = self.weather.calculate_weather_factor(weather_origin)
                weather_factor_dest = self.weather.calculate_weather_factor(weather_dest)
                avg_weather_factor = (weather_factor_origin + weather_factor_dest) / 2
                
                # Usa descrição da origem para exibição
                weather_description = self.weather.get_weather_description(weather_origin)
                
                logger.info(
                    f"[v2.0] Rota {idx+1}: clima origem={weather_factor_origin:.2f}x, "
                    f"destino={weather_factor_dest:.2f}x, média={avg_weather_factor:.2f}x"
                )
            except Exception as e:
                logger.warning(f"[v2.0] Erro ao coletar clima: {e}")
                avg_weather_factor = 1.0
                weather_description = "Clima desconhecido"
            
            # ================================================================
            # Monta candidato com dados coletados
            # ================================================================
            base_time_seconds = route["travel_time_seconds"]
            
            candidate = {
                "id": idx + 1,
                "distance_km": distance_km,
                "duration_base_min": base_time_seconds / 60,
                "traffic_factor": avg_traffic_factor,
                "weather_factor": avg_weather_factor,
                "toll_count": 1 if distance_km > 15 else 0,  # Simplificação (mock)
                "unpaved_meters": 0,
                "weather_description": weather_description,
                "score_preliminary": base_time_seconds * avg_traffic_factor * avg_weather_factor
            }
            
            candidates.append(candidate)
        
        if not candidates:
            logger.error("[v2.0] Nenhuma rota válida processada")
            return None
        
        logger.info(f"[v2.0] {len(candidates)} candidatas processadas com sucesso")
        
        # ====================================================================
        # ETAPA 3: Chamar LLM para análise inteligente (INALTERADO)
        # ====================================================================
        llm_result = self.llm.analyze_routes(constraints, candidates)
        
        if not llm_result:
            logger.warning("[v2.0] LLM falhou, usando fallback (menor score preliminar)")
            selected = min(candidates, key=lambda c: c["score_preliminary"])
            selected_id = selected["id"]
            reasoning = self.llm.explain_choice(selected, candidates, constraints)
        else:
            selected_id = llm_result["selected_candidate"]
            reasoning = llm_result["reasoning"]
            weights = llm_result.get("weights", {})
            
            # Aplica pesos do LLM aos candidatos
            for candidate in candidates:
                penalties = 0
                penalties += weights.get("toll", 0) * candidate["toll_count"]
                penalties += weights.get("unpaved", 0) * (candidate["unpaved_meters"] / 1000)
                
                candidate["score_final"] = (
                    candidate["score_preliminary"] + penalties
                )
            
            logger.info(f"[v2.0] LLM selecionou rota {selected_id}: {reasoning}")
        
        # ====================================================================
        # ETAPA 4: Recupera rota selecionada (INALTERADO)
        # ====================================================================
        selected_route = next((c for c in candidates if c["id"] == selected_id), candidates[0])
        original_tomtom_route = tomtom_routes["routes"][selected_id - 1]
        
        # ====================================================================
        # ETAPA 5: Monta resposta final (INALTERADO)
        # ====================================================================
        result = {
            "selected_route": {
                **selected_route,
                "geometry": original_tomtom_route.get("geometry", []),
                "duration_adjusted_min": selected_route.get("score_final", selected_route["score_preliminary"]) / 60
            },
            "alternatives": candidates,
            "reasoning": reasoning,
            "constraints_applied": constraints,
            "origin": {"lat": origin[0], "lon": origin[1]},
            "destination": {"lat": destination[0], "lon": destination[1]}
        }
        
        logger.info(f"[v2.0] Otimização concluída. Rota {selected_id} selecionada.")
        selected_geometry = original_tomtom_route.get("geometry", [])

        # 1. Gera os segmentos coloridos
        traffic_segments = self.tomtom.get_traffic_along_route(selected_geometry)
        
        # LOG DE DEBUG (Aparecerá no seu terminal Python)
        logger.info(f"[v2.0] Otimização finalizada. Segmentos de tráfego gerados: {len(traffic_segments)}")

        # 2. Monta o dicionário de resposta
        result = {
            "selected_route": {
                **selected_route,
                "geometry": selected_geometry,
                "traffic_segments": traffic_segments,
                "duration_adjusted_min": selected_route.get("score_final", selected_route["score_preliminary"]) / 60
            },
            "alternatives": candidates,
            "reasoning": reasoning
        }
        
        return result # Retorne apenas a variável result
    # ========================================================================
    # NOVOS MÉTODOS: Amostragem Adaptativa
    # ========================================================================
    
    def _smart_sample_route(
        self, 
        geometry: List[Dict], 
        distance_km: float
    ) -> List[Tuple[float, float]]:
        """
        Amostra pontos da rota de forma adaptativa baseado na distância total
        
        Args:
            geometry: Lista de dicts [{"latitude": ..., "longitude": ...}, ...]
            distance_km: Distância total da rota em km
            
        Returns:
            Lista de tuplas [(lat, lon), ...] amostradas inteligentemente
            
        Lógica:
        - Rota < 15km: amostra a cada 800m (precisão urbana)
        - Rota 15-100km: amostra a cada 3km (rotas médias)
        - Rota > 100km: amostra a cada 15km (rotas longas)
        - SEMPRE limita a 25 pontos máximo (hard cap)
        
        Exemplo:
        - Rota 5km: 5/0.8 = 6 pontos
        - Rota 50km: 50/3 = 16 pontos
        - Rota 500km: 500/15 = 33 -> cap em 25 pontos
        """
        # Converte geometria para lista de tuplas (lat, lon)
        try:
            points = [(p["lat"], p["lon"]) for p in geometry]
        except KeyError:
            logger.error("[v2.0] Geometria com formato inválido")
            return []
        
        if len(points) < 2:
            return points
        
        # Determina intervalo de amostragem baseado na distância
        interval_km = self._calculate_sampling_interval(distance_km)
        logger.debug(f"[v2.0] Distância {distance_km:.1f}km -> intervalo {interval_km:.1f}km")
        
        # Amostra pontos ao longo da rota
        sampled = [points[0]]  # Sempre inclui origem
        accumulated_distance = 0.0
        
        for i in range(1, len(points)):
            try:
                segment_distance = geodesic(points[i-1], points[i]).kilometers
                accumulated_distance += segment_distance
                
                # Se acumulou distância >= intervalo, adiciona ponto
                if accumulated_distance >= interval_km:
                    sampled.append(points[i])
                    accumulated_distance = 0.0  # Reset acumulador
            except Exception as e:
                logger.warning(f"[v2.0] Erro ao calcular distância do segmento {i}: {e}")
                continue
        
        # Sempre inclui destino (se não for o último já adicionado)
        if len(sampled) == 0 or sampled[-1] != points[-1]:
            sampled.append(points[-1])
        
        # Aplica cap de segurança (máximo 25 pontos)
        if len(sampled) > self.MAX_SAMPLES:
            logger.warning(
                f"[v2.0] Amostragem gerou {len(sampled)} pontos, "
                f"aplicando cap em {self.MAX_SAMPLES}"
            )
            # Seleciona 25 pontos uniformemente distribuídos
            step = len(sampled) / self.MAX_SAMPLES
            sampled = [sampled[int(i * step)] for i in range(self.MAX_SAMPLES)]
        
        return sampled
    
    def _calculate_sampling_interval(self, distance_km: float) -> float:
        """
        Calcula intervalo de amostragem baseado na distância total
        
        Args:
            distance_km: Distância total da rota
            
        Returns:
            Intervalo em km entre pontos amostrados
        """
        if distance_km < self.URBAN_THRESHOLD_KM:
            return self.URBAN_INTERVAL_KM
        elif distance_km < self.MEDIUM_THRESHOLD_KM:
            return self.MEDIUM_INTERVAL_KM
        else:
            return self.LONG_INTERVAL_KM
    
    # ========================================================================
    # MÉTODO ORIGINAL (INALTERADO)
    # ========================================================================
    
    def _normalize_geometry(self, geometry: List) -> List[Dict]:
        """
        Normaliza geometria de qualquer formato para formato padrão ORS/GeoJSON
        
        NOVA FUNÇÃO v2.1: Converte geometria do TomTom para formato esperado pelo app.py
        
        Args:
            geometry: Lista com coordenadas em qualquer formato
            
        Returns:
            Lista de dicts [{"lon": X, "lat": Y}, ...]
            
        Formatos de entrada aceitos:
        - [{"latitude": X, "longitude": Y}, ...]
        - [{"lat": X, "lon": Y}, ...]
        - [[lon, lat], ...]
        - [{"point": {"latitude": X, "longitude": Y}}, ...]
        
        Formato de saída (padrão ORS):
        - [{"lon": X, "lat": Y}, ...]
        """
        if not geometry:
            return []
        
        normalized = []
        
        for i, point in enumerate(geometry):
            lat, lon = None, None
            
            try:
                # FORMATO 1: {"latitude": X, "longitude": Y}
                if isinstance(point, dict) and "latitude" in point and "longitude" in point:
                    lat = float(point["latitude"])
                    lon = float(point["longitude"])
                
                # FORMATO 2: {"lat": X, "lon": Y} (já normalizado)
                elif isinstance(point, dict) and "lat" in point and "lon" in point:
                    lat = float(point["lat"])
                    lon = float(point["lon"])
                
                # FORMATO 3: [lon, lat] (array GeoJSON)
                elif isinstance(point, (list, tuple)) and len(point) >= 2:
                    lon = float(point[0])
                    lat = float(point[1])
                
                # FORMATO 4: {"point": {"latitude": X, "longitude": Y}} (nested)
                elif isinstance(point, dict) and "point" in point:
                    nested = point["point"]
                    if "latitude" in nested and "longitude" in nested:
                        lat = float(nested["latitude"])
                        lon = float(nested["longitude"])
                    elif "lat" in nested and "lon" in nested:
                        lat = float(nested["lat"])
                        lon = float(nested["lon"])
                
                # Adiciona no formato normalizado
                if lat is not None and lon is not None:
                    if -90 <= lat <= 90 and -180 <= lon <= 180:
                        normalized.append({"lon": lon, "lat": lat})
                    else:
                        logger.warning(f"[v2.1] Ponto {i} fora de range ao normalizar")
                else:
                    logger.warning(f"[v2.1] Ponto {i} não reconhecido ao normalizar")
                    
            except (ValueError, TypeError, KeyError) as e:
                logger.warning(f"[v2.1] Erro ao normalizar ponto {i}: {e}")
                continue
        
        logger.debug(f"[v2.1] Geometria normalizada: {len(normalized)}/{len(geometry)} pontos")
        return normalized

    def _get_route_midpoint(
        self, 
        origin: Tuple[float, float], 
        destination: Tuple[float, float]
    ) -> Tuple[float, float]:
        """
        Calcula ponto médio aproximado entre origem e destino
        
        NOTA: Este método agora é usado apenas como fallback quando geometria
        não está disponível. A versão otimizada usa amostragem da geometria real.
        """
        mid_lat = (origin[0] + destination[0]) / 2
        mid_lon = (origin[1] + destination[1]) / 2
        return (mid_lat, mid_lon)
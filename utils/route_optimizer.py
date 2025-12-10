# utils/route_optimizer.py
"""
Orquestrador principal: combina TomTom + OpenWeather + Groq LLM
para calcular e otimizar rotas baseado em constraints do usuário
"""
import logging
from typing import Dict, List, Optional, Tuple
from services.tomtom import TomTomService
from services.openweather import OpenWeatherService
from services.groq_llm import GroqLLMService

logger = logging.getLogger(__name__)


class RouteOptimizer:
    """Orquestrador de otimização de rotas"""
    
    def __init__(
        self, 
        tomtom_key: str,
        openweather_key: str,
        groq_key: str
    ):
        self.tomtom = TomTomService(tomtom_key)
        self.weather = OpenWeatherService(openweather_key)
        self.llm = GroqLLMService(groq_key)
    
    def optimize_route(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        constraints: Optional[Dict] = None
    ) -> Optional[Dict]:
        """
        Pipeline completo de otimização de rota
        
        Args:
            origin: (lat, lon) origem
            destination: (lat, lon) destino
            constraints: Dict com {"avoid": [...], "prefer": [...]}
            
        Returns:
            Dict com rota otimizada + justificativa
        """
        if constraints is None:
            constraints = {"avoid": [], "prefer": ["fastest"]}
        
        logger.info(f"Optimizing route from {origin} to {destination} with constraints: {constraints}")
        
        # 1. Obter rotas alternativas do TomTom com dados de tráfego
        tomtom_routes = self.tomtom.get_route_with_traffic(
            origin, 
            destination, 
            alternatives=2  # Pede 2 alternativas
        )
        
        if not tomtom_routes or not tomtom_routes.get("routes"):
            logger.error("TomTom returned no routes")
            return None
        
        # 2. Enriquecer cada rota com dados climáticos e calcular scores
        candidates = []
        for idx, route in enumerate(tomtom_routes["routes"]):
            # Amostra ponto médio da rota para clima
            mid_point = self._get_route_midpoint(origin, destination)
            weather_data = self.weather.get_weather(mid_point[0], mid_point[1])
            weather_factor = self.weather.calculate_weather_factor(weather_data)
            
            # Calcula fator de tráfego (já vem do TomTom summary)
            base_time = route["travel_time_seconds"]
            traffic_delay = route.get("traffic_delay_seconds", 0)
            traffic_factor = 1.0 + (traffic_delay / base_time) if base_time > 0 else 1.0
            
            # Simula detecção de pedágios/unpaved (na prática viriam de Overpass/OSM)
            # Para o MVP, assumimos valores mockados baseados no comprimento
            toll_count = 1 if route["distance_meters"] > 15000 else 0
            unpaved_meters = 0  # Simplificação: assume todas pavimentadas
            
            candidate = {
                "id": idx + 1,
                "distance_km": route["distance_meters"] / 1000,
                "duration_base_min": base_time / 60,
                "traffic_factor": traffic_factor,
                "weather_factor": weather_factor,
                "toll_count": toll_count,
                "unpaved_meters": unpaved_meters,
                "weather_description": self.weather.get_weather_description(weather_data),
                # Score preliminar (antes dos pesos do LLM)
                "score_preliminary": base_time * traffic_factor * weather_factor
            }
            
            candidates.append(candidate)
        
        logger.info(f"Enriched {len(candidates)} route candidates")
        
        # 3. Chamar LLM para análise inteligente
        llm_result = self.llm.analyze_routes(constraints, candidates)
        
        if not llm_result:
            # Fallback: escolhe rota com menor score preliminar
            logger.warning("LLM failed, using fallback selection")
            selected = min(candidates, key=lambda c: c["score_preliminary"])
            selected_id = selected["id"]
            reasoning = self.llm.explain_route_choice(selected, candidates, constraints)
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
        
        # 4. Recupera a rota selecionada
        selected_route = next((c for c in candidates if c["id"] == selected_id), candidates[0])
        original_tomtom_route = tomtom_routes["routes"][selected_id - 1]
        
        # 5. Monta resposta final
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
        
        logger.info(f"Route optimization complete. Selected route {selected_id}.")
        return result
    
    def _get_route_midpoint(
        self, 
        origin: Tuple[float, float], 
        destination: Tuple[float, float]
    ) -> Tuple[float, float]:
        """Calcula ponto médio aproximado entre origem e destino"""
        mid_lat = (origin[0] + destination[0]) / 2
        mid_lon = (origin[1] + destination[1]) / 2
        return (mid_lat, mid_lon)
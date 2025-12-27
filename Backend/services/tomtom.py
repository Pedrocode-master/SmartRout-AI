# services/tomtom.py
"""
✅ ATUALIZADO: Serviço de integração com TomTom Traffic API
Agora inclui: Traffic Flow + Traffic Incidents + Segmentação de rota por tráfego
"""
import requests
import logging
from typing import Dict, List, Optional, Tuple
from math import radians, sin, cos, sqrt, atan2

logger = logging.getLogger(__name__)


class TomTomService:
    """
    Cliente para TomTom APIs:
    - Traffic Flow (velocidade em tempo real)
    - Traffic Incidents (acidentes, obras, etc.)
    - Routing (cálculo de rotas)
    """
    
    BASE_URL = "https://api.tomtom.com"
    
    def __init__(self, api_key: str, use_bearer: bool = False):
        if not api_key:
            raise ValueError("TomTom API key é obrigatória")
        
        self.api_key = api_key
        self.session = requests.Session()
        self.headers = {}
        if use_bearer:
            self.headers['Authorization'] = f'Bearer {api_key}'
            
        logger.info("TomTomService inicializado com suporte a tráfego em tempo real")
    
    def _calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calcula distância entre dois pontos em metros (fórmula de Haversine)
        """
        R = 6371000  # Raio da Terra em metros
        
        phi1 = radians(lat1)
        phi2 = radians(lat2)
        delta_phi = radians(lat2 - lat1)
        delta_lambda = radians(lon2 - lon1)
        
        a = sin(delta_phi/2)**2 + cos(phi1) * cos(phi2) * sin(delta_lambda/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c
    
    def _sample_route_points(self, route_geometry: List[Dict], interval_meters: int = 500) -> List[Dict]:
        """
        Amostra pontos da rota a cada X metros
        
        Args:
            route_geometry: Lista de {"lat": float, "lon": float}
            interval_meters: Distância entre amostras
            
        Returns:
            Lista de pontos amostrados com índice original
        """
        if not route_geometry or len(route_geometry) < 2:
            return []
        
        sampled = [{"lat": route_geometry[0]["lat"], "lon": route_geometry[0]["lon"], "index": 0}]
        accumulated_distance = 0
        
        for i in range(1, len(route_geometry)):
            prev = route_geometry[i-1]
            curr = route_geometry[i]
            
            segment_distance = self._calculate_distance(
                prev["lat"], prev["lon"],
                curr["lat"], curr["lon"]
            )
            
            accumulated_distance += segment_distance
            
            # Adiciona ponto se ultrapassou o intervalo
            if accumulated_distance >= interval_meters:
                sampled.append({
                    "lat": curr["lat"],
                    "lon": curr["lon"],
                    "index": i
                })
                accumulated_distance = 0
        
        # Garante que o último ponto está incluso
        if sampled[-1]["index"] != len(route_geometry) - 1:
            last = route_geometry[-1]
            sampled.append({"lat": last["lat"], "lon": last["lon"], "index": len(route_geometry) - 1})
        
        return sampled
    
    def get_traffic_flow(self, lat: float, lon: float) -> Optional[Dict]:
        """
        Obtém dados de tráfego para uma coordenada específica
        (MANTIDO DO CÓDIGO ORIGINAL)
        """
        url = f"{self.BASE_URL}/traffic/services/4/flowSegmentData/absolute/10/json"
        params = {"point": f"{lat},{lon}", "unit": "KMPH"}
        
        if not self.headers.get('Authorization'):
            params["key"] = self.api_key
        
        try:
            response = self.session.get(url, params=params, headers=self.headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            flow_data = data.get("flowSegmentData", {})
            return {
                "current_speed": flow_data.get("currentSpeed", 0),
                "free_flow_speed": flow_data.get("freeFlowSpeed", 50),
                "current_travel_time": flow_data.get("currentTravelTime", 0),
                "free_flow_travel_time": flow_data.get("freeFlowTravelTime", 0),
                "confidence": flow_data.get("confidence", 0.5),
                "road_closure": flow_data.get("roadClosure", False)
            }
        except Exception as e:
            logger.warning(f"TomTom Traffic Flow error at ({lat}, {lon}): {e}")
            return None
    
    def get_traffic_along_route(self, route_geometry: List[Dict], sample_interval: int = 500) -> List[Dict]:
        """
        🆕 NOVO: Obtém dados de tráfego para toda a rota e divide em segmentos coloridos
        
        Args:
            route_geometry: Lista de {"lat": float, "lon": float}
            sample_interval: Distância entre amostras em metros
            
        Returns:
            Lista de segmentos com cores:
            [
                {
                    "start_lat": float,
                    "start_lon": float,
                    "end_lat": float,
                    "end_lon": float,
                    "speed_ratio": float (0-1),
                    "color": str (#FF0000, #FFFF00 ou #00FF00),
                    "status": str ("heavy", "moderate", "light")
                },
                ...
            ]
        """
        if not route_geometry or len(route_geometry) < 2:
            logger.warning("Geometria da rota inválida para análise de tráfego")
            return []
        
        # 1. Amostra pontos da rota
        sampled_points = self._sample_route_points(route_geometry, sample_interval)
        
        if len(sampled_points) < 2:
            logger.warning("Não foi possível amostrar pontos suficientes da rota")
            return []
        
        # 2. Consulta tráfego para cada ponto amostrado
        traffic_segments = []
        
        for i in range(len(sampled_points) - 1):
            start = sampled_points[i]
            end = sampled_points[i + 1]
            
            # Pega tráfego no ponto médio do segmento
            mid_lat = (start["lat"] + end["lat"]) / 2
            mid_lon = (start["lon"] + end["lon"]) / 2
            
            traffic_data = self.get_traffic_flow(mid_lat, mid_lon)
            
            if traffic_data:
                current = traffic_data['current_speed']
                free_flow = traffic_data['free_flow_speed']
                
                # Calcula ratio de velocidade (0 = parado, 1 = fluindo)
                if free_flow > 0:
                    speed_ratio = min(current / free_flow, 1.0)
                else:
                    speed_ratio = 0.5  # Fallback
                
                # Define cor e status baseado na velocidade
                if speed_ratio >= 0.7:
                    color = "#00FF00"  # Verde
                    status = "light"
                elif speed_ratio >= 0.4:
                    color = "#FFFF00"  # Amarelo
                    status = "moderate"
                else:
                    color = "#FF0000"  # Vermelho
                    status = "heavy"
                
                # Se estrada fechada, força vermelho
                if traffic_data.get('road_closure', False):
                    color = "#FF0000"
                    status = "closed"
                    speed_ratio = 0.0
            else:
                # Fallback: sem dados = assume normal
                speed_ratio = 1.0
                color = "#00FF00"
                status = "unknown"
            
            traffic_segments.append({
                "start_lat": start["lat"],
                "start_lon": start["lon"],
                "end_lat": end["lat"],
                "end_lon": end["lon"],
                "speed_ratio": speed_ratio,
                "color": color,
                "status": status
            })
        
        logger.info(f"Análise de tráfego completa: {len(traffic_segments)} segmentos processados")
        return traffic_segments
    
    def get_traffic_incidents(self, bbox: Tuple[float, float, float, float]) -> List[Dict]:
        """
        🆕 NOVO: Obtém incidentes de tráfego (acidentes, obras, etc.) em uma área
        
        Args:
            bbox: (min_lat, min_lon, max_lat, max_lon) - Bounding box da rota
            
        Returns:
            Lista de incidentes:
            [
                {
                    "type": str ("ACCIDENT", "CONSTRUCTION", "ROAD_CLOSURE", etc.),
                    "lat": float,
                    "lon": float,
                    "severity": str ("LOW", "MODERATE", "HIGH", "CRITICAL"),
                    "description": str,
                    "delay_seconds": int,
                    "icon": str (emoji ou código)
                },
                ...
            ]
        """
        min_lat, min_lon, max_lat, max_lon = bbox
        
        # TomTom Traffic Incidents API v5
        url = f"{self.BASE_URL}/traffic/services/5/incidentDetails"
        
        params = {
            "bbox": f"{min_lon},{min_lat},{max_lon},{max_lat}",
            "fields": "{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code,iconCategory}}}}",
            "language": "pt-BR",
            "categoryFilter": "0,1,2,3,4,5,6,7,8,9,10,11,14",  # Todos os tipos
            "timeValidityFilter": "present"
        }
        
        if not self.headers.get('Authorization'):
            params["key"] = self.api_key
        
        try:
            response = self.session.get(url, params=params, headers=self.headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            incidents = []
            
            for incident in data.get("incidents", []):
                try:
                    props = incident.get("properties", {})
                    geom = incident.get("geometry", {})
                    coords = geom.get("coordinates", [[0, 0]])[0]  # Primeiro ponto da geometria
                    
                    # Extrai primeiro evento (geralmente o mais relevante)
                    events = props.get("events", [{}])
                    main_event = events[0] if events else {}
                    
                    # Mapeia iconCategory para tipo legível
                    icon_category = props.get("iconCategory", 0)
                    incident_types = {
                        0: "UNKNOWN",
                        1: "ACCIDENT",
                        2: "FOG",
                        3: "DANGEROUS_CONDITIONS",
                        4: "RAIN",
                        5: "ICE",
                        6: "JAM",
                        7: "LANE_CLOSED",
                        8: "ROAD_CLOSED",
                        9: "ROAD_WORKS",
                        10: "WIND",
                        11: "FLOODING",
                        14: "BROKEN_DOWN_VEHICLE"
                    }
                    incident_type = incident_types.get(icon_category, "OTHER")
                    
                    # Mapeia magnitude de atraso para severidade
                    magnitude = props.get("magnitudeOfDelay", 0)
                    if magnitude == 0:
                        severity = "LOW"
                    elif magnitude == 1:
                        severity = "MODERATE"
                    elif magnitude == 2:
                        severity = "HIGH"
                    else:
                        severity = "CRITICAL"
                    
                    # Emojis para o mapa
                    incident_icons = {
                        "ACCIDENT": "🚗💥",
                        "ROAD_WORKS": "🚧",
                        "ROAD_CLOSED": "🚫",
                        "JAM": "🚦",
                        "FLOODING": "🌊",
                        "BROKEN_DOWN_VEHICLE": "🔧"
                    }
                    icon = incident_icons.get(incident_type, "⚠️")
                    
                    incidents.append({
                        "type": incident_type,
                        "lat": coords[1] if len(coords) > 1 else 0,
                        "lon": coords[0] if len(coords) > 0 else 0,
                        "severity": severity,
                        "description": main_event.get("description", "Incidente de trânsito"),
                        "delay_seconds": magnitude * 300,  # Estimativa: 0=0s, 1=5min, 2=10min, 3+=15min
                        "icon": icon
                    })
                except Exception as e:
                    logger.debug(f"Erro ao processar incidente individual: {e}")
                    continue
            
            logger.info(f"Incidentes de tráfego encontrados: {len(incidents)}")
            return incidents
            
        except Exception as e:
            logger.error(f"TomTom Traffic Incidents error: {e}")
            return []
    
    def get_route_with_traffic(self, origin: Tuple[float, float], destination: Tuple[float, float], alternatives: int = 2) -> Optional[Dict]:
        """
        Calcula rota(s) com dados de tráfego integrados e normaliza as chaves da geometria.
        """
        url = f"{self.BASE_URL}/routing/1/calculateRoute/{origin[0]},{origin[1]}:{destination[0]},{destination[1]}/json"
        params = {
            "traffic": "false",
            "routeType": "fastest",
            "travelMode": "car",
            "maxAlternatives": min(alternatives, 5),
            "computeBestOrder": "false"
        }
        
        if not self.headers.get('Authorization'):
            params["key"] = self.api_key
        
        try:
            response = self.session.get(url, params=params, headers=self.headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            routes = []
            for route in data.get("routes", []):
                summary = route.get("summary", {})
                
                # 🔧 CORREÇÃO: A API TomTom retorna "latitude" e "longitude".
                # O app.py espera "lat" e "lon". Fazemos a conversão aqui.
                raw_points = route.get("legs", [{}])[0].get("points", [])
                normalized_geometry = [
                    {"lat": p["latitude"], "lon": p["longitude"]} 
                    for p in raw_points
                ]
                
                routes.append({
                    "distance_meters": summary.get("lengthInMeters", 0),
                    "travel_time_seconds": summary.get("travelTimeInSeconds", 0),
                    "traffic_delay_seconds": summary.get("trafficDelayInSeconds", 0),
                    "traffic_length_meters": summary.get("trafficLengthInMeters", 0),
                    "departure_time": summary.get("departureTime", ""),
                    "arrival_time": summary.get("arrivalTime", ""),
                    "geometry": normalized_geometry  # Chaves agora compatíveis com app.py
                })
            
            return {"routes": routes, "count": len(routes)}
            
        except Exception as e:
            logger.error(f"TomTom routing error: {e}")
            return None
    
    def calculate_traffic_factor(self, traffic_data: Optional[Dict]) -> float:
        """
        Calcula fator multiplicador baseado em dados de tráfego
        (MANTIDO DO CÓDIGO ORIGINAL)
        """
        if not traffic_data:
            return 1.0
        
        current = traffic_data.get("current_speed", 50)
        free_flow = traffic_data.get("free_flow_speed", 50)
        
        if free_flow == 0 or current == 0:
            return 1.5
        
        ratio = current / free_flow
        
        if traffic_data.get("road_closure", False):
            return 3.0
        
        if ratio >= 0.9:
            return 1.0
        elif ratio >= 0.7:
            return 1.2
        elif ratio >= 0.5:
            return 1.5
        elif ratio >= 0.3:
            return 2.0
        else:
            return 2.5



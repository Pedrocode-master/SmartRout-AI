# utils/tier_manager.py
"""
Sistema de gerenciamento de tiers e limites de uso
Controla quantas requisições cada usuário pode fazer baseado no seu plano
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
from math import radians, sin, cos, sqrt, atan2

logger = logging.getLogger(__name__)


class TierManager:
    """
    Gerenciador central de tiers e limites de uso
    
    Responsabilidades:
    - Definir limites por tier (requisições, distância, features)
    - Validar se usuário pode fazer requisição
    - Incrementar contador de uso
    - Resetar contadores mensalmente
    - Fornecer estatísticas de uso
    """
    
    # ========================================================================
    # CONFIGURAÇÃO DE TIERS
    # ========================================================================
    TIER_CONFIGS = {
        "free": {
            "name": "Free",
            "max_requests_per_month": 5,
            "max_distance_km": 20,
            "features": {
                "traffic_optimization": False,
                "weather_optimization": False,
                "ai_recommendations": False,
                "alternative_routes": False,
                "traffic_incidents": False
            },
            "description": "Plano gratuito com limitações"
        },
        "pro": {
            "name": "Pro",
            "max_requests_per_month": 100,
            "max_distance_km": 200,
            "features": {
                "traffic_optimization": True,
                "weather_optimization": True,
                "ai_recommendations": True,
                "alternative_routes": True,
                "traffic_incidents": True
            },
            "description": "Plano profissional com otimizações avançadas"
        },
        "master": {
            "name": "Master",
            "max_requests_per_month": 500,
            "max_distance_km": None,  # Ilimitado
            "features": {
                "traffic_optimization": True,
                "weather_optimization": True,
                "ai_recommendations": True,
                "alternative_routes": True,
                "traffic_incidents": True
            },
            "description": "Plano master com uso extensivo"
        },
        "admin": {
            "name": "Admin",
            "max_requests_per_month": None,  # Ilimitado
            "max_distance_km": None,  # Ilimitado
            "features": {
                "traffic_optimization": True,
                "weather_optimization": True,
                "ai_recommendations": True,
                "alternative_routes": True,
                "traffic_incidents": True
            },
            "description": "Acesso administrativo sem limites"
        }
    }
    
    def __init__(self, db_session):
        """
        Inicializa o TierManager
        
        Args:
            db_session: Sessão do SQLAlchemy para acesso ao banco
        """
        self.db = db_session
        logger.info("TierManager inicializado")
    
    # ========================================================================
    # MÉTODOS PRINCIPAIS
    # ========================================================================
    
    def get_user_tier_config(self, user) -> Dict:
        """
        Retorna a configuração completa do tier do usuário
        
        Args:
            user: Objeto User do SQLAlchemy
            
        Returns:
            Dict com configurações do tier
            
        Exemplo:
        {
            "name": "Free",
            "max_requests_per_month": 5,
            "max_distance_km": 20,
            "features": {...}
        }
        """
        tier = user.tier if hasattr(user, 'tier') else 'free'
        
        # Valida se tier existe, fallback para free
        if tier not in self.TIER_CONFIGS:
            logger.warning(f"Tier inválido '{tier}' para user {user.username}, usando 'free'")
            tier = 'free'
        
        return self.TIER_CONFIGS[tier]
    
    def check_can_make_request(
        self, 
        user, 
        origin: Tuple[float, float], 
        destination: Tuple[float, float]
    ) -> Tuple[bool, Optional[str], Optional[Dict]]:
        """
        Valida se o usuário pode fazer a requisição
        
        Args:
            user: Objeto User do SQLAlchemy
            origin: (latitude, longitude) da origem
            destination: (latitude, longitude) do destino
            
        Returns:
            Tupla (can_proceed, error_message, usage_info)
            - can_proceed: bool - se pode continuar
            - error_message: str ou None - mensagem de erro se houver
            - usage_info: dict - estatísticas de uso atuais
            
        Exemplo de retorno (sucesso):
        (True, None, {"requests_used": 3, "requests_limit": 5, ...})
        
        Exemplo de retorno (falha):
        (False, "Limite de 5 requisições mensais atingido. Upgrade para Pro.", {...})
        """
        # 1. Reset mensal se necessário
        self._reset_counter_if_needed(user)
        
        # 2. Pega configuração do tier
        tier_config = self.get_user_tier_config(user)
        
        # 3. Pega estatísticas atuais
        usage_stats = self.get_usage_stats(user)
        
        # 4. Valida limite de requisições
        max_requests = tier_config['max_requests_per_month']
        if max_requests is not None:  # None = ilimitado
            if user.monthly_requests_count >= max_requests:
                error_msg = (
                    f"Limite de {max_requests} requisições mensais atingido. "
                    f"Upgrade para {self._suggest_upgrade(user.tier)} para continuar."
                )
                logger.warning(f"User {user.username} atingiu limite de requisições")
                return False, error_msg, usage_stats
        
        # 5. Calcula distância da rota
        distance_km = self._calculate_distance_km(origin, destination)
        
        # 6. Valida limite de distância
        max_distance = tier_config['max_distance_km']
        if max_distance is not None:  # None = ilimitado
            if distance_km > max_distance:
                error_msg = (
                    f"Distância de {distance_km:.1f}km excede o limite de {max_distance}km "
                    f"do plano {tier_config['name']}. "
                    f"Upgrade para {self._suggest_upgrade(user.tier)} para rotas maiores."
                )
                logger.warning(f"User {user.username} excedeu limite de distância: {distance_km:.1f}km")
                return False, error_msg, usage_stats
        
        # 7. Tudo OK - pode prosseguir
        logger.info(
            f"User {user.username} ({user.tier}) pode fazer requisição: "
            f"{user.monthly_requests_count + 1}/{max_requests or '∞'} req, "
            f"{distance_km:.1f}km"
        )
        return True, None, usage_stats
    
    def increment_usage(self, user) -> bool:
        """
        Incrementa o contador de requisições do usuário
        
        Args:
            user: Objeto User do SQLAlchemy
            
        Returns:
            bool - True se incrementou com sucesso, False se houve erro
        """
        try:
            user.monthly_requests_count += 1
            self.db.commit()
            logger.info(f"Contador incrementado para {user.username}: {user.monthly_requests_count}")
            return True
        except Exception as e:
            logger.error(f"Erro ao incrementar contador para {user.username}: {e}")
            self.db.rollback()
            return False
    
    def get_usage_stats(self, user) -> Dict:
        """
        Retorna estatísticas de uso do usuário
        
        Args:
            user: Objeto User do SQLAlchemy
            
        Returns:
            Dict com estatísticas completas
            
        Exemplo:
        {
            "tier": "free",
            "tier_name": "Free",
            "requests_used": 3,
            "requests_limit": 5,
            "requests_remaining": 2,
            "requests_unlimited": False,
            "reset_date": "2026-02-01T00:00:00Z",
            "days_until_reset": 25,
            "features": {...},
            "max_distance_km": 20,
            "distance_unlimited": False
        }
        """
        tier_config = self.get_user_tier_config(user)
        
        # Calcula data de reset (primeiro dia do próximo mês)
        today = datetime.now()
        if today.month == 12:
            reset_date = datetime(today.year + 1, 1, 1)
        else:
            reset_date = datetime(today.year, today.month + 1, 1)
        
        days_until_reset = (reset_date - today).days
        
        max_requests = tier_config['max_requests_per_month']
        is_unlimited = max_requests is None
        
        max_distance = tier_config['max_distance_km']
        distance_unlimited = max_distance is None
        
        return {
            "tier": user.tier if hasattr(user, 'tier') else 'free',
            "tier_name": tier_config['name'],
            "requests_used": user.monthly_requests_count,
            "requests_limit": max_requests if not is_unlimited else None,
            "requests_remaining": (
                max_requests - user.monthly_requests_count 
                if not is_unlimited 
                else None
            ),
            "requests_unlimited": is_unlimited,
            "reset_date": reset_date.isoformat(),
            "days_until_reset": days_until_reset,
            "features": tier_config['features'],
            "max_distance_km": max_distance,
            "distance_unlimited": distance_unlimited,
            "description": tier_config['description']
        }
    
    # ========================================================================
    # MÉTODOS AUXILIARES
    # ========================================================================
    
    def _reset_counter_if_needed(self, user) -> bool:
        """
        Reseta o contador se estamos em um novo mês
        
        Args:
            user: Objeto User do SQLAlchemy
            
        Returns:
            bool - True se resetou, False se não precisou
        """
        # Se não tem campo last_reset_date, assume que precisa resetar
        if not hasattr(user, 'last_reset_date') or user.last_reset_date is None:
            logger.info(f"Primeira vez do user {user.username}, inicializando contador")
            user.monthly_requests_count = 0
            user.last_reset_date = datetime.now()
            try:
                self.db.commit()
                return True
            except Exception as e:
                logger.error(f"Erro ao inicializar contador: {e}")
                self.db.rollback()
                return False
        
        # Verifica se estamos em um mês diferente
        today = datetime.now()
        last_reset = user.last_reset_date
        
        # Reset se ano diferente OU mês diferente
        if today.year > last_reset.year or (today.year == last_reset.year and today.month > last_reset.month):
            logger.info(f"Resetando contador mensal para {user.username}")
            user.monthly_requests_count = 0
            user.last_reset_date = today
            try:
                self.db.commit()
                return True
            except Exception as e:
                logger.error(f"Erro ao resetar contador: {e}")
                self.db.rollback()
                return False
        
        return False
    
    def _calculate_distance_km(
        self, 
        origin: Tuple[float, float], 
        destination: Tuple[float, float]
    ) -> float:
        """
        Calcula distância em linha reta entre dois pontos (Haversine)
        
        Args:
            origin: (latitude, longitude)
            destination: (latitude, longitude)
            
        Returns:
            float - distância em quilômetros
            
        Nota: Retorna distância em linha reta, não distância real da rota.
        É uma aproximação conservadora (rota real será >= essa distância)
        """
        lat1, lon1 = origin
        lat2, lon2 = destination
        
        # Raio da Terra em km
        R = 6371.0
        
        # Converte para radianos
        lat1_rad = radians(lat1)
        lon1_rad = radians(lon1)
        lat2_rad = radians(lat2)
        lon2_rad = radians(lon2)
        
        # Diferenças
        dlat = lat2_rad - lat1_rad
        dlon = lon2_rad - lon1_rad
        
        # Fórmula de Haversine
        a = sin(dlat / 2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2)**2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        
        distance = R * c
        
        return distance
    
    def _suggest_upgrade(self, current_tier: str) -> str:
        """
        Sugere o próximo tier para upgrade
        
        Args:
            current_tier: tier atual do usuário
            
        Returns:
            str - nome do tier sugerido
        """
        tier_hierarchy = ["free", "pro", "master", "admin"]
        
        try:
            current_index = tier_hierarchy.index(current_tier)
            if current_index < len(tier_hierarchy) - 1:
                next_tier = tier_hierarchy[current_index + 1]
                return self.TIER_CONFIGS[next_tier]['name']
            else:
                return "o plano atual"  # Já está no topo
        except ValueError:
            return "Pro"  # Fallback
    
    # ========================================================================
    # MÉTODOS ADMINISTRATIVOS
    # ========================================================================
    
    def upgrade_user_tier(self, user, new_tier: str) -> Tuple[bool, Optional[str]]:
        """
        Altera o tier de um usuário (para admins)
        
        Args:
            user: Objeto User do SQLAlchemy
            new_tier: novo tier ("free", "pro", "master", "admin")
            
        Returns:
            Tupla (success, error_message)
        """
        if new_tier not in self.TIER_CONFIGS:
            return False, f"Tier inválido: {new_tier}"
        
        old_tier = user.tier if hasattr(user, 'tier') else 'free'
        
        try:
            user.tier = new_tier
            # Reseta contador ao fazer upgrade
            user.monthly_requests_count = 0
            user.last_reset_date = datetime.now()
            self.db.commit()
            
            logger.info(f"User {user.username} tier alterado: {old_tier} → {new_tier}")
            return True, None
        except Exception as e:
            logger.error(f"Erro ao alterar tier: {e}")
            self.db.rollback()
            return False, str(e)
    
    def get_all_tiers_info(self) -> Dict:
        """
        Retorna informações de todos os tiers disponíveis
        Útil para página de pricing no frontend
        
        Returns:
            Dict com todos os tiers e suas features
        """
        return self.TIER_CONFIGS


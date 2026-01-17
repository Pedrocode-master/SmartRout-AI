import requests
import json
import logging
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import os
from dotenv import load_dotenv
from prometheus_flask_exporter import PrometheusMetrics
from utils.route_optimizer import RouteOptimizer
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import bcrypt
from datetime import timedelta
from flask_limiter import Limiter
from sqlalchemy import text
from flask_limiter.util import get_remote_address
from utils.tier_manager import TierManager
from functools import wraps
from db import db
from models import User, LoginHistory
from pathlib import Path

# ========================================================================
# CARREGAMENTO SEGURO DE VARIÁVEIS DE AMBIENTE
# ========================================================================
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)


# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========================================================================
# PROMETHEUS METRICS
# ========================================================================
metrics = PrometheusMetrics.for_app_factory()
metrics.info('app_info', 'Informações sobre o aplicativo de roteamento', version='2.0.0')

# ========================================================================
# VALIDAÇÃO DE CHAVES DE API
# ========================================================================
ORS_API_KEY = os.environ.get('ORS_API_KEY')
if not ORS_API_KEY:
    raise ValueError(
        "⚠️ ORS_API_KEY não encontrada!\n"
        "Configure com: export ORS_API_KEY='sua_chave' no ~/.bashrc ou no .env"
    )

# Chaves para otimização (opcional)
TOMTOM_API_KEY = os.environ.get('TOMTOM_API_KEY')
OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY')

optimization_available = all([TOMTOM_API_KEY, OPENWEATHER_API_KEY, GROQ_API_KEY])

if not optimization_available:
    logger.warning("⚠️ Chaves de otimização ausentes. Modo de otimização desabilitado.")
    logger.warning("   Para habilitar: configure TOMTOM_API_KEY, OPENWEATHER_API_KEY e GROQ_API_KEY no .env")
    route_optimizer = None
else:
    route_optimizer = RouteOptimizer(
        tomtom_key=TOMTOM_API_KEY,
        openweather_key=OPENWEATHER_API_KEY,
        groq_key=GROQ_API_KEY
    )
    logger.info("✅ RouteOptimizer inicializado com TomTom + OpenWeather + Groq")

# URLs do ORS
ORS_API_URL = "https://api.openrouteservice.org/v2/directions/driving-car"
ORS_USE_BEARER = os.environ.get('ORS_USE_BEARER', '0') == '1'

# ========================================================================
# CONFIGURAÇÃO DO FLASK
# ========================================================================
app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')


# CORS configurado com origens específicas
allowed_origins = os.environ.get('ALLOWED_ORIGINS', 'https://smartrout-ai.onrender.com,https://smartrout-ai-1.onrender.com').split(',')

CORS(
    app,
    resources={r"/*": {"origins": allowed_origins}},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
)

logger.info(f"🔐 CORS configurado para: {allowed_origins}")

metrics.init_app(app)

# Rate Limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# ========================================================================
# CONFIGURAÇÃO DO BANCO DE DADOS (Supabase PostgreSQL)
# ========================================================================
database_url = os.environ.get('DATABASE_URL')

if not database_url:
    logger.warning("⚠️ DATABASE_URL não encontrada! Usando SQLite local.")
    database_url = 'sqlite:///gps.db'
else:
    # Log para debug (esconde senha)
    safe_url = database_url.split('@')[0].split(':')[:-1]
    logger.info(f"🗄️ Banco de dados configurado: postgresql://...@{database_url.split('@')[1] if '@' in database_url else '???'}")
    
    # Corrige URL se vier com protocolo errado
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
        logger.info("✅ URL corrigida: postgres:// → postgresql://")
    
    # Remove +psycopg2 se existir (causa problemas no Render)
    if '+psycopg2' in database_url:
        database_url = database_url.replace('+psycopg2', '')
        logger.info("✅ Removido +psycopg2 da URL")

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
if 'supabase.com' in database_url:
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 280,        # Supabase timeout = 300s
        'pool_size': 5,             # Limite free tier
        'max_overflow': 10,
        'pool_timeout': 30,
        'connect_args': {
            'connect_timeout': 10,
            'application_name': 'smartrout-ai',
            'options': '-c statement_timeout=30000'
        }
    }
    logger.info("✅ Configurações Supabase aplicadas")
else:
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }

# JWT Secret Key - OBRIGATÓRIA
JWT_SECRET = os.environ.get('JWT_SECRET_KEY')
if not JWT_SECRET:
    raise ValueError(
        "⚠️ JWT_SECRET_KEY não encontrada!\n"
        "Configure com: export JWT_SECRET_KEY='sua_chave_secreta_aleatoria' no .env\n"
        "Gere uma chave com: python -c 'import secrets; print(secrets.token_hex(32))'"
    )

app.config['JWT_SECRET_KEY'] = JWT_SECRET
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)

db.init_app(app)
with app.app_context():
    try:
        db.create_all()
        logger.info("✅ Tabelas verificadas/criadas")
        
        # Cria admin se não existir
        from models import User
        admin = User.query.filter_by(username="admin").first()
        if not admin:
            admin = User(username="admin")
            admin.set_password("Admin@123456")
            admin.tier = "admin"
            admin.monthly_requests_count = 0
            db.session.add(admin)
            db.session.commit()
            logger.info("✅ Admin criado")
    except Exception as e:
        logger.warning(f"⚠️ Erro ao inicializar DB: {e}")
jwt = JWTManager(app)
tier_manager = TierManager(db.session)

# ========================================================================
# MODELOS DE BANCO DE DADOS
# ========================================================================
'''class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.LargeBinary, nullable=False)  # Armazena como bytes
    tier = db.Column(db.String(20), default='free', nullable=False)
    monthly_requests_count = db.Column(db.Integer, default=0, nullable=False)
    last_reset_date = db.Column(db.DateTime, default=db.func.now())
    created_at = db.Column(db.DateTime, default=db.func.now())
    
    def set_password(self, password):
        """Hash da senha com bcrypt"""
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    
    def check_password(self, password):
        """Verifica se a senha está correta"""
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash)

class LoginHistory(db.Model):
    __tablename__ = 'login_history'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token = db.Column(db.String(500), nullable=False)
    login_at = db.Column(db.DateTime, default=db.func.now())
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(200), nullable=True)
    
    # Relacionamento
    user = db.relationship('User', backref=db.backref('login_history', lazy=True))
'''
# ========================================================================
# FUNÇÕES AUXILIARES
# ========================================================================
def _get_traffic_color(traffic_factor: float) -> str:
    """Retorna a cor baseada no fator de tráfego."""
    if traffic_factor >= 2.0:
        return "#DC2626"  # Vermelho Escuro
    elif traffic_factor >= 1.5:
        return "#F59E0B"  # Laranja
    elif traffic_factor >= 1.2:
        return "#FBBF24"  # Amarelo
    else:
        return "#10B981"  # Verde

def _get_traffic_level(traffic_factor: float) -> str:
    """Retorna o nível textual do tráfego."""
    if traffic_factor >= 2.0:
        return "severe"
    elif traffic_factor >= 1.5:
        return "heavy"
    elif traffic_factor >= 1.2:
        return "moderate"
    else:
        return "free"

def _calculate_bbox(coordinates: list) -> list:
    """Calcula a caixa delimitadora da rota."""
    if not coordinates:
        return [0, 0, 0, 0]
    lons = [c[0] for c in coordinates]
    lats = [c[1] for c in coordinates]
    return [min(lons), min(lats), max(lons), max(lats)]

def validate_coordinates(coordinates):
    """Valida formato de coordenadas"""
    if not coordinates or not isinstance(coordinates, list) or len(coordinates) < 2:
        return False, "Coordenadas de rota ausentes ou incompletas."
    
    try:
        for pt in coordinates:
            if not (isinstance(pt, (list, tuple)) and len(pt) >= 2):
                return False, 'Formato de coordenada inválido'
            lon, lat = float(pt[0]), float(pt[1])
            # Validação de ranges
            if not (-180 <= lon <= 180) or not (-90 <= lat <= 90):
                return False, 'Coordenadas fora do range válido'
    except (ValueError, TypeError):
        return False, "Formato de coordenadas inválido. Use [[lon, lat], [lon, lat]]"
    
    return True, None

def validate_address(address):
    """Valida endereço de entrada"""
    if not address or not isinstance(address, str):
        return False, "Endereço inválido"
    
    # Limite de tamanho
    if len(address) > 500:
        return False, "Endereço muito longo (máximo 500 caracteres)"
    
    # Remove caracteres perigosos
    address_clean = address.strip()
    if len(address_clean) < 3:
        return False, "Endereço muito curto"
    
    return True, address_clean

# ========================================================================
# DECORADOR DE TIER LIMITS
# ========================================================================
def check_tier_limits(f):
    """
    Decorador que valida limites de tier antes de processar requisição
    Deve ser usado DEPOIS de @jwt_required()
    
    Uso:
    @app.route('/rota', methods=['POST'])
    @jwt_required()
    @check_tier_limits  # <-- vem depois do JWT
    def calcular_rota():
        ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from flask_jwt_extended import get_jwt_identity
        from flask import request, jsonify
        
        # 1. Pega usuário do JWT
        current_username = get_jwt_identity()
        user = User.query.filter_by(username=current_username).first()
        
        if not user:
            return jsonify({"erro": "Usuário não encontrado"}), 404
        
        # 2. Pega coordenadas da requisição
        data = request.get_json()
        if not data or 'coordinates' not in data:
            return jsonify({"erro": "Coordenadas ausentes"}), 400
        
        coordinates = data.get('coordinates')
        if not coordinates or len(coordinates) < 2:
            return jsonify({"erro": "Coordenadas inválidas"}), 400
        
        origin = (coordinates[0][1], coordinates[0][0])  # (lat, lon)
        destination = (coordinates[1][1], coordinates[1][0])
        
        # 3. Valida com TierManager
        can_proceed, error_msg, usage_stats = tier_manager.check_can_make_request(
            user, origin, destination
        )
        
        if not can_proceed:
            return jsonify({
                "erro": error_msg,
                "usage": usage_stats,
                "upgrade_required": True
            }), 403
        
        # 4. Executa a função original
        response = f(*args, **kwargs)
        
        # 5. Se deu certo, incrementa contador
        if isinstance(response, tuple):
            status_code = response[1] if len(response) > 1 else 200
        else:
            status_code = 200
        
        if 200 <= status_code < 300:
            tier_manager.increment_usage(user)
        
        return response
    
    return decorated_function

# ========================================================================
# ENDPOINTS - AUTENTICAÇÃO
# ========================================================================
@app.route('/api/register', methods=['POST'])
@limiter.limit("5 per hour")  # Limite agressivo para prevenir spam
def register():
    """Registra novo usuário"""
    data = request.json
    
    if not data:
        return jsonify({"erro": "Dados ausentes"}), 400
    
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    # Validações
    if not username or len(username) < 3:
        return jsonify({"erro": "Username deve ter pelo menos 3 caracteres"}), 400
    
    if len(username) > 80:
        return jsonify({"erro": "Username muito longo (máximo 80 caracteres)"}), 400
    
    if not password or len(password) < 8:
        return jsonify({"erro": "Senha deve ter pelo menos 8 caracteres"}), 400
    
    # Verifica se usuário já existe
    if User.query.filter_by(username=username).first():
        return jsonify({"erro": "Usuário já existe"}), 409
    
    try:
        # Cria novo usuário
        new_user = User(username=username)
        new_user.set_password(password)
        new_user.tier = 'free'  # ← AGORA SIM!
        new_user.monthly_requests_count = 0
        

        db.session.add(new_user)
        db.session.commit()
        
        logger.info(f"Novo usuário registrado: {username}")
        return jsonify({"mensagem": "Usuário criado com sucesso"}), 201
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao criar usuário: {e}")
        return jsonify({"erro": "Erro ao criar usuário"}), 500

@app.route('/api/create-first-admin', methods=['POST'])
def create_first_admin():
    """
    Cria o primeiro admin do sistema
    ⚠️ REMOVA ESTA ROTA DEPOIS DE CRIAR O ADMIN!
    """
    data = request.get_json()
    
    # Código secreto - MUDE PARA ALGO SEU!
    SECRET_CODE = "seu-codigo-secreto-xyz-789"
    
    if data.get('secret_code') != SECRET_CODE:
        return jsonify({"erro": "Código secreto inválido"}), 403
    
    # Verifica se já existe admin
    existing_admin = User.query.filter_by(tier='admin').first()
    if existing_admin:
        return jsonify({"erro": "Admin já existe no sistema!"}), 400
    
    username = data.get('username', 'admin')
    password = data.get('password', 'admin123')
    
    if len(password) < 8:
        return jsonify({"erro": "Senha deve ter pelo menos 8 caracteres"}), 400
    
    try:
        # Cria o admin usando o mesmo método do /api/register
        admin_user = User(username=username)
        admin_user.set_password(password)
        admin_user.tier = 'admin'  # Define como admin
        admin_user.monthly_requests_count = 0
        
        db.session.add(admin_user)
        db.session.commit()
        
        logger.info(f"✅ ADMIN CRIADO: {username}")
        
        return jsonify({
            "mensagem": "Admin criado com sucesso!",
            "username": username,
            "tier": "admin"
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Erro ao criar admin: {e}")
        return jsonify({"erro": f"Erro ao criar admin: {str(e)}"}), 500

@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per minute")  # Rate limit para prevenir brute force
def login():
    """Autentica usuário e retorna token JWT"""
    data = request.json
    
    if not data:
        return jsonify({"erro": "Dados ausentes"}), 400
    
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({"erro": "Username e senha são obrigatórios"}), 400
    
    user = User.query.filter_by(username=username).first()
    
    # Mensagem genérica para não revelar se o usuário existe
    if not user or not user.check_password(password):
        logger.warning(f"Tentativa de login falhou para: {username}")
        return jsonify({"erro": "Credenciais inválidas"}), 401
    
    access_token = create_access_token(identity=username)
    logger.info(f"Login bem-sucedido: {username}")
    
    try:
        login_record = LoginHistory(
            user_id=user.id,
            token=access_token,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent', '')[:200]
        )
        db.session.add(login_record)
        db.session.commit()
        logger.info(f"Login bem-sucedido: {username} (IP: {request.remote_addr})")
    except Exception as e:
        logger.error(f"Erro ao registrar histórico de login: {e}")

    return jsonify(access_token=access_token), 200
         
@app.route('/api/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Retorna informações do usuário autenticado"""
    current_user = get_jwt_identity()
    user = User.query.filter_by(username=current_user).first()
    
    if not user:
        return jsonify({"erro": "Usuário não encontrado"}), 404
    
    return jsonify({
        "username": user.username,
        "created_at": user.created_at.isoformat()
    }), 200


@app.route('/api/me/history', methods=['GET'])
@jwt_required()
def get_login_history():
    """Retorna histórico de logins do usuário autenticado"""
    current_user = get_jwt_identity()
    user = User.query.filter_by(username=current_user).first()
    
    if not user:
        return jsonify({"erro": "Usuário não encontrado"}), 404
    
    # Pega últimos 10 logins
    history = LoginHistory.query.filter_by(user_id=user.id)\
        .order_by(LoginHistory.login_at.desc())\
        .limit(10)\
        .all()
    
    return jsonify({
        "username": user.username,
        "total_logins": len(user.login_history),
        "recent_logins": [
            {
                "login_at": h.login_at.isoformat(),
                "ip_address": h.ip_address,
                "user_agent": h.user_agent[:50] + "..." if len(h.user_agent) > 50 else h.user_agent
            }
            for h in history
        ]
    }), 200

@app.route('/api/me/usage', methods=['GET'])
@jwt_required()
def get_usage_stats():
    """Retorna estatísticas de uso do tier do usuário"""
    current_user = get_jwt_identity()
    user = User.query.filter_by(username=current_user).first()
    
    if not user:
        return jsonify({"erro": "Usuário não encontrado"}), 404
    
    stats = tier_manager.get_usage_stats(user)
    return jsonify(stats), 200
# ========================================================================
# ENDPOINTS - ROTEAMENTO
# ========================================================================
@app.route('/rota', methods=['POST'])
@jwt_required()  # AGORA PROTEGIDA
@limiter.limit("30 per minute")  # Limite de requisições
@check_tier_limits 
def calcular_rota():
    """
    Endpoint de rota com otimização inteligente integrada + visualização de tráfego
    REQUER AUTENTICAÇÃO JWT
    """
    current_user = get_jwt_identity()
    logger.info(f"[ROTA] Usuário {current_user} solicitando rota...")
    user = User.query.filter_by(username=current_user).first()
    tier_config = tier_manager.get_user_tier_config(user)
    can_use_premium = tier_config['features']['traffic_optimization']

    logger.info(f"[ROTA] User tier: {user.tier}, Premium features: {can_use_premium}")

    data = request.get_json()
    if not data or not isinstance(data, dict):
        return jsonify({"erro": "Payload JSON inválido ou ausente"}), 400

    coordinates = data.get('coordinates')
    
    # Validação robusta
    is_valid, error_msg = validate_coordinates(coordinates)
    if not is_valid:
        return jsonify({"erro": error_msg}), 400

    constraints = data.get('constraints', None)
    origin = {"lat": coordinates[0][1], "lon": coordinates[0][0]}
    destination = {"lat": coordinates[1][1], "lon": coordinates[1][0]}

    logger.info(f"[ROTA] Coordenadas: {coordinates}")
    if constraints:
        logger.info(f"[ROTA] Constraints detectadas: {constraints}")

    # ========================================================================
    # DECISÃO: USAR OTIMIZAÇÃO (TOMTOM) OU ORS DIRETO?
    # ========================================================================
    use_optimization = (
        constraints and
        optimization_available and
        route_optimizer is not None and
        can_use_premium  # Verifica se o usuário pode usar otimização premium
    )

    if use_optimization:
        logger.info("[ROTA] Modo PREMIUM ativado (TomTom + Tráfego em Tempo Real)")
        try:
            optimization_result = route_optimizer.optimize_route(
                origin=(origin['lat'], origin['lon']),
                destination=(destination['lat'], destination['lon']),
                constraints=constraints
            )

            if not optimization_result:
                logger.warning("[ROTA] Otimização falhou, revertendo para ORS padrão")
                use_optimization = False
            else:
                selected = optimization_result.get('selected_route', {})
                reasoning = optimization_result.get('reasoning', '')
                geometry = selected.get('geometry', [])

                if not geometry or len(geometry) < 2:
                    logger.warning("[ROTA] Geometria inválida do TomTom, revertendo para ORS")
                    use_optimization = False
                else:
                    logger.info(f"[ROTA] Usando geometria do TomTom ({len(geometry)} pontos)")

                    coordinates_geojson = [[p["lon"], p["lat"]] for p in geometry]
                    distance_m = selected.get('distance_km', 0) * 1000
                    duration_s = selected.get('duration_adjusted_min', 0) * 60
                    traffic_factor = selected.get('traffic_factor', 1.0)
                    route_color = _get_traffic_color(traffic_factor)

                    traffic_segment_features = []
                    raw_segments = selected.get('traffic_segments', [])

                    for seg in raw_segments:
                        traffic_segment_features.append({
                            "type": "Feature",
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [
                                    [seg["start_lon"], seg["start_lat"]],
                                    [seg["end_lon"], seg["end_lat"]]
                                ]
                            },
                            "properties": {
                                "feature_type": "traffic_segment",
                                "color": seg.get("color", "#00FF00"),
                                "status": seg.get("status", "light"),
                                "speed_ratio": seg.get("speed_ratio", 1.0)
                            }
                        })

                    geojson_data = {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": coordinates_geojson
                                },
                                "properties": {
                                    "feature_type": "route_reference",
                                    "summary": {
                                        "distance": distance_m,
                                        "duration": duration_s
                                    },
                                    "segments": [{
                                        "distance": distance_m,
                                        "duration": duration_s,
                                        "steps": []
                                    }],
                                    "optimization": {
                                        "enabled": True,
                                        "source": "tomtom",
                                        "reasoning": reasoning,
                                        "weather": selected.get('weather_description', ''),
                                        "traffic_factor": traffic_factor,
                                        "weather_factor": selected.get('weather_factor', 1.0),
                                        "duration_base_min": selected.get('duration_base_min', 0),
                                        "duration_adjusted_min": selected.get('duration_adjusted_min', 0),
                                        "constraints_applied": constraints,
                                        "route_color": "rgba(0,0,0,0)" if traffic_segment_features else route_color,
                                        "traffic_level": _get_traffic_level(traffic_factor)
                                    }
                                }
                            },
                            *traffic_segment_features
                        ],
                        "bbox": _calculate_bbox(coordinates_geojson),
                        "metadata": {
                            "attribution": "TomTom",
                            "service": "routing",
                            "query": {
                                "coordinates": [[origin['lon'], origin['lat']], [destination['lon'], destination['lat']]],
                                "profile": "driving-car",
                                "format": "geojson"
                            }
                        }
                    }

                    logger.info(f"[ROTA] GeoJSON montado: rota base + {len(traffic_segment_features)} segmentos coloridos")
                    return jsonify(geojson_data)
                
        except Exception as e:
            logger.exception(f"[ROTA] Erro durante otimização: {e}")
            logger.warning("[ROTA] Revertendo para modo ORS padrão")
            use_optimization = False

    # ========================================================================
    # FALLBACK: Modo ORS padrão (sem otimização)
    # ========================================================================
    if not use_optimization:
        logger.info("[ROTA] Modo BÁSICO (ORS direto, sem otimização de tráfego)")

        ors_payload = {
            "coordinates": coordinates,
            "profile": "driving-car",
            "format": "geojson",
            "units": "m",
            "instructions": False
        }

        # Modo de teste
        if os.environ.get('DISABLE_ORS') == '1':
            logger.info('[ROTA] DISABLE_ORS=1 ativado – retornando GeoJSON falso')
            fake_geojson = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [coordinates[0], coordinates[1]]
                    },
                    "properties": {
                        "optimization": {"enabled": False, "source": "ors_fallback"}
                    }
                }],
            }
            return jsonify(fake_geojson)

        try:
            headers = {}
            if ORS_USE_BEARER:
                headers['Authorization'] = f"Bearer {ORS_API_KEY}"
            else:
                headers['Authorization'] = ORS_API_KEY
            headers['Content-Type'] = 'application/json'

            logger.info("[ROTA] Enviando payload ao ORS...")

            response = requests.post(
                f"{ORS_API_URL}/geojson",
                json=ors_payload,
                headers=headers,
                timeout=15
            )

            response.raise_for_status()
            geojson_data = response.json()

            if 'features' in geojson_data and len(geojson_data['features']) > 0:
                if 'properties' not in geojson_data['features'][0]:
                    geojson_data['features'][0]['properties'] = {}
                geojson_data['features'][0]['properties']['optimization'] = {
                    "enabled": False,
                    "source": "ors_fallback"
                }

            logger.info("[ROTA] Rota recebida com sucesso (modo básico).")
            return jsonify(geojson_data)

        except requests.exceptions.Timeout:
            logger.error("[ERRO] Timeout ao conectar com ORS")
            return jsonify({"erro": "Timeout na API de roteamento"}), 504

        except requests.exceptions.HTTPError as http_err:
            logger.error(f"[ERRO HTTP] {http_err}")
            try:
                error_detail = response.json()
            except:
                error_detail = {"message": str(http_err)}
            return jsonify({"erro": "Erro de API ORS", "detalhe": error_detail}), 502

        except Exception as e:
            logger.exception(f"[ERRO INTERNO] Falha ao processar rota: {e}")
            return jsonify({"erro": "Erro interno ao processar rota"}), 500

@app.route('/geocoding', methods=['POST'])
@jwt_required()  # AGORA PROTEGIDA
#@check_tier_limits # NÃO APLIQUE LIMITES AQUUI
@limiter.limit("20 per minute")
def geocode_address():
    """Converte um endereço (string) em coordenadas (lon, lat) usando o ORS Geocoding."""
    current_user = get_jwt_identity()
    data = request.get_json()
    
    if not data or not isinstance(data, dict):
        return jsonify({"erro": "Payload JSON inválido ou ausente"}), 400

    address = data.get('address')
    
    # Validação robusta
    is_valid, result = validate_address(address)
    if not is_valid:
        return jsonify({"erro": result}), 400
    
    address = result  # Endereço limpo

    logger.info(f"[GEOCODING ORS] Usuário {current_user} buscando: {address}")

    geocode_url = "https://api.openrouteservice.org/geocode/search"

    headers = {}
    if ORS_USE_BEARER:
        headers['Authorization'] = f"Bearer {ORS_API_KEY}"
    else:
        headers['Authorization'] = ORS_API_KEY
    headers['Accept'] = 'application/json'

    params = {
        'text': address,
        'boundary.country': 'BRA',
        'size': 1
    }

    try:
        response = requests.get(
            geocode_url, params=params, headers=headers, timeout=10
        )
        response.raise_for_status()
        result = response.json()

        features = result.get('features') if isinstance(result, dict) else None
        if features:
            coords = features[0].get('geometry', {}).get('coordinates', [])
            if len(coords) >= 2:
                lon, lat = coords[0], coords[1]
                logger.info(f"[GEOCODING ORS] Sucesso: {address} -> ({lat}, {lon})")
                return jsonify({"lon": lon, "lat": lat}), 200
            else:
                logger.warning(f"[GEOCODING ORS] Geometria inválida no resultado para: {address}")
                return jsonify({"erro": "Geometria inválida retornada pela API"}), 502
        else:
            logger.warning(f"[GEOCODING ORS] Endereço não encontrado: {address}")
            return jsonify({"erro": "Endereço não encontrado ou inválido"}), 404

    except requests.exceptions.Timeout:
        logger.error("[ERRO] Timeout ao conectar com ORS Geocoding")
        return jsonify({"erro": "Timeout na API de geocodificação"}), 504

    except requests.exceptions.HTTPError as http_err:
        logger.error(f"[ERRO HTTP GEO] {http_err}")
        try:
            error_detail = response.json()
        except:
            error_detail = {"message": str(http_err)}
        return jsonify({"erro": "Erro de API ORS Geocoding", "detalhe": error_detail}), 502

    except Exception as e:
        logger.exception(f"[ERRO INTERNO GEO] Falha ao geocodificar: {e}")
        return jsonify({"erro": "Erro interno de geocodificação"}), 500

# ========================================================================
# ENDPOINTS - HEALTH CHECK E MONITORAMENTO
# ========================================================================
@app.route('/health', methods=['GET'])
def health_check():
    """Health check para Kubernetes/Docker"""
    try:
        # Testa conexão com banco
        db.session.execute(text('SELECT 1'))
        db_status = "ok"
    except Exception as e:
        logger.error(f"Health check falhou no banco: {e}")
        db_status = "error"
    
    return jsonify({
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status,
        "optimization": "enabled" if optimization_available else "disabled"
    }), 200 if db_status == "ok" else 503

@app.route('/', methods=['GET'])
def index():
    ngrok_url = os.environ.get('NGROK_URL', None)
    try:
        return render_template('index.html', ngrok_url=ngrok_url)  # ← COLOQUE ISSO
    except Exception as e:
        logger.error(f"Erro ao servir index.html: {e}")
        return "Erro interno do servidor ao carregar a página.", 500
    #return jsonify({
    #    "name": "GPS Routing API",
    #    "version": "2.0.0",
    #    "endpoints": {
    #        "auth": {
    #            "register": "POST /api/register",
    #            "login": "POST /api/login",
    #            "me": "GET /api/me [requer token]"
    #        },
    #        "routing": {
     #           "route": "POST /rota [requer token]",
     #           "geocoding": "POST /geocoding [requer token]"
    #        },
    #        "monitoring": {
    #            "health": "GET /health",
    #            "metrics": "GET /metrics"
    #        }
    #    },
    #    "authentication": "JWT Bearer Token",
    #    "documentation": "https://github.com/seu-repo/gps-api"
    #}), 200

# ========================================================================
# TRATAMENTO DE ERROS GLOBAL
# ========================================================================
@app.errorhandler(404)
def not_found(error):
    return jsonify({"erro": "Endpoint não encontrado"}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Erro interno: {error}")
    return jsonify({"erro": "Erro interno do servidor"}), 500

@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({"erro": "Limite de requisições excedido. Tente novamente mais tarde."}), 429

# ========================================================================
# INICIALIZAÇÃO DO SERVIDOR
# ========================================================================
'''def init_admin():
    with app.app_context():
        try:
            admin = User.query.filter_by(username="admin").first()
            if not admin:
                admin = User(
                    username="admin",
                    tier="admin"
                )
                admin.set_password("admin123")
                db.session.add(admin)
                db.session.commit()
                logger.info("✅ Admin criado com sucesso")
            else:
                logger.info("ℹ️ Admin já existe, pulando criação")

        except Exception as e:
            db.session.rollback()
            logger.warning(f"⚠️ Erro ao criar admin: {e}")


# ⚠️ Inicializa o banco sempre, mesmo quando rodando com gunicorn
init_admin()'''

print("DATABASE_URL =", os.environ.get("DATABASE_URL"))

if __name__ == '__main__':
    # Configurações apenas para rodar localmente
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=port, debug=debug_mode)

    if debug_mode:
        logger.warning("⚠️ MODO DEBUG ATIVADO - NÃO USE EM PRODUÇÃO!")
    
    logger.info(f"📁 Carregando .env de: {env_path.absolute()}")
    logger.info(f"🔑 JWT_SECRET_KEY encontrada: {'Sim' if os.environ.get('JWT_SECRET_KEY') else 'NÃO'}")
    logger.info(f"🚀 Servidor iniciando na porta {port}")
    logger.info("📋 Endpoints disponíveis:")
    logger.info("   GET  /              - Informações da API")
    logger.info("   GET  /health        - Health check")
    logger.info("   POST /api/register  - Registro de usuários")
    logger.info("   POST /api/login     - Login e obtenção de token")
    logger.info("   GET  /api/me        - Informações do usuário autenticado")
    logger.info("   POST /geocoding     - Geocodificação de endereços [requer token]")
    logger.info("   POST /rota          - Cálculo de rota [requer token]")
    
    
    if optimization_available:
        logger.info("   ✨ Otimização inteligente: ATIVADA")
    else:
        logger.info("   ⚠️ Otimização inteligente: DESATIVADA (chaves ausentes)")
    
    logger.info(f"   🔐 CORS configurado para: {allowed_origins}")
    logger.info(f"   🗄️ Banco de dados: {app.config['SQLALCHEMY_DATABASE_URI']}")
    
    app.run(debug=debug_mode, host='0.0.0.0', port=port)

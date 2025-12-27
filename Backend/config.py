#python
import os
import threading
from pathlib import Path

# --- CONFIGURAÇÕES DE API EXTERNA ---

# Busca a chave das variáveis de ambiente
ORS_API_KEY = os.environ.get('ORS_API_KEY')

# Valida se a chave foi configurada
if not ORS_API_KEY:
    raise ValueError(
        "⚠️ ORS_API_KEY não encontrada!\n"
        "Configure com: export ORS_API_KEY='sua_chave' no ~/.bashrc"
    )

# Endpoint da API
ORS_API_URL = "https://api.openrouteservice.org/v2/directions/driving-car"

# Se a autenticação exigir o esquema Bearer (por exemplo JWT), habilite definindo
# a variável de ambiente ORS_USE_BEARER=1. Por padrão, o valor é False (usa a chave direta).
ORS_USE_BEARER = os.environ.get('ORS_USE_BEARER', '0') == '1'

# --- CONFIGURAÇÕES LOCAIS DE DADOS ---

# Diretório base do projeto
BASE_DIR = Path(__file__).resolve().parent

# Caminho para o CSV
CSV_FILE = BASE_DIR / "data" / "gps_data.csv"

# Lock para escrita segura em múltiplos processos
CSV_LOCK = threading.Lock()
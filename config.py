# config.py
# Variáveis de configuração e constantes
import os
from threading import Lock

# Diretório base do projeto no Drive
BASE_DIR = os.path.join(os.getcwd(), "seu_projeto_gps")

# Arquivo CSV para armazenamento de dados
CSV_FILE = os.path.join(BASE_DIR, "gps_data.csv")
CSV_LOCK = Lock() # Lock para garantir escrita atômica no CSV

# Chaves de API (ATENÇÃO: KEYS EXPOSTAS APENAS PARA ESTE AMBIENTE PRIVADO)
# É altamente recomendável mover estas chaves para variáveis de ambiente ou secrets em produção.
# ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjhlZDMwNDE4NjY2NjQ1NjY5ODhjODJhYWRhOGMwNjhiIiwiaCI6Im11cm11cjY0In0="
NGROK_AUTH_TOKEN = "PUT_YOUR_KEY"

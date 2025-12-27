# utils.py
# Funções utilitárias, como gerenciamento do arquivo CSV
import csv
import config
from config import CSV_LOCK 

def ensure_csv_exists():
    # Cria o arquivo CSV se não existir.
    # config.CSV_FILE aponta para o caminho correto ('gps_data.csv' no diretório principal)
    csv_path = config.CSV_FILE
    # usa pathlib para operações modernas
    try:
        if not csv_path.exists():
            with CSV_LOCK:
                csv_path.parent.mkdir(parents=True, exist_ok=True)
                with csv_path.open("w", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow(["lat", "lon", "alt", "timestamp"])
    except Exception:
        # Não falha silenciosamente em produção; re-raise para que o chamador trate se necessário
        raise

def append_gps_data(lat, lon, alt, timestamp):
    # Adiciona dados de GPS ao CSV de forma segura.
    if lat is None or lon is None:
        raise ValueError("Latitude ou longitude não pode ser None.")

    # Uso do Lock para escrita segura
    with CSV_LOCK:
        with config.CSV_FILE.open("a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([lat, lon, alt, timestamp])
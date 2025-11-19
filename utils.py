# utils.py
# Funções utilitárias, como gerenciamento do arquivo CSV
import csv
import os
from .config import CSV_FILE, CSV_LOCK

def ensure_csv_exists():
    #Cria o arquivo CSV se não existir, com trava de I/O segura
    if not os.path.exists(CSV_FILE):
        with CSV_LOCK:
            # Garante que o diretório exista antes de criar o arquivo
            os.makedirs(os.path.dirname(CSV_FILE), exist_ok=True)
            with open(CSV_FILE, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["lat", "lon", "alt", "timestamp"])

def append_gps_data(lat, lon, alt, timestamp):
    #Adiciona dados de GPS ao CSV de forma segura
    if lat is None or lon is None:
        raise ValueError("Latitude ou longitude não pode ser None.")

    # Uso do Lock para escrita segura
    with CSV_LOCK:
        with open(CSV_FILE, "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([lat, lon, alt, timestamp])
          

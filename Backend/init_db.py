from app import app, db, init_db

if __name__ == '__main__':
    init_db()
    print("✅ Banco de dados inicializado!")

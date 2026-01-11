from app import app
from db import db
from models import User

def init_db():
    with app.app_context():
        db.create_all()
        print("✅ Tabelas criadas/verificadas")

        # Criação segura do admin
        admin = User.query.filter_by(username="admin").first()
        if not admin:
            admin = User(username="admin")
            admin.set_password("Admin@123456")
            admin.tier = "admin"
            admin.monthly_requests_count = 0

            db.session.add(admin)
            db.session.commit()
            print("✅ Admin criado com sucesso")
        else:
            print("ℹ️ Admin já existe")

if __name__ == '__main__':
    init_db()

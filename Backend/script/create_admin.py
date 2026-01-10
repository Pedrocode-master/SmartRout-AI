from app import app
from models import User
from db import db

with app.app_context():
    admin = User.query.filter_by(username="admin").first()
    if not admin:
        admin = User(username="admin", tier="admin")
        admin.set_password("admin123")
        db.session.add(admin)
        db.session.commit()
        print("✅ Admin criado")
    else:
        print("ℹ️ Admin já existe")
        print("✅ Admin criado")

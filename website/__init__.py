from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from os import path
from flask_login import LoginManager

db = SQLAlchemy()
DB_NAME = "hubbleDatabase.db"
UPLOAD_FOLDER = '/uploads'

def create_app():
    app = Flask(__name__)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    app.config['SECRET_KEY'] = 'ahwelrkhHSOID90098jfj380984jo9usohjoiusdfhoiuweoriuosvIOU'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://jxekzkbzznrdjg:18a1b3cc60741c853ed5153a42c314ff4df10932a1045c419495a24aadf03345@ec2-3-227-15-75.compute-1.amazonaws.com:5432/da3rng320h5clt'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)

    from .views import views
    from .auth import auth

    app.register_blueprint(views, url_prefix='/')
    app.register_blueprint(auth, url_prefix='/')

    from .models import User, Stock

    create_database(app)

    login_manager = LoginManager()
    login_manager.login_view = 'auth.login'
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(id):
        return User.query.get(int(id))

    return app


def create_database(app):
    db.create_all(app=app)
    if not path.exists('website/' + DB_NAME):
        print('Created Database!')

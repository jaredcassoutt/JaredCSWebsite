from . import db
from flask_login import UserMixin
from sqlalchemy.sql import func

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(150), unique=True)
    password = db.Column(db.String(150))
    username = db.Column(db.String(150), unique=True)
    account_subscription = db.Column(db.Integer, default=0) #0 represents basic account, 1 represents paid subscription, 2 represents always subscribed
    watchlist = db.Column(db.String(5000))
    numberOfSignIns = db.Column(db.Integer, default=0)
    posts = db.relationship('Post')
    information = db.relationship('Information')
    
class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(10000))
    data = db.Column(db.String(10000))
    date = db.Column(db.DateTime(timezone=True), default=func.now())
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
class Information(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(10000))
    data = db.Column(db.String(10000))
    date = db.Column(db.DateTime(timezone=True), default=func.now())
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
class StockData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    watchers = db.Column(db.Integer, default = 0)
    
    ticker = db.Column(db.String(10), default = "")
    shortName = db.Column(db.String(100), default = "")
    logoURL = db.Column(db.String(150), default = "")
    description = db.Column(db.String(5000), default = "")
    industry = db.Column(db.String(200), default = "")
    sector = db.Column(db.String(200), default = "")
    hqLocation = db.Column(db.String(150), default = "")
    
    dayChart = db.Column(db.String(3000), default = "")
    monthChart = db.Column(db.String(3000), default = "")
    threeMonthChart = db.Column(db.String(3000), default = "")
    sixMonthChart = db.Column(db.String(3000), default = "")
    yearChart = db.Column(db.String(3000), default = "")
    fiveYearChart = db.Column(db.String(3000), default = "")
    allTimeChart = db.Column(db.String(3000), default = "")
    revenueGrowth = db.Column(db.String(500), default = "")
    profitGrowth = db.Column(db.String(500), default = "")
    marketCap = db.Column(db.String(20), default = "")
    epsEstimate = db.Column(db.String(20), default = "")
    epsEstimate = db.Column(db.String(200), default = "")
    epsReportDate = db.Column(db.String(200), default = "")
    shareHolderBreakdown = db.Column(db.String(200), default = "")
    
class Stock(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ticker = db.Column(db.String(10), default = "")
    shortName = db.Column(db.String(100), default = "")
    logoURL = db.Column(db.String(150), default = "")
    description = db.Column(db.String(5000), default = "")
from requests.exceptions import RequestException
from flask import Blueprint, render_template, request, flash, jsonify, Flask, redirect, url_for, abort, send_file
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from .models import User, StockData
from . import db
import json
import requests
from .StockInfoStorage import logoURLDictionary, shortNameDictionary
from .PricePredictions import make_api_dictionary
from .SentimentAnalysis import get_stockTwits_sentiment_analysis
from concurrent.futures import ThreadPoolExecutor
import smtplib
import uuid
import re
import datetime as dt
import random

views = Blueprint('views', __name__)

canDeleteUsers = True

accountStartingTickers = "ABNB TSLA MSFT EBAY NFLX Z HOOD"
hubbleWatchlistTickers = ["F", "SQ", "PYPL", "EBAY", "AMZN", "ABNB", "MSFT", "BAC", "GOOG", "FB", "LOW", "V", "BLNK"]
alwaysPremiumAccounts = {"jaredcass99@gmail.com","grahamc@jeveg.com","advmzvb@gmail.com","azaboro2@emich.edu","jackiec@jeveg.com","kylehallock549@yahoo.com","test@test.com","beepbop@coip.me",""}

@views.route('/', methods=['GET', 'POST'])
def home():
    return render_template("home.html", user=current_user)

@views.route('/StockAnalysis', methods=['GET', 'POST'])
def stockAnalysis():
    return render_template("stock_analysis.html", user=current_user)

@views.route('/passwordReset', methods=['GET', 'POST'])
def passwordReset():
    #http://wyrdie.com/passwordReset?id={user.id}&p={new_password}
    try:
        id = int(request.args.get('id'))
        p = request.args.get('p')
        user = User.query.filter(User.id == id).first()
        if user:
            if request.method == 'POST':
                password1 = request.form.get('password1')
                password2 = request.form.get('password2')
                if password1 == password2:
                    user.password = generate_password_hash(password1, method='sha256')
                    db.session.commit()
                    flash('Password successfully changed!', category='success')
                    return render_template("newpassword.html", user=current_user)
                else:
                    abort(404)
            else:
                if check_password_hash(user.password, p):
                    return render_template("newpassword.html", user=current_user)
                else:
                    abort(404)
        else:
            abort(404)
    except:
        abort(404)
        
        
# ------------------------------------------------------------------------------------------------------
# EULA AND PRIVACY POLICY DISPLAY METHODS 
# ------------------------------------------------------------------------------------------------------

@views.route('/EULA', methods=['GET', 'POST'])
def eula():
    return render_template("eula.html", user=current_user)

@views.route('/PrivacyPolicy', methods=['GET', 'POST'])
def privacyPolicy():
    return render_template("privacy_policy.html", user=current_user)

# ------------------------------------------------------------------------------------------------------
# ADMINISTRATION METHODS 
# ------------------------------------------------------------------------------------------------------
    
@views.route('/getAllUsers', methods=['POST'])
def getAllUsers():
    try:
        combokey = request.form.get('combokey')
        if combokey == "lkjwhe79sh328y3hHKjhkjh!kkj23kjhk":
            users = User.query.order_by(User.numberOfSignIns.desc()).all()
            allUsers = []
            for user in users:
                allUsers.append({"email":user.email,"id":user.id,"username":user.username,"account_subscription":user.account_subscription,"numberOfSignIns":user.numberOfSignIns})
            return jsonify({"allUsers":allUsers})
        else:
            return abort(404)
    except:
        return jsonify({})

@views.route('/deleteUser', methods=['POST'])
def deleteUser():
    if canDeleteUsers:
        email = request.form.get('email').lower()
        user = User.query.filter(User.email == email).first()
        if user:
            db.session.delete(user)
            db.session.commit()
            return jsonify({"success":True,"message":""})
        return jsonify({"success":False,"message":"no user found"})  
    return abort(404) 


# ------------------------------------------------------------------------------------------------------
# USER CONNECTION API METHODS (SIGN-IN, SIGN-UP)
# ------------------------------------------------------------------------------------------------------

@views.route('/userSignUpAPI', methods=['POST'])
def myUserSignUpWithTrait():
    try:
        email = request.form.get('email').lower()
        username = request.form.get('username').lower()
        password1 = request.form.get('password1')
        password2 = request.form.get('password2')
        
        user = User.query.filter(User.email==email).first()
        existing_username = User.query.filter(User.username==username).first()
        
        if user:
            return jsonify({"success":False, "message":"User with this email address already exists", "email":None, "username":None})
        if existing_username:
            return jsonify({"success":False, "message":"User with this username already exists", "email":None, "username":None})
        elif valid_email(email) == False:
            return jsonify({"success":False, "message":"Invalid email address", "email":None, "username":None})
        elif len(username) < 3:
            return jsonify({"success":False, "message":"Username must contain 3 or more characters", "email":None, "username":None})
        elif password1 != password2:
            return jsonify({"success":False, "message":"Passwords do not match", "email":None, "username":None})
        elif len(password1) < 7:
            return jsonify({"success":False, "message":"Passwords must be at least 7 characters", "email":None, "username":None})
        else:
            new_user = User(email=email, username=username, password=generate_password_hash(
                password1, method='sha256'), watchlist=accountStartingTickers)
            db.session.add(new_user)
            db.session.commit()
            return jsonify({"success":True, "message":"New user successfully added!", "email":email, "username":username, "watchlist":accountStartingTickers})
    except:
        return jsonify({"success":False, "message":"Unknown Error", "email":None, "username":None})
    
@views.route('/userSignInAPI', methods=['POST'])
def myUserSignIn():
    try:
        email = request.form.get('email').lower()
        password = request.form.get('password')
        
        user = User.query.filter(User.email==email).first()
        if user:
            if check_password_hash(user.password, password):
                signInNumber = user.numberOfSignIns
                user.numberOfSignIns = signInNumber + 1
                db.session.commit()
                if email in alwaysPremiumAccounts:
                   user.account_subscription = 2
                db.session.commit() 
                return jsonify({"success":True, "message":"User Login Successful!", "email":email, "username":user.username, "accountStatus":user.account_subscription})
            else:
                return jsonify({"success":False, "message":"Invalid Password", "email":None, "username":None, "accountStatus": None})
        else:
            return jsonify({"success":False, "message":"Invalid User Email", "email":None, "username":None, "accountStatus": None})
    except:
        return jsonify({"success":False, "message":"Unknown Error", "email":None, "username":None, "accountStatus": None})
    
@views.route('/addTickerToWatchlist', methods=['POST'])
def addTickerToWatchlist():
    try:
        email = request.form.get('email').lower()
        ticker = request.form.get('ticker').upper()
        
        user = User.query.filter(User.email == email).first()
        if user:
            watchlist_string = user.watchlist
            if watchlist_string:
                watchlist = watchlist_string.split()
                if ticker not in watchlist_string:
                    if len(watchlist)>0:
                        user.watchlist = ticker + " " + watchlist_string
                        db.session.commit()
                    else:
                        user.watchlist = ticker
                        db.session.commit()
                    watchlist = [ticker] + watchlist
                
                #changing watchlist amount    
                stock = StockData.query.filter(StockData.ticker == ticker).first()
                watchlistCount = stock.watchers
                watchlistCount+=1
                stock.watchers = watchlistCount
                db.session.commit()
                
                return jsonify({"success":True, "message":"Stock added to watchlist!","watchlist":watchlist})
            else:
                return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
        else:
                return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
    except:
        return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
    
@views.route('/removeTickerFromWatchlist', methods=['POST'])
def removeTickerFromWatchlist():
    try:
        email = request.form.get('email').lower()
        ticker = request.form.get('ticker').upper()
        user = User.query.filter(User.email == email).first()
        if user:
            watchlist_string = user.watchlist
            if watchlist_string:
                if f"{ticker} " in watchlist_string:
                    watchlist_string = watchlist_string.replace(f"{ticker} ", "")
                elif f" {ticker}" in watchlist_string:
                    watchlist_string = watchlist_string.replace(f" {ticker}","")
                user.watchlist = watchlist_string
                db.session.commit()
                
                watchlist = watchlist_string.split()
                
                #changing watchlist amount    
                stock = StockData.query.filter(StockData.ticker == ticker).first()
                watchlistCount = stock.watchers
                watchlistCount-=1
                stock.watchers = watchlistCount
                db.session.commit()
                
                return jsonify({"success":True, "message":"Stock added to watchlist!","watchlist":watchlist})
            else:
                return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
        else:
                return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
    except:
        return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
    
    
@views.route('/getUserWatchlist', methods=['POST'])
def getUserWatchlist():
    try:
        email = request.form.get('email').lower()
        
        user = User.query.filter(User.email == email).first()
        if user:
            watchlist_string = user.watchlist
            if watchlist_string:
                watchlist = watchlist_string.split()
                return jsonify({"success":True, "message":"Stock added to watchlist!","watchlist":watchlist})
            else:
                return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
        else:
                return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
    except:
        return jsonify({"success":False, "message":"Unknown Error","watchlist":None})
    
    
@views.route('/userEmailPasswordResetAPI', methods=['POST'])
def userEmailPasswordResetAPI():
    email = request.form.get('email').lower()
    user = User.query.filter_by(email=email).first()
    if user:
        hubble_email = 'admin@hubbleinvesting.com'
        password = "Invest4Life!!"

        sent_from = hubble_email
        to = [email]
        subject = f"Reset Hubble Password"
        fakeArg1 = str(uuid.uuid4())
        fakeArg1 = fakeArg1[:int(len(fakeArg1)/2)]
        fakeArg2 = str(uuid.uuid4())
        fakeArg2 = fakeArg2[:int(len(fakeArg2)/3)]
        new_password = str(uuid.uuid4())
        user.password = generate_password_hash(
            new_password, method='sha256')
        db.session.commit()
        if check_password_hash(user.password, new_password):
        
            email_text = f"""Subject: {subject}\nFrom: {hubble_email}\n
Hello There!

We are sorry you are having trouble accessing your account. To make things easy for you, we have reset your password.
New Password: {new_password}

If you would like to change your password, please visit the following link: http://wyrdie.com/passwordReset?id={user.id}&p={new_password}&mra={fakeArg1}&spt={fakeArg2}

Best,
The Hubble Team
"""
            try:
                smtp_server = smtplib.SMTP_SSL('smtp.dreamhost.com', 465)
                smtp_server.ehlo()
                smtp_server.login(hubble_email, password)
                smtp_server.sendmail(sent_from, to, email_text)
                smtp_server.close()
                return jsonify({"success":True, "message":"Email Sent"})
            except Exception as ex:
                print ("Something went wrong….",ex)
        return jsonify({"success":False, "message":"Unknown Error."})
    else:
        return jsonify({"success":False, "message":"Invalid User Email"})

# ------------------------------------------------------------------------------------------------------
# HUBBLE METHODS 
# ------------------------------------------------------------------------------------------------------

@views.route('/logoAPI', methods=['GET'])
def logoAPI():
    #http://wyrdie.com/logoAPI?ticker=MSFT
    try:
        ticker = request.args.get('ticker')
        logoURL = logoURLDictionary.get(ticker)
        if logoURL:
            return redirect(logoURL)
        else:
            return redirect("https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/blankCompany.png")
    except:
        return redirect("https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/blankCompany.png")

@views.route('/stockAI', methods=['POST'])
def stockAI():
    try:
        context = {}
        ticker = request.form.get("ticker").upper()
        stock = StockData.query.filter(StockData.ticker == ticker).first()
        if stock:
            print("stock exists")
        else:
            randomTicker = random.choice(hubbleWatchlistTickers)
            stock = StockData.query.filter(StockData.ticker == randomTicker).first()
        
        ticker = stock.ticker
        year_prices = filter_chart_for_prices(get_one_year_chart(ticker))
        
        shortName = stock.shortName
        logoURL = logoURLDictionary[ticker]
    
        context["tickerText"] = ticker
        context["logoURL"] = logoURL
        context["shortName"] = shortName
        if len(year_prices)>0:
            context["currentPrice"] = year_prices[-1]
        else:
            context["currentPrice"] = 0.00
        context["bullOrBear"] = "Bullish"
        context["buyOrSell"] = "Buy"
        context["predictedPrice"] = 0.00
        context["yearlyChart"] = year_prices
        context["predictionChart"] = []
        return jsonify(context)
    except:
        return jsonify({"tickerText":None, "logoURL":None, "shortName":None, "currentPrice":None, "bullOrBear":None, "buyOrSell":None, "predictedPrice": None, "predictionChart":None})
    
@views.route('/supportAndResistanceAPI', methods=['POST'])
def supportAndResistanceAPI():
    try:
        ticker = request.form.get("ticker").upper()
        stock = StockData.query.filter(StockData.ticker == ticker).first()
        if stock:
            print("stock exists")
        else:
            randomTicker = random.choice(hubbleWatchlistTickers)
            stock = StockData.query.filter(StockData.ticker == randomTicker).first()
        data = make_api_dictionary(stock)
        print("data:")
        print(data)
        return jsonify(data)
    except:
        return jsonify({})
    

@views.route('/homeScreen_apiV2', methods=['POST'])
def homeScreen_apiV2():
    context = {}
    context["newsData"] = None
    context["trendingData"] = None
    context["styvioWatchlistData"] = None
    context["watchlistData"] = None
    try:
        print(1)
        userWatchlist = []
        email = request.form.get("email")
        # GET USER WATCHLIST
        user = User.query.filter(User.email==email).first()
        print(2)
        if user:
            print(3)
            watchlist = user.watchlist
            if watchlist:
                print(4)
                ticker_list = watchlist.split()
                for ticker in ticker_list:
                    userWatchlist.append(getStockInfo(ticker))
                context["watchlistData"] = userWatchlist
                styvioURL = "https://www.styvio.com/homeScreen_apiV2"
                body = {"username":"Jaredcass99"}
                # GET DATA FROM STYVIO
                print(5)
                r = requests.post(styvioURL, data=body).json()
                print(5.1)
                context["newsData"] = r.get("newsData")
                print(5.2)
                context["trendingData"] = []
                print(5.3)
                trending_data = r.get("trendingData")
                print(5.5)
                print(trending_data )
                for ticker_data in trending_data:
                    ticker_context = ticker_data
                    logoURL = logoURLDictionary.get(ticker_data.get("ticker"))
                    if logoURL == None:
                        logoURL = "https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/blankCompany.png"
                    ticker_context["logoURL"] = logoURL
                    context["trendingData"].append(ticker_context)
                print(6)
                styvioWatchlistTickers = ["F", "EBAY", "AMZN", "ABNB", "MSFT", "BAC", "GOOG", "FB", "LOW", "V", "BLNK"]
                styvioWatchlist = []
                for ticker in styvioWatchlistTickers:
                    styvioWatchlist.append(getStockInfo(ticker))
                print(7)
                context["styvioWatchlistData"] = styvioWatchlist
                return jsonify(context)
        context["watchlistData"] = []
        return jsonify(context)
    except:
        
        return jsonify({"newsData":None,"trendingData":None,"styvioWatchlistData":None,"watchlistData":None})
    
@views.route('/homeScreen_apiV3', methods=['POST'])
def homeScreen_apiV3():
    context = {}
    context["newsData"] = None
    context["trendingData"] = None
    context["styvioWatchlistData"] = None
    context["watchlistData"] = None
    try:
        context = {}
        userWatchlist = []
        email = request.form.get("email")
        # GET USER WATCHLIST
        user = User.query.filter(User.email==email).first()
        if user:
            trait = user.watchlist
            if trait:
                ticker_list = trait.split()
                for ticker in ticker_list:
                    userWatchlist.append(getStockInfo(ticker))
                context["watchlistData"] = userWatchlist
                # GET TRENDING TICKERS FROM STOCKTWITS
                stURL = "https://api.stocktwits.com/api/2/trending/symbols.json"
                trendingData = []
                r = requests.get(stURL).json()
                ttCounter = 0
                trendingSymbols = r.get("symbols")
                if trendingSymbols:
                    for tt in trendingSymbols:
                        ticker = tt.get("symbol")
                        if logoURLDictionary.get(ticker):
                            ttCounter+=1
                            shortName = tt.get("title")
                            watchlistCount = tt.get("watchlist_count")
                            if ticker and shortName and ttCounter<9:
                                trendingData.append(getTrendingTickerInfo(ticker,shortName,watchlistCount))
                if len(trendingData)<8:
                    while trendingData<8:
                        ttCounter+=1
                        randomTicker = random.choice(list(logoURLDictionary.keys()))
                        stock = StockData.query.filter(StockData.ticker == randomTicker).first()
                        shortName = stock.shortName
                        watchlistCount = stock.watchers
                        if watchlistCount == None:
                            watchlistCount = 0
                        if ticker and shortName and ttCounter<9:
                            trendingData.append(getTrendingTickerInfo(ticker,shortName,watchlistCount))
                        
                context["trendingData"] = trendingData
                
                #NEED TO FIGURE OUT WHERE TO GET NEWS DATA FROM
                context["newsData"] = getNewsData()
                
                styvioWatchlistTickers = hubbleWatchlistTickers
                styvioWatchlist = []
                for ticker in styvioWatchlistTickers:
                    styvioWatchlist.append(getStockInfo(ticker))
                context["styvioWatchlistData"] = styvioWatchlist
                return jsonify(context)
        context["watchlistData"] = []
        return jsonify(context)
    except:
        return jsonify({"newsData":None,"trendingData":None,"styvioWatchlistData":None,"watchlistData":None})

def getStockInfoOld(ticker):
    url = "https://www.styvio.com/apiV2/"+ticker+"/4ff60632-d64a-4abb-b6b8-7e276199de56"
    r=requests.get(url).json()
    return {"ticker":ticker,"price":r.get("priceData").get("currentPrice"),"logoURL":r.get("companyInformation").get("logoURL")}

def getStockInfo(ticker):
    ticker = ticker.upper()
    logoURL = logoURLDictionary.get(ticker)
    if logoURL == None:
        logoURL = "https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/blankCompany.png"
    shortName = shortNameDictionary.get(ticker)
    return {"ticker": ticker, "shortName": shortName, "logoURL": logoURL}

def getTrendingTickerInfo(ticker, shortName, watchlistCount):
    ticker = ticker.upper()
    logoURL = logoURLDictionary.get(ticker)
    if logoURL == None:
        logoURL = "https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/blankCompany.png"
    return {"ticker":ticker,"shortName":shortName,"logoURL":logoURL,"watchlistCount":watchlistCount,"priceChange":None,"currentPrice":None,"priceChart":None}

def getNewsData():
    try:
        response_articles = []
        url = "https://saurav.tech/NewsAPI/top-headlines/category/business/us.json"
        r=requests.get(url).json()
        articles = r.get("articles")
        for article in articles:
            headlinesArticle = article.get("title")
            
            headlinesDate = article.get("publishedAt")
            if headlinesDate:
                headlinesDate = dt.datetime.fromisoformat(headlinesDate[:-1]).strftime('%Y-%m-%d')
            headlinesLink = article.get("url")
            headlinesImage = article.get("urlToImage")
            headlinesSource = article.get("source").get("name")
            if headlinesArticle and headlinesDate and headlinesLink and headlinesImage and headlinesSource:
                response_articles.append({"headlinesArticle":headlinesArticle,"headlinesDate":headlinesDate,"headlinesLink":headlinesLink,"headlinesImage":headlinesImage,"headlinesSource":headlinesSource})
        return response_articles
    except:
        return [{"headlinesArticle":"Cannot Load News Articles Right Now","headlinesDate":"","headlinesLink":"","headlinesImage":"","headlinesSource":""}]

@views.route('/entertainmentPageAPI', methods=['GET'])
def entertainmentPageAPI():
    try:
        context = {}
        newsData = getNewsData()
        
        context["headlinesData"] = newsData
        context["podcastData"] = []
        context["videoData"] = []
        
        return jsonify(context)
    except:
        context = {}
        context["headlinesData"] = []
        context["podcastData"] = []
        context["videoData"] = []
        return jsonify(context)

@views.route('/explorePageAPI', methods=['POST'])
def explorePageAPI():
    context = {}
    #explorePage = [
    #    {"name": "Figures & Charts ", "description": "View our informational charts to learn about the best investment opportunities","color": "#003049","owned": True,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/Charts.png", "type": "Charts", "url":None},
    #    {"name": "Media", "description": "Spotify podcasts, YouTube videos, and news articles to keep you informed","color": "#D62828","owned": True,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/Media.png", "type": "Media", "url":None},
    #    {"name": "Social Sentiment", "description": "See the most recent sentiment for your favorite stocks","color": "#F77F00","owned": True,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/Sentiment.png", "type": "Sentiment", "url":None},
    #    {"name": "AR Charts", "description": "View our informational charts in your own space using out augmented reality features","color": "#FCBF49","owned": False,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/ARCharts.png", "type": "ARCharts", "url":None},
    #    {"name": "AI Price Prediction", "description": "Stock price prediction using our proprietary stock artificial intelligence","color": "#ECD1A3","owned": False,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/AIPrediction.png", "type": "AIPrediction", "url":"https://hubbleapp.herokuapp.com/stockAI"},
    #    {"name": "AI Direction Prediction", "description": "Stock direction prediction using our proprietary stock artificial intelligence","color": "#E4DAD0","owned": False,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/chartDirection.png", "type": "AIDirectionPrediction", "url":"https://hubbleapp.herokuapp.com/stockAI"},
    #    {"name": "Support and Resistance", "description": "Determine if a stock is overvalued or undervalued using relative strength and resistance lines","color": "#DCE3FC","owned": False,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/supportresistance.png", "type": "SupportResistance", "url":"https://hubbleapp.herokuapp.com/supportAndResistanceAPI"},
    #]
    explorePage = [
        {"name": "App Update Required", "description": "","color": "#003049","owned": True,"imageURL":"", "type": "Error", "url":None},
    ]
    context["explorePage"] = explorePage
    return jsonify(context)

@views.route('/explorePageAPIV2', methods=['POST'])
def explorePageAPIV2():
    context = {}
    explorePage = [
        {"name": "Figures & Charts ", "description": "View our informational charts to learn about the best investment opportunities","color": "#003049","owned": True,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/Charts.png", "type": "Charts", "url":None},
        {"name": "Media", "description": "Spotify podcasts, YouTube videos, and news articles to keep you informed","color": "#D62828","owned": True,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/Media.png", "type": "Media", "url":None},
    #    {"name": "Social Sentiment", "description": "See the most recent sentiment for your favorite stocks","color": "#F77F00","owned": True,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/Sentiment.png", "type": "Sentiment", "url":None},
        {"name": "AR Charts", "description": "View our informational charts in your own space using out augmented reality features","color": "#FCBF49","owned": False,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/ARCharts.png", "type": "ARCharts", "url":None},
        {"name": "AI Price Prediction", "description": "Stock price prediction using our proprietary stock artificial intelligence","color": "#ECD1A3","owned": False,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/AIPrediction.png", "type": "AIPrediction", "url":"https://hubbleapp.herokuapp.com/stockAI"},
        {"name": "AI Direction Prediction", "description": "Stock direction prediction using our proprietary stock artificial intelligence","color": "#E4DAD0","owned": False,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/chartDirection.png", "type": "AIDirectionPrediction", "url":"https://hubbleapp.herokuapp.com/stockAI"},
        {"name": "Support and Resistance", "description": "Determine if a stock is overvalued or undervalued using relative strength and resistance lines","color": "#DCE3FC","owned": False,"imageURL":"https://wyrdie-storage-bucket.s3.us-east-2.amazonaws.com/4/supportresistance.png", "type": "SupportResistance", "url":"https://hubbleapp.herokuapp.com/supportAndResistanceAPI"},
    ]
    context["explorePage"] = explorePage
    return jsonify(context)

@views.route('/sentimentPageAPI', methods=['GET'])
def sentimentPageAPI():
    ticker = request.args.get('ticker').upper()
    context = get_stockTwits_sentiment_analysis(ticker)
    return jsonify(context)

@views.route('/stockPageAPI', methods=['GET'])
def stockPageAPI():
    context = {}
    try:
        context = {}
        ticker = request.args.get('ticker').upper()
        stock = StockData.query.filter(StockData.ticker == ticker).first()
        if stock:
            print("stock exists")
        else:
            randomTicker = random.choice(hubbleWatchlistTickers)
            stock = StockData.query.filter(StockData.ticker == randomTicker).first()
        
        ticker = stock.ticker 
        context["ticker"] = ticker  
        # getting priceData
        priceData = {}
        oneDayPriceChart = filter_chart_for_prices(get_one_day_chart(ticker))
        priceData["dailyPrices"] = oneDayPriceChart
        threeMonthPriceChart = filter_chart_for_prices(get_three_month_chart(ticker))
        priceData["3MonthPrices"] = threeMonthPriceChart
        oneYearPriceChart = filter_chart_for_prices(get_one_year_chart(ticker))
        priceData["yearlyPrices"] = oneYearPriceChart
        fiveYearsPriceChart = filter_chart_for_prices(get_five_year_chart(ticker))
        priceData["5YearPrices"] = fiveYearsPriceChart
        priceData["currentPrice"] = oneDayPriceChart[-1]
        context["priceData"] = priceData
        # other api calls to finish getting all data
        statementData = get_formatted_statement(ticker) # assets, liabilities, revenue, profits
        fundamentals = get_formatted_fundamentals(ticker) #marketCap, peRatio, pbRatio, trailingPEG1Y
        
        # getting companyInformation
        companyInformation = {}
        shortName = stock.shortName
        companyInformation["shortName"] = shortName
        industry = stock.industry
        companyInformation["industry"] = industry
        sector = stock.sector
        companyInformation["sector"] = sector
        companyDescription = stock.description
        companyInformation["companyDescription"] = companyDescription
        logoURL = logoURLDictionary[ticker]
        companyInformation["logoURL"] = logoURL
        companyLocation = stock.hqLocation
        companyInformation["companyLocation"] = companyLocation
        marketCap = fundamentals.get("marketCap")
        companyInformation["marketCap"] = marketCap
        newsData = get_news_data(ticker)
        companyInformation["newsData"] = newsData
        context["companyInformation"] = companyInformation
        
        # setting up fundamentals
        fundamentalContext = {}
        fundamentalContext["balanceSheet"] = statementData.get("balanceSheet")
        fundamentalContext["incomeStatement"] = statementData.get("incomeStatement")
        fundamentalContext["shareholderBreakdown"] = {"insiderHoldings":25,"institutionalHoldings":25,"generalPublicHoldings":50}
        context["fundamentals"] = fundamentalContext
        return jsonify(context)
    except:
        return jsonify(context)
        

#-----------------------------------------------------------------------------
#   TIINGO METHODS
#-----------------------------------------------------------------------------

base_url = "https://api.tiingo.com/"
token = "62c687c4ad7b5e457a81b3550730443c180050a0"

# PRICE CHARTS
def get_one_day_chart(ticker):
    todaysDate = dt.datetime.now()
    formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
    url = base_url + f"iex/{ticker}/prices?startDate={formatedTodaysDate}&resampleFreq=5min&token={token}"
    r = requests.get(url).json()
    counter = 0
    while r == []:
        counter+=1
        todaysDate = dt.datetime.now() - dt.timedelta(days=counter)
        formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
        url = base_url + f"iex/{ticker}/prices?startDate={formatedTodaysDate}&resampleFreq=5min&token={token}"
        r = requests.get(url).json()
        if counter>4:
            return r
    return r

def get_three_month_chart(ticker):
    startDate = dt.datetime.now() - dt.timedelta(days=90)
    formattedStartDate = startDate.strftime('%Y-%m-%d')

    todaysDate = dt.datetime.now()
    formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
    
    url = base_url + f"tiingo/daily/{ticker}/prices?startDate={formattedStartDate}&endDate={formatedTodaysDate}&resampleFreq=daily&token={token}"
    r = requests.get(url).json()
    return r

def get_one_year_chart(ticker):
    startDate = dt.datetime.now() - dt.timedelta(days=365)
    formattedStartDate = startDate.strftime('%Y-%m-%d')

    todaysDate = dt.datetime.now()
    formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
    
    url = base_url + f"tiingo/daily/{ticker}/prices?startDate={formattedStartDate}&endDate={formatedTodaysDate}&resampleFreq=daily&token={token}"
    r = requests.get(url).json()
    return r

def get_five_year_chart(ticker):
    startDate = dt.datetime.now() - dt.timedelta(days=5*365)
    formattedStartDate = startDate.strftime('%Y-%m-%d')

    todaysDate = dt.datetime.now()
    formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
    
    url = base_url + f"tiingo/daily/{ticker}/prices?startDate={formattedStartDate}&endDate={formatedTodaysDate}&resampleFreq=weekly&token={token}"
    r = requests.get(url).json()
    return r

def filter_chart_for_prices(chart_data):
    prices = []
    for data in chart_data:
        price = data.get("close")
        if price:
            prices.append(price)
    return prices
        

# FUNDAMENTALS
def get_news_data(ticker):
    try:
        url = f'https://api.tickertick.com/feed?q=tt:{ticker}&lang=en'
        r = requests.get(url).json()
        stories = r.get("stories")
        articles = []
        for story in stories:
            newsArticle = story.get("title")
            newsSource = story.get("site")
            newsLink = story.get("url")
            newsDate = story.get("time")
            newsDate = dt.datetime.fromtimestamp(newsDate/1000).strftime('%Y-%m-%d')
            articles.append({"newsArticle":newsArticle,"newsSource":newsSource,"newsLink":newsLink,"newsDate":newsDate})
        return articles
    except:
        return []

def get_statement_data(ticker):
    #this includes revenue and liabilities etc
    todaysDate = dt.datetime.now()
    formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
    url = f'https://api.tiingo.com/tiingo/fundamentals/{ticker}/statements?token={token}'
    r = requests.get(url).json()
    return r

def get_formatted_statement(ticker):
    try:
        context = {}
        statement_data = get_statement_data(ticker)
        counter = 0
        balanceSheet = []
        incomeStatement = []
        for f in statement_data:
            if counter>3:
                break
            quarter = f.get("quarter")
            if quarter != 0:
                counter+=1
                statement_data = f.get("statementData")
                balance_sheet = statement_data.get("balanceSheet")
                singleBalanceSheet = {}
                for dp in balance_sheet:
                    print(dp)
                    data_code = dp.get("dataCode")
                    value = dp.get("value")
                    if data_code == "totalAssets":
                        singleBalanceSheet["assets"] = value
                    if data_code == "totalLiabilities":
                         singleBalanceSheet["liabilities"] = value
                balanceSheet.insert(0,singleBalanceSheet)
                         
                singleIncomeStatement = {}
                income_statement = statement_data.get("incomeStatement")
                for dp in income_statement:
                    data_code = dp.get("dataCode")
                    value = dp.get("value")
                    if data_code == "revenue":
                        singleIncomeStatement["revenue"] = value
                    if data_code == "grossProfit":
                         singleIncomeStatement["profit"] = value
                incomeStatement.insert(0,singleIncomeStatement)
                         
        context["balanceSheet"] = balanceSheet   
        context["incomeStatement"] = incomeStatement
        return context
    except:
        return {}
    
    
def get_fundamental_data(ticker):
    todaysDate = dt.datetime.now()
    formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
    url = f'https://api.tiingo.com/tiingo/fundamentals/{ticker}/daily?startDate={todaysDate}&token={token}'
    r = requests.get(url).json()
    counter = 0
    while r == []:
        counter+=1
        todaysDate = dt.datetime.now() - dt.timedelta(days=counter)
        formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
        url = f'https://api.tiingo.com/tiingo/fundamentals/{ticker}/daily?startDate={todaysDate}&token={token}'
        r = requests.get(url).json()
    return r

def get_formatted_fundamentals(ticker):
    # {
        # 'marketCap': 2228893357708.68, 
        # 'peRatio': 31.3949313622, 
        # 'pbRatio': 13.9503635136, 
        # 'trailingPEG1Y': 1.4302135398
    # }
    try:
        context = {}
        fundamentals = get_fundamental_data(ticker)[0]
        
        context["marketCap"] = fundamentals.get("marketCap")
        context["peRatio"] = fundamentals.get("peRatio")
        context["pbRatio"] = fundamentals.get("pbRatio")
        context["trailingPEG1Y"] = fundamentals.get("trailingPEG1Y")
        
        return context
    except:
        return {}


# ------------------------------------------------------------------------------------------------------
# HELPER METHODS 
# ------------------------------------------------------------------------------------------------------

def valid_email(email):
  return bool(re.search(r"^[\w\.\+\-]+\@[\w]+\.[a-z]{2,3}$", email))

#@views.route('/fillInStockData', methods=['GET'])
#def fillInStockData():
#    counter = 0
#    for ticker in logoURLDictionary:
#        stock = StockData.query.filter(StockData.ticker == ticker).first()
#        if stock:
#            print("Data already exists for: ", ticker)
#        else:
#            print(ticker)
#            requestData = get_more_generic_data(ticker)
#            if requestData:
#                shortName = requestData.get("companyName")
#                logoURL = logoURLDictionary[ticker]
#                description = requestData.get("description")
#                if description:
#                    if len(description)>2499:
#                        description = description[:2495]+"..."
#                city = requestData.get("city")
#                state = requestData.get("state")
#                hqLocation = None
#                if city and state:
#                    hqLocation = city+", "+state
#
#                sector = requestData.get("sector")
#                industry = requestData.get("industry")

#                new_stock = StockData(ticker=ticker,shortName=shortName,logoURL=logoURL,description=description,hqLocation=hqLocation,sector=sector,industry=industry)
#                db.session.add(new_stock)
#                db.session.commit()
#            else:
#                print("no data returned for: ",ticker)
#    return jsonify({"isDone":True})

def get_more_generic_data(ticker):
    try:
        base_url = "https://cloud.iexapis.com/"
        token = "pk_93ec0a435ccd4ba1b7581177aa3238fa"
        api_url = base_url+f'stable/stock/{ticker}/company?token={token}'
        url = api_url
        r = requests.get(url).json()
        print(r)
        return r
    except:
        return None
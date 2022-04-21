import requests
import json
import re
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

def get_stockTwits_sentiment_analysis(ticker):
    messages = get_messages_from_stockTwits(ticker)
    analyzer = SentimentIntensityAnalyzer()
    total_score = 0
    pos_score = 0
    neg_score = 0
    neutral_score = 0
    compound_score = 0
    for message in messages:
        vs = analyzer.polarity_scores(message)
        pos = vs.get("pos")
        neu = vs.get("neu")
        neg = vs.get("neg")
        compound = vs.get("compound")
        if pos and neu and neg and compound:
            total_score += 1
            pos_score += pos
            neg_score += neg
            neutral_score += neu
            compound_score += compound
    pos_score = pos_score/total_score
    neg_score = neg_score/total_score
    neutral_score = neutral_score/total_score
    compound_score = compound_score/total_score
    print({"positive":pos_score,"neutral":neutral_score,"negative":neg_score,"compound":compound_score})
    return {"positive":pos_score,"neutral":neutral_score,"negative":neg_score,"compound":compound_score}


def get_messages_from_stockTwits(ticker):
    message_strings = []
    try:
        ticker = ticker.upper()
        url = f'https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json'
        r = requests.get(url).json()
        messages = r.get("messages")
        if messages:
            for message in messages:
                message_body = message.get("body")
                if message_body:
                    message_strings.append(message_body)
        else:
            return message_strings
        
        return message_strings
    except:
        return message_strings
import numpy as np
from math import sqrt
from scipy.signal import savgol_filter
from sklearn.linear_model import LinearRegression
from scipy.interpolate import interp1d
from statistics import mean
from statistics import stdev
import requests
import datetime as dt
from .StockInfoStorage import logoURLDictionary, shortNameDictionary

def get_smooth_price_list_daily(data):
    prices = np.array(data)

    month_diff = len(prices) // 20 # Integer divide the number of prices we have by 30
    if month_diff == 0: # We want a value greater than 0
        month_diff = 1
    smooth = int(2 * month_diff + 3) # Simple algo to determine smoothness
    pts = savgol_filter(prices, smooth, 3) # Get the smoothened price data
    return pts, prices

def get_smooth_price_list_3month(data):
    prices = np.array(data)

    month_diff = len(prices) // 20 # Integer divide the number of prices we have by 30
    if month_diff == 0: # We want a value greater than 0
        month_diff = 1
    smooth = int(2 * month_diff + 3) # Simple algo to determine smoothness
    pts = savgol_filter(prices, smooth, 3) # Get the smoothened price data
    return pts, prices

def get_smooth_price_list_yearly(data):
    prices = np.array(data)

    month_diff = len(prices) // 20 # Integer divide the number of prices we have by 30
    if month_diff == 0: # We want a value greater than 0
        month_diff = 1
    smooth = int(2 * month_diff + 3) # Simple algo to determine smoothness
    pts = savgol_filter(prices, smooth, 3) # Get the smoothened price data
    return pts, prices

def get_smooth_price_list_5year(data):
    prices = np.array(data)
    month_diff = len(prices) // 20 # Integer divide the number of prices we have by 30
    if month_diff == 0: # We want a value greater than 0
        month_diff = 1
    smooth = int(2 * month_diff + 3) # Simple algo to determine smoothness
    pts = savgol_filter(prices, smooth, 3) # Get the smoothened price data
    return pts, prices


def pythag(pt1, pt2):
    a_sq = (pt2[0] - pt1[0]) ** 2
    b_sq = (pt2[1] - pt1[1]) ** 2
    return sqrt(a_sq + b_sq)

def local_min_max(pts):
    local_min = []
    local_max = []
    prev_pts = [(0, pts[0]), (1, pts[1])]
    for i in range(1, len(pts) - 1):
        append_to = ''
        if pts[i-1] > pts[i] < pts[i+1]:
            append_to = 'min'
        elif pts[i-1] < pts[i] > pts[i+1]:
            append_to = 'max'
        if append_to:
            if local_min or local_max:
                prev_distance = pythag(prev_pts[0], prev_pts[1]) * 0.5
                curr_distance = pythag(prev_pts[1], (i, pts[i]))
                if curr_distance >= prev_distance:
                    prev_pts[0] = prev_pts[1]
                    prev_pts[1] = (i, pts[i])
                    if append_to == 'min':
                        local_min.append((i, pts[i]))
                    else:
                        local_max.append((i, pts[i]))
            else:
                prev_pts[0] = prev_pts[1]
                prev_pts[1] = (i, pts[i])
                if append_to == 'min':
                    local_min.append((i, pts[i]))
                else:
                    local_max.append((i, pts[i]))
    return local_min, local_max

def regression_ceof(pts):
    X = np.array([pt[0] for pt in pts]).reshape(-1, 1)
    y = np.array([pt[1] for pt in pts])
    model = LinearRegression()
    model.fit(X, y)
    return model.coef_[0], model.intercept_

def seperate_double_tuple(tup):
    x = []
    y = []
    for element in tup:
        x.append(element[0])
        y.append(element[1])
    return x,y

def apply_adj_factor(adj_factor,smooth_prices):
    new_support = []
    new_resistance = []
    for i in smooth_prices:
        new_support.append(i-adj_factor)
        new_resistance.append(i+adj_factor)
    return new_support,new_resistance

def best_fit_line(y,x):
    x = np.array(x)
    y = np.array(y)
    m, b = np.polyfit(x, y, 1)
    return m, b

def get_support_resistance_and_prices(ticker):
    smooth_prices, prices = get_smooth_price_list_yearly(ticker)
    
    local_min, local_max = local_min_max(prices)
    local_min_slope, local_min_int = regression_ceof(local_min)
    local_max_slope, local_max_int = regression_ceof(local_max)
    support = (local_min_slope * np.array(range(0,len(smooth_prices)))) + local_min_int
    resistance = (local_max_slope * np.array(range(0,len(smooth_prices)))) + local_max_int
    
    adj_factor = mean(abs(x - y) for x, y in zip(support, resistance))/2
    support,resistance = apply_adj_factor(adj_factor,smooth_prices)
    return support,resistance,prices

def find_next_resistance_or_suppport(support,resistance,prices):
    resistance_intersections = []
    support_intersections = []
    for i,price_val in enumerate(prices):
        if price_val >= 0.99*resistance[i]:
            resistance_intersections.append(i)
        if price_val <= 1.01*support[i]:
            support_intersections.append(i)
    res_stdev = len(prices)/(len(resistance_intersections))
    sup_stdev = len(prices)/(len(support_intersections))
    
    next_resistance_ind = resistance_intersections[-1]+res_stdev
    next_support_ind = support_intersections[-1]+sup_stdev
    
    while next_resistance_ind < len(prices):
        next_resistance_ind += 1
        next_support_ind += 1
       
    while next_support_ind < len(prices):
        next_resistance_ind += 1
        next_support_ind += 1
    
    y = []
    for i in range(0,len(support)):
        y.append(i)
    
    value = round(len(support)/9)
    if len(support)>value and len(resistance)>value:
        y = y[-value:]
        local_min_slope, local_min_int = best_fit_line(support[-value:],y)
        local_max_slope, local_max_int = best_fit_line(resistance[-value:],y)
        
        next_support_value = next_support_ind*local_min_slope + local_min_int
        next_resistance_value = next_resistance_ind*local_max_slope + local_max_int
        
        if abs(prices[-1]-next_support_value)<abs(prices[-1]-next_resistance_value):
            next_resistance_ind = resistance_intersections[-1]+res_stdev+sup_stdev
            next_resistance_value = next_resistance_ind*local_max_slope + local_max_int
        else:
            next_support_ind = support_intersections[-1]+sup_stdev+res_stdev
            next_support_value = next_support_ind*local_min_slope + local_min_int
            
        return next_resistance_ind,next_resistance_value,next_support_ind,next_support_value
        
    return next_resistance_ind,resistance[-1],next_support_ind,support[-1]
    
def make_api_dictionary(stock):
    support_resistance_dict = {}
    symbol = stock.ticker
    
    
    shortName = stock.shortName
    logoURL = logoURLDictionary[symbol]
    
    support_resistance_dict["logoURL"] = logoURL
    support_resistance_dict["tickerText"] = symbol
    support_resistance_dict["shortName"] = shortName
    
    data = filter_chart_for_prices(get_one_year_chart(symbol))
    support_resistance_dict["currentPrice"] = data[-1]
    #YEARLY LIST
    smooth_prices, prices = get_smooth_price_list_yearly(data)
    local_min, local_max = local_min_max(prices)
    local_min_slope, local_min_int = regression_ceof(local_min)
    local_max_slope, local_max_int = regression_ceof(local_max)
    support = (local_min_slope * np.array(range(0,len(smooth_prices)))) + local_min_int
    resistance = (local_max_slope * np.array(range(0,len(smooth_prices)))) + local_max_int
    adj_factor = mean(abs(x - y) for x, y in zip(support, resistance))/2
    support,resistance = apply_adj_factor(adj_factor,smooth_prices)
    next_resistance_ind,next_resistance_value,next_support_ind,next_support_value = find_next_resistance_or_suppport(support,resistance,prices)
    support_resistance_dict["yearly"] = {"support":support,"resistance":resistance, "prices":prices.tolist(), "next_resistance_ind": next_resistance_ind, "next_resistance_value": next_resistance_value, "next_support_ind": next_support_ind, "next_support_value": next_support_value}
    find_next_resistance_or_suppport(support,resistance,prices)
    # #5 YEAR LIST
    # smooth_prices, prices = get_smooth_price_list_5year(data)
    # local_min, local_max = local_min_max(prices)
    # local_min_slope, local_min_int = regression_ceof(local_min)
    # local_max_slope, local_max_int = regression_ceof(local_max)
    # support = (local_min_slope * np.array(range(0,len(smooth_prices)))) + local_min_int
    # resistance = (local_max_slope * np.array(range(0,len(smooth_prices)))) + local_max_int
    # adj_factor = mean(abs(x - y) for x, y in zip(support, resistance))/2
    # support,resistance = apply_adj_factor(adj_factor,smooth_prices)
    # next_resistance_ind,next_resistance_value,next_support_ind,next_support_value = find_next_resistance_or_suppport(support,resistance,prices)
    # support_resistance_dict["fiveYear"] = {"support":support,"resistance":resistance, "prices":prices.tolist(), "next_resistance_ind": next_resistance_ind, "next_resistance_value": next_resistance_value, "next_support_ind": next_support_ind, "next_support_value": next_support_value}
    
    return support_resistance_dict

base_url = "https://api.tiingo.com/"
token = "62c687c4ad7b5e457a81b3550730443c180050a0"

def get_one_year_chart(ticker):
    startDate = dt.datetime.now() - dt.timedelta(days=265)
    formattedStartDate = startDate.strftime('%Y-%m-%d')

    todaysDate = dt.datetime.now()
    formatedTodaysDate = todaysDate.strftime('%Y-%m-%d')
    
    url = base_url + f"tiingo/daily/{ticker}/prices?startDate={formattedStartDate}&endDate={formatedTodaysDate}&resampleFreq=daily&token={token}"
    r = requests.get(url).json()
    return r

def filter_chart_for_prices(chart_data):
    prices = []
    for data in chart_data:
        price = data.get("close")
        if price:
            prices.append(price)
    return prices
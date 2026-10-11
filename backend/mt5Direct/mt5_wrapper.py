import MetaTrader5 as mt5
import json
from datetime import datetime

def init_mt5():
    """Initialize connection to MetaTrader 5 terminal"""
    if not mt5.initialize():
        print(json.dumps({"error": "MT5 initialize failed", "details": mt5.last_error()}))
        quit()

def shutdown_mt5():
    """Shutdown connection to MetaTrader 5 terminal"""
    mt5.shutdown()

def get_account():
    """Get account information"""
    init_mt5()
    account_info = mt5.account_info()
    if account_info is None:
        print(json.dumps({"error": "Failed to get account info", "details": mt5.last_error()}))
    else:
        # Convert mt5.account_info() namedtuple to dict
        account_dict = account_info._asdict()
        # Convert to the format expected by our TypeScript interface
        result = {
            "login": account_dict.get('login', 0),
            "tradeMode": account_dict.get('trade_mode', 'PENDING_MT5'),
            "balance": float(account_dict.get('balance', 0)),
            "equity": float(account_dict.get('equity', 0)),
            "margin": float(account_dict.get('margin', 0)),
            "freeMargin": float(account_dict.get('margin_free', 0)),
            "marginLevel": float(account_dict.get('margin_level', 0)),
            "leverage": int(account_dict.get('leverage', 0)),
            "currency": account_dict.get('currency', 'USD'),
            "server": account_dict.get('server', ''),
            "company": account_dict.get('company', ''),
            "profit": float(account_dict.get('profit', 0)),
            "lastUpdate": int(datetime.now().timestamp() * 1000)
        }
        print(json.dumps(result))
    shutdown_mt5()

def get_positions():
    """Get all open positions"""
    init_mt5()
    positions = mt5.positions_get()
    if positions is None:
        print(json.dumps([]))
    else:
        positions_list = []
        for pos in positions:
            pos_dict = pos._asdict()
            # Convert to the format expected by our TypeScript interface
            position = {
                "ticket": pos_dict.get('ticket', 0),
                "symbol": pos_dict.get('symbol', ''),
                "type": 'BUY' if pos_dict.get('type', 0) == 0 else 'SELL',  # 0=BUY, 1=SELL
                "volume": float(pos_dict.get('volume', 0)),
                "openPrice": float(pos_dict.get('price_open', 0)),
                "currentPrice": 0.0,  # Will be updated later with tick data
                "sl": float(pos_dict.get('sl', 0)),
                "tp": float(pos_dict.get('tp', 0)),
                "profit": float(pos_dict.get('profit', 0)),
                "swap": float(pos_dict.get('swap', 0)),
                "magic": int(pos_dict.get('magic', 0)),
                "comment": pos_dict.get('comment', ''),
                "openTime": int(pos_dict.get('time', 0)) * 1000,  # Convert to milliseconds
                "trailingEnabled": False,  # Not available in basic position data
                "trailingDistance": 0,
                "trailingStep": 0
            }
            positions_list.append(position)
        print(json.dumps(positions_list))
    shutdown_mt5()

def get_ticks(symbols_str):
    """Get tick data for specified symbols"""
    init_mt5()
    symbols = symbols_str.split(',') if symbols_str else []
    ticks_dict = {}
    
    for symbol in symbols:
        if not symbol.strip():
            continue
        tick = mt5.symbol_info_tick(symbol.strip())
        if tick is not None:
            tick_dict = tick._asdict()
            # Calculate spread from bid/ask if not directly available
            spread = tick_dict.get('spread', 0)
            if spread == 0:
                # Calculate spread from point value if spread not provided
                symbol_info = mt5.symbol_info(symbol.strip())
                if symbol_info:
                    point = symbol_info.point
                    spread = (tick_dict.get('ask', 0) - tick_dict.get('bid', 0)) / point if point != 0 else 0
            
            ticks_dict[symbol.strip()] = {
                "symbol": tick_dict.get('symbol', ''),
                "bid": float(tick_dict.get('bid', 0)),
                "ask": float(tick_dict.get('ask', 0)),
                "spread": float(spread),
                "last": float(tick_dict.get('last', 0)),
                "volume": int(tick_dict.get('volume', 0)),
                "time": int(tick_dict.get('time', 0)) * 1000,  # Convert to milliseconds
                "high24h": 0.0,  # Not available in tick data
                "low24h": 0.0    # Not available in tick data
            }
        else:
            # Return error for this symbol
            ticks_dict[symbol.strip()] = {"error": f"No tick data for symbol {symbol}", "details": mt5.last_error()}
    
    print(json.dumps(ticks_dict))
    shutdown_mt5()

def get_symbols(symbols_str):
    """Get detailed symbol information for specified symbols"""
    init_mt5()
    symbols = symbols_str.split(',') if symbols_str else []
    symbols_list = []
    
    for symbol in symbols:
        if not symbol.strip():
            continue
        symbol_info = mt5.symbol_info(symbol.strip())
        if symbol_info is not None:
            symbol_dict = symbol_info._asdict()
            # Convert to the format expected by our TypeScript interface
            symbol_data = {
                "symbol": symbol_dict.get('symbol', ''),
                "bid": float(symbol_dict.get('bid', 0)),
                "ask": float(symbol_dict.get('ask', 0)),
                "spread": float(symbol_dict.get('spread', 0)),
                "digits": int(symbol_dict.get('digits', 0)),
                "point": float(symbol_dict.get('point', 0)),
                "minLot": float(symbol_dict.get('volume_min', 0)),
                "maxLot": float(symbol_dict.get('volume_max', 0)),
                "lotStep": float(symbol_dict.get('volume_step', 0)),
                "contractSize": float(symbol_dict.get('trade_contract_size', 0)),
                "tradeAllowed": bool(symbol_dict.get('trade_mode', 0) != mt5.SYMBOL_TRADE_MODE_DISABLED),
                "high24h": 0.0,  # Not available in basic symbol info
                "low24h": 0.0,   # Not available in basic symbol info
                "sessionOpen": 0,  # Not available in basic symbol info
                "sessionHigh": 0,  # Not available in basic symbol info
                "sessionLow": 0,   # Not available in basic symbol info
                "sessionVolume": 0, # Not available in basic symbol info
                "volume": float(symbol_dict.get('volume', 0)),
                "time": int(symbol_dict.get('time', 0)) * 1000,  # Convert to milliseconds
                "isCurrentChart": False  # We don't know this from symbol info alone
            }
            symbols_list.append(symbol_data)
        else:
            # Skip symbols that can't be found
            pass
    
    print(json.dumps(symbols_list))
    shutdown_mt5()

def get_candles(symbol, timeframe, count):
    """Get historical candle data"""
    init_mt5()
    # Map timeframe string to MT5 timeframe
    tf_map = {
        'M1': mt5.TIMEFRAME_M1,
        'M5': mt5.TIMEFRAME_M5,
        'M15': mt5.TIMEFRAME_M15,
        'M30': mt5.TIMEFRAME_M30,
        'H1': mt5.TIMEFRAME_H1,
        'H4': mt5.TIMEFRAME_H4,
        'D1': mt5.TIMEFRAME_D1,
        'W1': mt5.TIMEFRAME_W1,
        'MN1': mt5.TIMEFRAME_MN1
    }
    tf = tf_map.get(timeframe, mt5.TIMEFRAME_M1)
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
    if rates is None:
        print(json.dumps({"error": f"Failed to get candles for {symbol}", "details": mt5.last_error()}))
    else:
        candles_list = []
        for rate in rates:
            rate_dict = rate._asdict()
            # Convert timestamp to ISO string
            dt = datetime.fromtimestamp(rate_dict.get('time', 0))
            time_iso = dt.isoformat()
            candles_list.append({
                "time": rate_dict.get('time', 0),
                "timeIso": time_iso,
                "open": rate_dict.get('open', 0.0),
                "high": rate_dict.get('high', 0.0),
                "low": rate_dict.get('low', 0.0),
                "close": rate_dict.get('close', 0.0),
                "volume": rate_dict.get('volume', 0),
                "tickCount": 0,  # Not available in copy_rates_from_pos
                "spread": 0.0    # Not available in copy_rates_from_pos
            })
        print(json.dumps(candles_list))
    shutdown_mt5()

def send_order(action, symbol, volume, sl, tp, price):
    """Send a trade order"""
    init_mt5()
    # Map action string to MT5 order type
    action_map = {
        'BUY': mt5.ORDER_TYPE_BUY,
        'SELL': mt5.ORDER_TYPE_SELL,
        'BUY_LIMIT': mt5.ORDER_TYPE_BUY_LIMIT,
        'SELL_LIMIT': mt5.ORDER_TYPE_SELL_LIMIT,
        'BUY_STOP': mt5.ORDER_TYPE_BUY_STOP,
        'SELL_STOP': mt5.ORDER_TYPE_SELL_STOP
    }
    mt5_action = action_map.get(action.upper(), mt5.ORDER_TYPE_BUY)
    
    # Prepare trade request
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": mt5_action,
        "price": float(price) if float(price) > 0 else mt5.symbol_info_tick(symbol).ask if action.upper() == 'BUY' else mt5.symbol_info_tick(symbol).bid,
        "sl": float(sl),
        "tp": float(tp),
        "deviation": 10,
        "magic": 889900,
        "comment": "Python script trade",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    
    # Send the trade request
    result = mt5.order_send(request)
    if result is None:
        print(json.dumps({"success": False, "error": f"Order send failed: {mt5.last_error()}"}))
    else:
        result_dict = result._asdict()
        response = {
            "success": result_dict.get('retcode', 0) == mt5.TRADE_RETCODE_DONE,
            "dealTicket": result_dict.get('deal', 0),
            "orderTicket": result_dict.get('order', 0),
            "executionPrice": float(result_dict.get('price', 0)),
            "errorMessage": f"{result_dict.get('retcode', 0)}: {result_dict.get('comment', '')}" if result_dict.get('retcode', 0) != mt5.TRADE_RETCODE_DONE else None
        }
        print(json.dumps(response))
    shutdown_mt5()

def close_position(ticket):
    """Close a position by ticket"""
    init_mt5()
    # Get position info first
    positions = mt5.positions_get(ticket=ticket)
    if not positions or len(positions) == 0:
        print(json.dumps({"success": False, "error": f"Position with ticket {ticket} not found"}))
        shutdown_mt5()
        return
    
    position = positions[0]
    position_dict = position._asdict()
    
    # Determine close action (opposite of position type)
    if position_dict['type'] == mt5.ORDER_TYPE_BUY:
        action = mt5.ORDER_TYPE_SELL
        price = mt5.symbol_info_tick(position_dict['symbol']).bid
    else:
        action = mt5.ORDER_TYPE_BUY
        price = mt5.symbol_info_tick(position_dict['symbol']).ask
    
    # Prepare close request
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": position_dict['symbol'],
        "volume": position_dict['volume'],
        "type": action,
        "position": ticket,
        "price": price,
        "deviation": 10,
        "magic": 889900,
        "comment": "Python script close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    
    # Send the close request
    result = mt5.order_send(request)
    if result is None:
        print(json.dumps({"success": False, "error": f"Close position failed: {mt5.last_error()}"}))
    else:
        result_dict = result._asdict()
        response = {
            "success": result_dict.get('retcode', 0) == mt5.TRADE_RETCODE_DONE,
            "dealTicket": result_dict.get('deal', 0),
            "orderTicket": result_dict.get('order', 0),
            "executionPrice": float(result_dict.get('price', 0)),
            "errorMessage": f"{result_dict.get('retcode', 0)}: {result_dict.get('comment', '')}" if result_dict.get('retcode', 0) != mt5.TRADE_RETCODE_DONE else None
        }
        print(json.dumps(response))
    shutdown_mt5()

def modify_position(ticket, sl, tp):
    """Modify SL/TP of a position by ticket"""
    init_mt5()
    # Get position info first
    positions = mt5.positions_get(ticket=ticket)
    if not positions or len(positions) == 0:
        print(json.dumps({"success": False, "error": f"Position with ticket {ticket} not found"}))
        shutdown_mt5()
        return
    
    position = positions[0]
    position_dict = position._asdict()
    
    # Prepare modify request
    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": ticket,
        "symbol": position_dict['symbol'],
        "sl": float(sl),
        "tp": float(tp),
    }
    
    # Send the modify request
    result = mt5.order_send(request)
    if result is None:
        print(json.dumps({"success": False, "error": f"Modify position failed: {mt5.last_error()}"}))
    else:
        result_dict = result._asdict()
        response = {
            "success": result_dict.get('retcode', 0) == mt5.TRADE_RETCODE_DONE,
            "dealTicket": result_dict.get('deal', 0),
            "orderTicket": result_dict.get('order', 0),
            "executionPrice": float(result_dict.get('price', 0)),
            "errorMessage": f"{result_dict.get('retcode', 0)}: {result_dict.get('comment', '')}" if result_dict.get('retcode', 0) != mt5.TRADE_RETCODE_DONE else None
        }
        print(json.dumps(response))
    shutdown_mt5()
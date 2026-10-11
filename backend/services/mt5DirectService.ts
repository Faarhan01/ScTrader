import { PythonShell } from 'python-shell';
import path from 'path';
import { AccountInfo, Position, TickData, DetailedSymbolInfo, OrderAction, CandleData } from '../types/mt5.js';

const mt5WrapperDir = path.resolve(process.cwd(), 'backend', 'mt5Direct');
const mt5WrapperFile = 'mt5_wrapper.py';

export class Mt5DirectService {
    private static instance: Mt5DirectService;

    private constructor() { }

    public static getInstance(): Mt5DirectService {
        if (!Mt5DirectService.instance) {
            Mt5DirectService.instance = new Mt5DirectService();
        }
        return Mt5DirectService.instance;
    }

    private runPythonCommand(command: string, args: string[] = []): Promise<any> {
        return PythonShell.run(mt5WrapperFile, {
            args: [command, ...args],
            scriptPath: mt5WrapperDir,
        })
        .then((results: string[]) => {
            if (results.length === 0) {
                return null;
            }
            return JSON.parse(results[0]);
        })
        .catch((err: any) => {
            throw err;
        });
    }

    public async getAccount(): Promise<AccountInfo | null> {
        try {
            const result = await this.runPythonCommand('get_account');
            if (result && !result.error) {
                return result as AccountInfo;
            }
            return null;
        } catch (error: any) {
            console.error('Error in getAccount:', error);
            return null;
        }
    }

    public async getPositions(): Promise<Position[]> {
        try {
            const result = await this.runPythonCommand('get_positions');
            if (Array.isArray(result)) {
                return result as Position[];
            }
            return [];
        } catch (error: any) {
            console.error('Error in getPositions:', error);
            return [];
        }
    }

    public async getTicks(symbols: string[]): Promise<Record<string, TickData>> {
        try {
            const result = await this.runPythonCommand('get_ticks', [symbols.join(',')]);
            if (result && typeof result === 'object') {
                return result as Record<string, TickData>;
            }
            return {};
        } catch (error: any) {
            console.error('Error in getTicks:', error);
            return {};
        }
    }

    public async getSymbols(symbols: string[]): Promise<DetailedSymbolInfo[]> {
        try {
            const result = await this.runPythonCommand('get_symbols', [symbols.join(',')]);
            if (Array.isArray(result)) {
                return result as DetailedSymbolInfo[];
            }
            return [];
        } catch (error: any) {
            console.error('Error in getSymbols:', error);
            return [];
        }
    }

    public async getCandles(symbol: string, timeframe: string, count: number): Promise<CandleData[]> {
        try {
            const result = await this.runPythonCommand('get_candles', [symbol, timeframe, count.toString()]);
            if (Array.isArray(result)) {
                return result as CandleData[];
            }
            return [];
        } catch (error: any) {
            console.error('Error in getCandles:', error);
            return [];
        }
    }

    public async sendOrder(action: string, symbol: string, volume: number, sl: number = 0, tp: number = 0, price: number = 0): Promise<{ success: boolean; dealTicket?: number; orderTicket?: number; executionPrice?: number; error?: string }> {
        try {
            const result = await this.runPythonCommand('send_order', [action, symbol, volume.toString(), sl.toString(), tp.toString(), price.toString()]);
            if (result && result.success !== undefined) {
                return {
                    success: result.success,
                    dealTicket: result.dealTicket,
                    orderTicket: result.orderTicket,
                    executionPrice: result.executionPrice,
                    error: result.errorMessage ? `${result.errorCode}: ${result.errorMessage}` : undefined
                };
            }
            return { success: false, error: 'Unknown error' };
        } catch (error: any) {
            console.error('Error in sendOrder:', error);
            return { success: false, error: error.message };
        }
    }

    public async closePosition(ticket: number): Promise<{ success: boolean; dealTicket?: number; orderTicket?: number; executionPrice?: number; error?: string }> {
        try {
            const result = await this.runPythonCommand('close_position', [ticket.toString()]);
            if (result && result.success !== undefined) {
                return {
                    success: result.success,
                    dealTicket: result.dealTicket,
                    orderTicket: result.orderTicket,
                    executionPrice: result.executionPrice,
                    error: result.errorMessage ? `${result.errorCode}: ${result.errorMessage}` : undefined
                };
            }
            return { success: false, error: 'Unknown error' };
        } catch (error: any) {
            console.error('Error in closePosition:', error);
            return { success: false, error: error.message };
        }
    }

    public async modifyPosition(ticket: number, sl: number, tp: number): Promise<{ success: boolean; dealTicket?: number; orderTicket?: number; executionPrice?: number; error?: string }> {
        try {
            const result = await this.runPythonCommand('modify_position', [ticket.toString(), sl.toString(), tp.toString()]);
            if (result && result.success !== undefined) {
                return {
                    success: result.success,
                    dealTicket: result.dealTicket,
                    orderTicket: result.orderTicket,
                    executionPrice: result.executionPrice,
                    error: result.errorMessage ? `${result.errorCode}: ${result.errorMessage}` : undefined
                };
            }
            return { success: false, error: 'Unknown error' };
        } catch (error: any) {
            console.error('Error in modifyPosition:', error);
            return { success: false, error: error.message };
        }
    }
}
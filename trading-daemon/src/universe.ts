export const TRADING_UNIVERSE = [
    // --- BIG TECH / MAG 7 ---
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'ORCL', 'NFLX',

    // --- SEMICONDUCTORS ---
    'AMD', 'INTC', 'MU', 'ARM', 'TSM', 'QCOM', 'TXN', 'AMAT', 'LRCX', 'ASML', 'SMCI', 'MRVL',

    // --- FINANCE / BANKING ---
    'JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'AXP', 'PYPL', 'HOOD', 'SOFI', 'COIN', 'MSTR', 'WFC', 'BLK', 'SCHW',

    // --- SAAS / CLOUD / AI ---
    'PLTR', 'SNOW', 'CRM', 'ADBE', 'DDOG', 'MDB', 'TEAM', 'WDAY', 'CRWD', 'PANW', 'NET', 'ZS', 'OKTA',

    // --- RETAIL / CONSUMER ---
    'WMT', 'COST', 'TGT', 'HD', 'LOW', 'NKE', 'LULU', 'SBUX', 'CMG', 'MCD', 'KO', 'PEP', 'PG', 'EL',

    // --- ENERGY / RENEWABLES ---
    'XOM', 'CVX', 'OXY', 'SLB', 'HAL', 'ENPH', 'FSLR', 'NEE', 'BE', 'SEDG', 'VLO', 'MPC',

    // --- HEALTHCARE / BIOTECH ---
    'UNH', 'LLY', 'NVO', 'JNJ', 'PFE', 'ABBV', 'MRNA', 'GILD', 'AMGN', 'VRTX', 'REGN', 'ISRG',

    // --- MANUFACTURING / INDUSTRIAL ---
    'BA', 'CAT', 'DE', 'GE', 'HON', 'MMM', 'UPS', 'FDX', 'LMT', 'RTX', 'GD', 'NOC',

    // --- TRAVEL / ENTERTAINMENT ---
    'DIS', 'ABNB', 'BKNG', 'MAR', 'HLT', 'RCL', 'CCL', 'UAL', 'DAL', 'AAL', 'DKNG', 'PENN',

    // --- AUTOMOTIVE / EV ---
    'F', 'GM', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'STLA', 'HYMTF',

    // --- ETFS / MACRO ---
    'SPY', 'QQQ', 'IWM', 'DIA', 'VIX', 'GLD', 'SLV', 'TLT', 'USO', 'BITO',

    // --- OTHER HIGH-VOLUME SYMBOLS ---
    'RBLX', 'PATH', 'AI', 'C3AI', 'UPST', 'AFRM', 'MARA', 'RIOT', 'CLSK', 'HUT', 'WOLF', 'U', 'UNITY',
    'SPOT', 'SHOP', 'SE', 'MELI', 'TME', 'PDD', 'BABA', 'JD', 'BIDU', 'NTES', 'BZ', 'IQ'
    // ... adding more to reach 200+ for now, can expand later
];

export const SECTORS: { [key: string]: string[] } = {
    TECH: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE'],
    SEMI: ['AMD', 'INTC', 'MU', 'ARM', 'TSM', 'QCOM', 'SMCI'],
    FINANCE: ['JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'AXP'],
    ENERGY: ['XOM', 'CVX', 'OXY', 'SLB', 'HAL', 'ENPH'],
    RETAIL: ['WMT', 'COST', 'TGT', 'HD', 'NKE', 'LULU'],
    BIO: ['UNH', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRNA']
};

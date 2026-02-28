export const TRADING_UNIVERSE = [
    // --- BIG TECH / MAG 7 ---
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'ORCL', 'NFLX', 'ADBE', 'CRM', 'ASML',

    // --- SEMICONDUCTORS / HARDWARE ---
    'AMD', 'INTC', 'MU', 'ARM', 'TSM', 'QCOM', 'TXN', 'AMAT', 'LRCX', 'SMCI', 'MRVL', 'KLAC', 'ADI', 'NXPI', 'MCHP', 'ON', 'STM', 'WDC', 'STX',

    // --- FINANCE / BANKING / FINTECH ---
    'JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'AXP', 'PYPL', 'HOOD', 'SOFI', 'COIN', 'MSTR', 'WFC', 'BLK', 'SCHW', 'C', 'TFC', 'USB', 'PNC', 'MET', 'PRU', 'AIG',
    'NU', 'SQ', 'AFRM', 'UPST', 'TREE', 'LENDING', 'LC',

    // --- SAAS / CLOUD / AI / SOFTWARE ---
    'PLTR', 'SNOW', 'CRM', 'DDOG', 'MDB', 'TEAM', 'WDAY', 'CRWD', 'PANW', 'NET', 'ZS', 'OKTA', 'NOW', 'SNPS', 'CDNS', 'ANSS', 'SPLK', 'DT', 'FSLY', 'AKAM',
    'PLTR', 'AI', 'C3AI', 'PATH', 'U', 'UNITY', 'RBLX', 'DOCU', 'ZM', 'TWLO', 'SHOP', 'SE', 'MELI',

    // --- RETAIL / CONSUMER / EBAY ---
    'WMT', 'COST', 'TGT', 'HD', 'LOW', 'NKE', 'LULU', 'SBUX', 'CMG', 'MCD', 'KO', 'PEP', 'PG', 'EL', 'TJX', 'ROST', 'DLTR', 'DG', 'EBAY', 'ETSY', 'CHWY',

    // --- ENERGY / RENEWABLES / OIL ---
    'XOM', 'CVX', 'OXY', 'SLB', 'HAL', 'ENPH', 'FSLR', 'NEE', 'BE', 'SEDG', 'VLO', 'MPC', 'PSX', 'COP', 'EOG', 'PXD', 'DVN', 'RIG', 'RUN', 'SPWR',

    // --- HEALTHCARE / BIOTECH / PHARMA ---
    'UNH', 'LLY', 'NVO', 'JNJ', 'PFE', 'ABBV', 'MRNA', 'GILD', 'AMGN', 'VRTX', 'REGN', 'ISRG', 'TMO', 'DHR', 'ABT', 'MDT', 'BMY', 'CVS', 'CI', 'HCA',
    'BIIB', 'VRTX', 'IQV', 'ZTS', 'IDXX',

    // --- MANUFACTURING / INDUSTRIAL / DEFENSE ---
    'BA', 'CAT', 'DE', 'GE', 'HON', 'MMM', 'UPS', 'FDX', 'LMT', 'RTX', 'GD', 'NOC', 'WM', 'RSG', 'EMR', 'ETN', 'ITW', 'PH', 'TT', 'AME',

    // --- TRAVEL / ENTERTAINMENT / GAMING ---
    'DIS', 'ABNB', 'BKNG', 'MAR', 'HLT', 'RCL', 'CCL', 'UAL', 'DAL', 'AAL', 'DKNG', 'PENN', 'WYN', 'EXPE', 'TRIP', 'WYNN', 'LVS', 'MGM', 'CZG',

    // --- AUTOMOTIVE / EV / TRANSP ---
    'F', 'GM', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'STLA', 'HYMTF', 'TSLA', 'TM', 'HMC', 'VWAGY', 'BMWYY', 'MBGYY', 'UBER', 'LYFT', 'GRUB',

    // --- COMMUNICATIONS / TELCO ---
    'VZ', 'T', 'TMUS', 'CMCSA', 'CHTR', 'DISCA', 'PARA', 'WBD', 'TME', 'JD', 'BABA', 'PDD',

    // --- MATERIALS / MINING / GOLD ---
    'FCX', 'NEM', 'GOLD', 'AA', 'NUE', 'STLD', 'CLF', 'MP', 'LAC', 'ALB', 'SQM',

    // --- ETFS / MACRO ---
    'SPY', 'QQQ', 'IWM', 'DIA', 'VIX', 'GLD', 'SLV', 'TLT', 'USO', 'BITO', 'ARKK', 'SMH', 'XLE', 'XLF', 'XLK', 'XLV',

    // --- RECENT IPOs / VOLATILE ---
    'RDDT', 'ARM', 'CART', 'KVUE', 'MNCH', 'SPCE', 'NKLA', 'PLUG', 'QS', 'SOUN', 'BBAI', 'GFAI'
];

export const SECTORS: { [key: string]: string[] } = {
    TECH: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE'],
    SEMI: ['AMD', 'INTC', 'MU', 'ARM', 'TSM', 'QCOM', 'SMCI'],
    FINANCE: ['JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'AXP'],
    ENERGY: ['XOM', 'CVX', 'OXY', 'SLB', 'HAL', 'ENPH'],
    RETAIL: ['WMT', 'COST', 'TGT', 'HD', 'NKE', 'LULU'],
    BIO: ['UNH', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRNA'],
    DEFENSE: ['LMT', 'RTX', 'GD', 'NOC', 'BA'],
    TRAVEL: ['ABNB', 'BKNG', 'MAR', 'HLT', 'RCL', 'CCL'],
    EV_AUTO: ['TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'F', 'GM']
};

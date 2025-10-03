/**
 * WebSocket Authentication Middleware for CloudChef Print Server
 * Проверяет JWT токены для всех WebSocket подключений
 */

const jwt = require('jsonwebtoken');

// Список разрешенных origins для дополнительной безопасности
const ALLOWED_ORIGINS = [
  'https://cloudchef.app',
  'https://www.cloudchef.app',
  'http://localhost:3000', // Для разработки
  'http://localhost:5173', // Для разработки Vite
  'http://localhost:5174'  // Дополнительный порт Vite
];

/**
 * Middleware для проверки WebSocket аутентификации
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Function} next - Callback функция
 */
function websocketAuth(socket, next) {
  try {
    // 🔍 Проверяем origin подключения
    const origin = socket.handshake.headers.origin;

    // В production блокируем только если origin явно не в списке разрешенных
    // НО разрешаем localhost для локальной разработки (даже если сервер в production)
    const isLocalhost = origin && (origin.includes('localhost') || origin.includes('127.0.0.1'));
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);

    if (process.env.NODE_ENV === 'production' && !isAllowedOrigin && !isLocalhost) {
      console.warn(`⚠️ Запрещенный origin: ${origin}`);
      return next(new Error(`Запрещенный origin: ${origin}`));
    }

    console.log(`✅ Origin разрешен: ${origin}`);

    // 🔑 Извлекаем токен из auth или query
    const token = socket.handshake.auth?.token || 
                 socket.handshake.headers.authorization?.replace('Bearer ', '') ||
                 socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Токен аутентификации не предоставлен'));
    }

    // 📊 Определяем тип подключения (browser или agent)
    const clientType = socket.handshake.query?.clientType || 'unknown';
    
    if (clientType === 'browser') {
      // 🌐 Для браузеров требуем JWT токен от Supabase
      verifySupabaseToken(token, (err, decoded) => {
        if (err) {
          return next(new Error(`Недействительный JWT: ${err.message}`));
        }
        
        socket.userId = decoded.sub; // Supabase user ID
        socket.userEmail = decoded.email;
        socket.clientType = 'browser';
        socket.authenticated = true;
        
        console.log(`✅ Браузер аутентифицирован: ${decoded.email} (${decoded.sub})`);
        next();
      });
    } else if (clientType === 'agent') {
      // 🖨️ Для агентов используем API ключи или специальные токены
      verifyAgentToken(token, (err, agentInfo) => {
        if (err) {
          return next(new Error(`Недействительный токен агента: ${err.message}`));
        }
        
        socket.agentId = agentInfo.agentId;
        socket.restaurantCode = agentInfo.restaurantCode;
        socket.clientType = 'agent';
        socket.authenticated = true;
        
        console.log(`✅ Агент аутентифицирован: ${agentInfo.agentId} для ресторана ${agentInfo.restaurantCode}`);
        next();
      });
    } else {
      return next(new Error(`Неизвестный тип клиента: ${clientType}`));
    }
  } catch (error) {
    console.error('❌ Ошибка WebSocket аутентификации:', error);
    next(new Error('Внутренняя ошибка аутентификации'));
  }
}

/**
 * Проверяет JWT токен от Supabase
 * @param {string} token - JWT токен
 * @param {Function} callback - Callback(error, decoded)
 */
function verifySupabaseToken(token, callback) {
  // В production нужен настоящий Supabase JWT secret
  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  
  if (!supabaseJwtSecret) {
    console.warn('⚠️ SUPABASE_JWT_SECRET не установлен, используем базовую проверку');
    // Для MVP можем использовать простую проверку формата JWT
    const parts = token.split('.');
    if (parts.length !== 3) {
      return callback(new Error('Неверный формат JWT'));
    }
    
    try {
      const payload = JSON.parse(atob(parts[1]));
      if (!payload.sub || !payload.email) {
        return callback(new Error('JWT не содержит обязательные поля'));
      }
      
      // Проверяем срок действия
      if (payload.exp && payload.exp < Date.now() / 1000) {
        return callback(new Error('JWT истек'));
      }
      
      return callback(null, payload);
    } catch (err) {
      return callback(new Error('Не удается декодировать JWT'));
    }
  }
  
  // С настоящим secret используем полную верификацию
  jwt.verify(token, supabaseJwtSecret, { algorithms: ['HS256'] }, callback);
}

/**
 * Проверяет токен агента (может быть API ключ или JWT)
 * @param {string} token - Токен агента
 * @param {Function} callback - Callback(error, agentInfo)
 */
function verifyAgentToken(token, callback) {
  // Для агентов используем более простую схему с API ключами
  // Формат: agent_<restaurantCode>_<randomKey>
  const agentKeyPattern = /^agent_([A-Z0-9]{6})_([a-zA-Z0-9]{32})$/;
  const match = token.match(agentKeyPattern);
  
  if (!match) {
    return callback(new Error('Неверный формат токена агента'));
  }
  
  const [, restaurantCode, apiKey] = match;
  
  // TODO: В production проверять в базе данных
  // Сейчас для MVP принимаем любой правильно сформированный токен
  callback(null, {
    agentId: `agent_${restaurantCode}`,
    restaurantCode: restaurantCode,
    apiKey: apiKey
  });
}

/**
 * Rate limiting для WebSocket подключений
 */
const connectionLimits = new Map();

function rateLimitMiddleware(socket, next) {
  const ip = socket.handshake.address;
  const now = Date.now();
  const windowMs = 60000; // 1 минута
  const maxConnections = 10; // Максимум 10 подключений в минуту с одного IP
  
  if (!connectionLimits.has(ip)) {
    connectionLimits.set(ip, []);
  }
  
  const connections = connectionLimits.get(ip);
  const recentConnections = connections.filter(time => now - time < windowMs);
  
  if (recentConnections.length >= maxConnections) {
    return next(new Error('Превышен лимит подключений с вашего IP'));
  }
  
  recentConnections.push(now);
  connectionLimits.set(ip, recentConnections);
  
  next();
}

module.exports = {
  websocketAuth,
  rateLimitMiddleware,
  ALLOWED_ORIGINS
};




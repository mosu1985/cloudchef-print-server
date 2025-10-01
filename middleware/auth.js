// 🔐 Middleware для авторизации доступа к админ-функциям
// Защищает test.html и админ-панель от несанкционированного доступа

const AUTHORIZED_USERS = [
  'mosu1985@gmail.com', // Основной суперадмин
  // Добавляйте дополнительных пользователей здесь
];

const ADMIN_ROUTES = [
  '/test.html',
  '/admin',
  '/api/admin',
  '/api/stats',
  '/api/logs'
];

/**
 * Проверяет авторизацию пользователя для доступа к админ-функциям
 * @param {string} userEmail - Email пользователя из JWT токена
 * @returns {boolean} - Имеет ли пользователь права доступа
 */
function isAuthorizedUser(userEmail) {
  return AUTHORIZED_USERS.includes(userEmail);
}

/**
 * Проверяет является ли маршрут административным
 * @param {string} path - Путь запроса
 * @returns {boolean} - Является ли маршрут административным
 */
function isAdminRoute(path) {
  return ADMIN_ROUTES.some(route => path.startsWith(route));
}

/**
 * Middleware для проверки доступа к админ-маршрутам
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object  
 * @param {Function} next - Next middleware function
 */
function authMiddleware(req, res, next) {
  // Проверяем только админ-маршруты
  if (!isAdminRoute(req.path)) {
    return next();
  }

  // Получаем токен из заголовка Authorization
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Требуется авторизация для доступа к админ-панели',
      redirectTo: '/login'
    });
  }

  try {
    // В реальной системе здесь будет проверка JWT токена
    // Для примера используем простую проверку
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    
    if (!decoded.email || !isAuthorizedUser(decoded.email)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'У вас нет прав доступа к админ-панели',
        requiredRole: 'superadmin'
      });
    }

    // Добавляем информацию о пользователе в request
    req.user = decoded;
    next();
    
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'Недействительный токен авторизации'
    });
  }
}

/**
 * Генерирует простой токен авторизации для тестирования
 * (В продакшене нужно использовать JWT)
 * @param {string} email - Email пользователя
 * @returns {string} - Токен авторизации
 */
function generateTestToken(email) {
  return Buffer.from(JSON.stringify({ 
    email, 
    role: 'superadmin',
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 часа
  })).toString('base64');
}

module.exports = {
  authMiddleware,
  isAuthorizedUser,
  isAdminRoute,
  generateTestToken
};


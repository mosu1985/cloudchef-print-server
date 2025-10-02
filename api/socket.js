/**
 * CloudChef Print Server - Vercel WebSocket Handler
 * Маршрутизация команд между веб-приложением и агентами принтера
 */

const { Server } = require('socket.io');
const cors = require('cors');

// 🗄️ In-memory хранилище подключений (в продакшене можно заменить на Redis)
const connections = new Map(); // код -> { browser, agent, metadata }
const agents = new Map();      // socketId -> agentInfo
const browsers = new Map();    // socketId -> browserInfo

// 🎯 Генерация уникального ID подключения
function generateConnectionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 📊 Логирование с временными метками
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, 
              Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '');
}

module.exports = async (req, res) => {
  // 🔧 CORS настройки для всех источников
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 🚀 Инициализация Socket.IO сервера
  if (!res.socket.server.io) {
    log('info', '🚀 Инициализация CloudChef Print Server...');
    
    const io = new Server(res.socket.server, {
      path: '/socket.io',
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: false
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // 📡 Обработка новых подключений
    io.on('connection', (socket) => {
      const connectionId = generateConnectionId();
      log('info', '🔌 Новое подключение', { 
        socketId: socket.id, 
        connectionId,
        address: socket.handshake.address 
      });

      // 🎯 РЕГИСТРАЦИЯ АГЕНТА ПРИНТЕРА
      socket.on('register_agent', (data) => {
        let { code, printerInfo = {}, version = 'unknown' } = data;
        
        if (typeof code === 'string') {
          code = code.trim().toUpperCase();
        }

        if (!code || !/^[A-Z0-9]{8}$/.test(code)) {
          socket.emit('error', { 
            type: 'INVALID_CODE', 
            message: 'Код должен содержать 8 символов (буквы и цифры)' 
          });
          return;
        }

        log('info', '🖨️ Регистрация агента принтера', {
          socketId: socket.id,
          code,
          printerInfo,
          version
        });

        // Сохраняем информацию об агенте
        const agentInfo = {
          socketId: socket.id,
          code,
          printerInfo,
          version,
          status: 'connected',
          connectedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };

        agents.set(socket.id, agentInfo);

        // Обновляем связку code -> connections
        const connection = connections.get(code) || {};
        connection.agent = socket;
        connection.agentInfo = agentInfo;
        connections.set(code, connection);

        // Уведомляем агента о успешной регистрации
        socket.emit('registered', {
          status: 'success',
          message: 'Агент зарегистрирован успешно',
          connectionId,
          code
        });

        // Если браузер уже подключен с этим кодом - уведомляем его
        if (connection.browser) {
          connection.browser.emit('agent_connected', {
            code,
            agentInfo: {
              printerName: printerInfo.name || 'Неизвестный принтер',
              printerStatus: printerInfo.status || 'ready',
              version
            },
            connectedAt: agentInfo.connectedAt
          });
          
          log('info', '✅ Браузер уведомлён о подключении агента', { code });
        }
      });

      // 🌐 РЕГИСТРАЦИЯ ВЕБ-БРАУЗЕРА  
      socket.on('register_browser', (data) => {
        let { code, userInfo = {} } = data;
        
        if (typeof code === 'string') {
          code = code.trim().toUpperCase();
        }

        if (!code || !/^[A-Z0-9]{8}$/.test(code)) {
          socket.emit('error', { 
            type: 'INVALID_CODE', 
            message: 'Код должен содержать 8 символов (буквы и цифры)' 
          });
          return;
        }

        log('info', '🌐 Регистрация веб-браузера', {
          socketId: socket.id,
          code,
          userInfo
        });

        const browserInfo = {
          socketId: socket.id,
          code,
          userInfo,
          status: 'connected',
          connectedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };

        browsers.set(socket.id, browserInfo);

        // Обновляем связку code -> connections
        const connection = connections.get(code) || {};
        connection.browser = socket;
        connection.browserInfo = browserInfo;
        connections.set(code, connection);

        // Уведомляем браузер о успешной регистрации
        socket.emit('registered', {
          status: 'success',
          message: 'Браузер зарегистрирован успешно',
          connectionId,
          code
        });

        // Если агент уже подключен с этим кодом - отправляем статус
        if (connection.agent && connection.agentInfo) {
          socket.emit('agent_connected', {
            code,
            agentInfo: {
              printerName: connection.agentInfo.printerInfo.name || 'Неизвестный принтер',
              printerStatus: connection.agentInfo.printerInfo.status || 'ready',
              version: connection.agentInfo.version
            },
            connectedAt: connection.agentInfo.connectedAt
          });

          log('info', '✅ Браузер получил статус подключенного агента', { code });
        } else {
          // Агент не подключен
          socket.emit('agent_disconnected', {
            code,
            message: 'Агент принтера не подключен'
          });
        }
      });

      // 🖨️ КОМАНДА ПЕЧАТИ ОТ БРАУЗЕРА
      socket.on('print_command', (data) => {
        const browserInfo = browsers.get(socket.id);
        
        if (!browserInfo) {
          socket.emit('error', { 
            type: 'NOT_REGISTERED', 
            message: 'Браузер не зарегистрирован' 
          });
          return;
        }

        const connection = connections.get(browserInfo.code);
        
        if (!connection || !connection.agent) {
          socket.emit('print_error', { 
            type: 'AGENT_OFFLINE', 
            message: 'Агент принтера не подключен',
            code: browserInfo.code 
          });
          return;
        }

        log('info', '🖨️ Команда печати от браузера', {
          code: browserInfo.code,
          labelData: data.labelData ? 'присутствует' : 'отсутствует',
          jobId: data.jobId
        });

        // Пересылаем команду печати агенту
        connection.agent.emit('print_job', {
          jobId: data.jobId || `job_${Date.now()}`,
          labelData: data.labelData,
          settings: data.settings || {},
          priority: data.priority || 'normal',
          timestamp: new Date().toISOString(),
          from: 'browser'
        });

        // Подтверждаем браузеру, что команда отправлена
        socket.emit('print_sent', {
          jobId: data.jobId,
          message: 'Команда печати отправлена агенту',
          timestamp: new Date().toISOString()
        });
      });

      // ✅ РЕЗУЛЬТАТ ПЕЧАТИ ОТ АГЕНТА
      socket.on('print_result', (data) => {
        const agentInfo = agents.get(socket.id);
        
        if (!agentInfo) {
          log('warn', '❌ Результат печати от незарегистрированного агента', { socketId: socket.id });
          return;
        }

        const connection = connections.get(agentInfo.code);
        
        if (connection && connection.browser) {
          // Пересылаем результат браузеру
          connection.browser.emit('print_result', {
            jobId: data.jobId,
            status: data.status, // 'success', 'error', 'cancelled'
            message: data.message,
            timestamp: data.timestamp || new Date().toISOString()
          });

          log('info', '✅ Результат печати переслан браузеру', {
            code: agentInfo.code,
            jobId: data.jobId,
            status: data.status
          });
        }
      });

      // 💓 KEEP-ALIVE от агента
      socket.on('agent_heartbeat', (data) => {
        const agentInfo = agents.get(socket.id);
        if (agentInfo) {
          agentInfo.lastSeen = new Date().toISOString();
          agentInfo.printerInfo = { ...agentInfo.printerInfo, ...data.printerInfo };
          
          // Уведомляем браузер об обновлении статуса
          const connection = connections.get(agentInfo.code);
          if (connection && connection.browser) {
            connection.browser.emit('agent_status_update', {
              code: agentInfo.code,
              printerInfo: agentInfo.printerInfo,
              lastSeen: agentInfo.lastSeen
            });
          }
        }
      });

      // 🔌 ОТКЛЮЧЕНИЕ
      socket.on('disconnect', (reason) => {
        log('info', '🔌 Отключение', { 
          socketId: socket.id, 
          reason 
        });

        // Поиск и очистка агента
        const agentInfo = agents.get(socket.id);
        if (agentInfo) {
          agents.delete(socket.id);
          
          const connection = connections.get(agentInfo.code);
          if (connection) {
            connection.agent = null;
            connection.agentInfo = null;
            
            // Уведомляем браузер об отключении агента
            if (connection.browser) {
              connection.browser.emit('agent_disconnected', {
                code: agentInfo.code,
                message: 'Агент принтера отключился',
                reason
              });
            }
            
            // Если нет подключенных клиентов - удаляем связку
            if (!connection.browser) {
              connections.delete(agentInfo.code);
            }
          }
          
          log('info', '🖨️ Агент принтера удален', { 
            code: agentInfo.code, 
            socketId: socket.id 
          });
        }

        // Поиск и очистка браузера
        const browserInfo = browsers.get(socket.id);
        if (browserInfo) {
          browsers.delete(socket.id);
          
          const connection = connections.get(browserInfo.code);
          if (connection) {
            connection.browser = null;
            connection.browserInfo = null;
            
            // Если нет подключенных клиентов - удаляем связку
            if (!connection.agent) {
              connections.delete(browserInfo.code);
            }
          }
          
          log('info', '🌐 Браузер удален', { 
            code: browserInfo.code, 
            socketId: socket.id 
          });
        }
      });

      // ❌ ОБРАБОТКА ОШИБОК
      socket.on('error', (error) => {
        log('error', '❌ Ошибка сокета', { 
          socketId: socket.id, 
          error: error.message,
          stack: error.stack
        });
      });
    });

    // 📊 Статистика каждые 30 секунд
    setInterval(() => {
      log('info', '📊 Статистика сервера', {
        connections: connections.size,
        agents: agents.size,
        browsers: browsers.size,
        uptime: process.uptime()
      });
    }, 30000);

    res.socket.server.io = io;
    log('info', '✅ CloudChef Print Server запущен');
  }

  res.end();
};




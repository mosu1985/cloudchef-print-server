# 🔌 Интеграция генерации токенов агента

## API Endpoint для генерации токенов

### POST /api/generate-agent-token

Генерирует новый токен аутентификации для агента печати.

#### Request

```http
POST /api/generate-agent-token
Content-Type: application/json

{
  "restaurantCode": "A1B2C3D4"
}
```

**Параметры:**
- `restaurantCode` (string, обязательный) - Код ресторана (8 символов, A-Z и 0-9)

#### Response (Success)

```json
{
  "success": true,
  "agentToken": "agent_A1B2C3D4_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "restaurantCode": "A1B2C3D4",
  "generatedAt": "2025-10-07T12:00:00.000Z",
  "expiresAt": null,
  "message": "Токен успешно сгенерирован"
}
```

#### Response (Error)

```json
{
  "error": "Неверный формат кода",
  "message": "Код ресторана должен содержать 8 символов (буквы A-Z и цифры 0-9)"
}
```

**Коды ошибок:**
- `400 Bad Request` - Неверный формат кода или отсутствует restaurantCode

---

## Интеграция в веб-приложение CloudChef

### Пример React компонента

```typescript
import React, { useState } from 'react';

interface AgentTokenGeneratorProps {
  restaurantCode: string;
}

export const AgentTokenGenerator: React.FC<AgentTokenGeneratorProps> = ({ restaurantCode }) => {
  const [agentToken, setAgentToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateToken = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://cloudchef-print-server.onrender.com/api/generate-agent-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ restaurantCode }),
      });

      const data = await response.json();

      if (data.success) {
        setAgentToken(data.agentToken);
      } else {
        setError(data.message || 'Ошибка генерации токена');
      }
    } catch (err) {
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(agentToken);
    alert('Токен скопирован в буфер обмена');
  };

  return (
    <div className="agent-token-generator">
      <h3>🔑 Токен агента печати</h3>
      
      {!agentToken ? (
        <button onClick={generateToken} disabled={loading}>
          {loading ? '⏳ Генерация...' : '🔑 Сгенерировать токен'}
        </button>
      ) : (
        <div>
          <input 
            type="text" 
            value={agentToken} 
            readOnly 
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
          <button onClick={copyToClipboard}>
            📋 Копировать
          </button>
          <button onClick={() => setAgentToken('')}>
            🔄 Создать новый
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="help-text">
        <p>
          ℹ️ Скопируйте токен и вставьте его в CloudChef Print Agent 
          для подключения агента печати к ресторану.
        </p>
      </div>
    </div>
  );
};
```

### Пример использования в странице настроек

```tsx
// В компоненте AgentSettings или аналогичном

import { AgentTokenGenerator } from './components/AgentTokenGenerator';

export const AgentSettings = () => {
  const { restaurantCode } = useRestaurantContext(); // Получаем код ресторана из контекста

  return (
    <div className="agent-settings">
      <h2>Настройка агента печати</h2>
      
      <div className="restaurant-code">
        <label>Код ресторана:</label>
        <input type="text" value={restaurantCode} readOnly />
      </div>

      <AgentTokenGenerator restaurantCode={restaurantCode} />

      <div className="instructions">
        <h3>Инструкция по подключению:</h3>
        <ol>
          <li>Сгенерируйте токен агента (кнопка выше)</li>
          <li>Скопируйте токен в буфер обмена</li>
          <li>Откройте CloudChef Print Agent на компьютере с принтером</li>
          <li>Вставьте код ресторана и токен</li>
          <li>Нажмите "Подключиться"</li>
        </ol>
      </div>
    </div>
  );
};
```

---

## Безопасность

### Рекомендации

1. **Хранение токенов:**
   - Токены должны храниться в безопасном месте
   - В будущем можно добавить базу данных для хранения токенов

2. **Регенерация токенов:**
   - Позвольте пользователям регенерировать токены при необходимости
   - Старые токены должны быть инвалидированы при генерации новых (будет добавлено в будущем)

3. **Ограничения:**
   - Rate limiting уже встроен в WebSocket middleware
   - Максимум 10 подключений в минуту с одного IP

---

## Формат токена

```
agent_<RESTAURANT_CODE>_<RANDOM_KEY>
```

- `RESTAURANT_CODE` - 8 символов (A-Z, 0-9)
- `RANDOM_KEY` - 32 hex символа (a-f, 0-9)

**Regex для валидации:**
```javascript
/^agent_([A-Z0-9]{8})_([a-f0-9]{32})$/
```

---

## Roadmap (будущие улучшения)

- [ ] База данных для хранения токенов
- [ ] Инвалидация старых токенов
- [ ] Срок действия токенов (expiration)
- [ ] Аудит использования токенов
- [ ] Ограничение количества активных токенов на ресторан
- [ ] История генерации токенов

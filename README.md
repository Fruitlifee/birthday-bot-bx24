# BirthdayBot для Bitrix24

Автоматические напоминания и поздравления с днём рождения через GitHub Actions. Бесплатно, 24/7.

## Как работает

GitHub запускает скрипт каждый час. При совпадении с настроенным временем:
1. Загружает контакты с BIRTHDATE из Bitrix24
2. Создаёт напоминания сотрудникам (задача / уведомление / дело)
3. Отправляет поздравление клиенту (через открытые линии Wazzup/ChatApp или CRM-комментарий)

## Портал

- b24-n5yvoa.bitrix24.kz
- Вебхук: rest/7/f9hvzhp840rcfsvl

## Настройки (Settings - Secrets and variables - Actions)

**Secret:** BITRIX_WEBHOOK = URL вебхука

**Variables:**
- TIMEZONE_OFFSET = 5
- REMINDER_ENABLED = true
- REMINDER_TYPES = task,notification
- REMINDER_OFFSET_DAYS = 0
- REMINDER_TIME = 09:00
- REMINDER_RESPONSIBLE_ID = 1
- MESSAGE_ENABLED = true
- MESSAGE_TEXT = Дорогой(ая) {NAME}, поздравляем с днём рождения!
- MESSAGE_OFFSET_DAYS = 0
- MESSAGE_TIME = 10:00

## Запустить вручную

Actions - BirthdayBot - Run workflow - Force run: true

## WhatsApp

Если клиент писал через Wazzup или ChatApp - сообщение уйдёт через WhatsApp.
Если нет - добавится комментарием в карточку контакта.

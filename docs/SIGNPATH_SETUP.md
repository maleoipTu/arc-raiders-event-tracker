# Подготовка подписи Windows через SignPath Foundation

## Статус

MIT-лицензия, публичная политика подписи и описание сетевых подключений
подготовлены. Заявка заполняется на https://signpath.org/apply .
Windows EXE пока не подписан сертификатом SignPath. Подготовка документов
не означает принятие проекта в программу.

## Данные проекта для заявки

- Project Name: ARC Event Tracker
- Repository / Homepage: https://github.com/maleoipTu/arc-raiders-event-tracker
- Download page: https://github.com/maleoipTu/arc-raiders-event-tracker#readme
- Privacy Policy: https://github.com/maleoipTu/arc-raiders-event-tracker/blob/main/PRIVACY.md
- Code signing policy: https://github.com/maleoipTu/arc-raiders-event-tracker/blob/main/CODE_SIGNING_POLICY.md
- Category: Gaming
- Maintainer Type: Individual maintainer(s)
- Build System: GitHub Actions

Проект новый. Не следует заявлять о большой аудитории, СМИ или доверии сообщества,
если подтверждения отсутствуют. Наличие исходников и релиза не гарантирует
одобрение SignPath. Требуются также проверка прав на компоненты и соответствие
остальным условиям программы. MIT-лицензия собственного кода не меняет лицензии
игровых материалов и сторонних компонентов.

## Что заполняет владелец

В форме нужны имя, фамилия и email для учётной записи SignPath. Владелец
ознакомляется с Code of Conduct и согласием на обработку данных, отмечает
обязательные согласия и отправляет заявку. Необязательная рекламная рассылка
для заявки не нужна. Личные сведения не добавляются в репозиторий.

## После одобрения

1. Включить MFA в GitHub и SignPath. Подключить к SignPath только этот репозиторий
   с разрешениями, которые согласованы владельцем.
2. Получить реальный Organization ID, Project slug, Artifact configuration slug
   и Signing policy slug. Токен submitter сохранить в GitHub Actions secret
   `SIGNPATH_API_TOKEN`; идентификаторы — в repository variables.
3. Настроить разрешённые имена файлов и проверку метаданных. Нельзя отправлять
   на подпись ARC Tracker Link, оригинальные игры, чужие EXE или Android keystore.
4. Интегрировать двухэтапную подпись в GitHub-hosted сборку: сначала собственный
   Windows EXE, затем построенный из него NSIS-установщик. Оба кандидата должны
   сначала загружаться как GitHub Actions artifacts для проверки происхождения.
5. Каждый production signing request вручную одобряет владелец. После получения
   результата проверить Authenticode и timestamp; указать фактического издателя
   сертификата для проверки подписей в electron-updater.
6. Пересчитать SHA-512, размер и blockmap **после** финальной подписи установщика.
   Затем выпустить новую версию с проверенными метаданными обновления. Не заменять
   старый EXE отдельно от его updater-файлов и не выдавать unsigned build за signed.

До получения настоящих идентификаторов и одобрения не добавляются фиктивные
секреты, не включается автоматическая подпись и не публикуется подписанный релиз.

Официальная документация: https://docs.signpath.io/trusted-build-systems/github
и условия программы: https://signpath.org/terms .

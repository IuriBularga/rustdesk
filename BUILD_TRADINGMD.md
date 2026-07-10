# Сборка TradingMD Remote

Форк RustDesk для Trading.md: клиент работает **только как хост** (принимает
входящие подключения) и жёстко привязан к серверу `<RENDEZVOUS_SERVER>`.

## Сервер и ключ

Адрес rendezvous/relay-сервера и его публичный ключ зашиваются в бинарник **на
этапе сборки** через переменные окружения (`option_env!` в
`libs/hbb_common/src/config.rs`):

| Переменная          | Значение по умолчанию (прошито)                |
|---------------------|------------------------------------------------|
| `RENDEZVOUS_SERVER` | `<RENDEZVOUS_SERVER>`                            |
| `RS_PUB_KEY`        | `<RS_PUB_KEY>` |

Если переменные не заданы, используются значения Trading.md из таблицы, так
что обычная сборка уже привязана к нашему серверу. Задавать их нужно только
для сборки под другой сервер (например, тестовый):

```bash
# bash
export RENDEZVOUS_SERVER=test.trading.md
export RS_PUB_KEY=<публичный ключ тестового сервера>
```

```powershell
# PowerShell
$env:RENDEZVOUS_SERVER = "test.trading.md"
$env:RS_PUB_KEY = "<ключ>"
```

`libs/hbb_common/build.rs` объявляет `rerun-if-env-changed`, поэтому смена
переменных автоматически вызывает пересборку.

Дополнительно, в рантайме опции `custom-rendezvous-server`, `relay-server`,
`api-server` и `key` жёстко перекрыты пустыми значениями
(`OVERWRITE_SETTINGS` в `config.rs`): даже если пользователь пропишет свой
сервер в конфиг-файл или импортирует его (QR/deep link), значение будет
проигнорировано, а UI «ID/Relay Server» скрыт (`hide-server-settings=Y` в
`BUILTIN_SETTINGS`).

## ВАЖНО: сабмодуль hbb_common

`libs/hbb_common` — git-сабмодуль. Наши изменения (имя приложения, привязка к
серверу) лежат в нём на локальной ветке `tradingmd`. Перед пушем основного
репозитория нужно:

1. Сделать форк https://github.com/rustdesk/hbb_common (например,
   `IuriBularga/hbb_common`).
2. Запушить ветку: `cd libs/hbb_common && git push <fork-url> tradingmd`.
3. Обновить URL в `.gitmodules` на форк и закоммитить.

Без этого CI и другие машины не смогут получить закоммиченный SHA сабмодуля.

## Windows (desktop, Flutter UI)

Требования (версии — как в `.github/workflows/flutter-build.yml`):

- Rust **1.75** (`rustup toolchain install 1.75`), target `x86_64-pc-windows-msvc`
- Flutter **3.24.5**
- Python 3, LLVM **15.0.6**, Visual Studio Build Tools (C++)
- vcpkg, commit `120deac3062162151622ca4860575a33844ba10b`:

```powershell
git clone https://github.com/microsoft/vcpkg C:\vcpkg
git -C C:\vcpkg checkout 120deac3062162151622ca4860575a33844ba10b
C:\vcpkg\bootstrap-vcpkg.bat
$env:VCPKG_ROOT = "C:\vcpkg"
C:\vcpkg\vcpkg install --triplet x64-windows-static --x-install-root C:\vcpkg\installed
```

Генерация моста Flutter⟷Rust (однократно после клонирования / изменения API):

```powershell
cargo install flutter_rust_bridge_codegen --version 1.80.1 --features uuid
cd flutter ; flutter pub get ; cd ..
flutter_rust_bridge_codegen --rust-input ./src/flutter_ffi.rs --dart-output ./flutter/lib/generated_bridge.dart
```

Сборка:

```powershell
python3 .\build.py --portable --flutter --hwcodec
```

Результат: `flutter\build\windows\x64\runner\Release\` (портативная папка,
exe называется `tradingmd-remote.exe`) и самораспаковывающийся установщик
`tradingmd-remote-<версия>-install.exe`.

MSI-инсталлятор (WiX v4, после сборки Flutter-версии):

```powershell
mv .\flutter\build\windows\x64\runner\Release .\rustdesk
mv .\rustdesk\tradingmd-remote.exe ".\rustdesk\TradingMD Remote.exe"
cd res\msi
python preprocess.py --arp -d ..\..\rustdesk   # app-name по умолчанию "TradingMD Remote"
nuget restore msi.sln
msbuild msi.sln -p:Configuration=Release -p:Platform=x64 /p:TargetVersion=Windows10
```

## macOS (без Apple Developer аккаунта)

Требования: Xcode + command line tools, Rust **1.81** (`MAC_RUST_VERSION`),
Flutter 3.24.5, `brew install llvm create-dmg pkg-config`, NASM 2.16.x, vcpkg.

Переменные окружения — те же, что и везде:

```bash
export RENDEZVOUS_SERVER=<RENDEZVOUS_SERVER>      # опционально, уже прошито
export RS_PUB_KEY='<RS_PUB_KEY>'
./build.py --flutter --hwcodec --unix-file-copy-paste   # + --screencapturekit на Apple Silicon
```

Сборка даёт `flutter/build/macos/Build/Products/Release/TradingMD Remote.app`
(bundle id `md.trading.remote`).

### Подпись: только ad-hoc

Apple Developer аккаунта нет, поэтому:

- в `.github/workflows/flutter-build.yml` **удалены** шаги
  `import-codesign-certs`, импорт notarize-ключа, установка `rcodesign`,
  Developer-ID `codesign` и `notary-submit --staple`;
- вместо них применяется **ad-hoc подпись**:

  ```bash
  codesign --force --deep --sign - "TradingMD Remote.app"
  ```

- артефакты: `tradingmd-remote-<версия>-aarch64.dmg` (Apple Silicon) и
  `tradingmd-remote-<версия>-x86_64.dmg` (Intel);
- переменные `RENDEZVOUS_SERVER` / `RS_PUB_KEY` в macOS-джобе берутся из
  `secrets` (если секреты не заданы, используются значения из `config.rs`).

Следствие: приложение **не нотаризовано**, при первом запуске macOS покажет
предупреждение Gatekeeper. Инструкция для клиентов — `INSTALL_MACOS_RU.md`.

### Когда появится Apple Developer аккаунт

Нужно вернуть в macOS-джобу `.github/workflows/flutter-build.yml`
(см. историю git до коммита «macos: ...»):

1. Шаг `apple-actions/import-codesign-certs` с секретами `MACOS_P12_BASE64`,
   `MACOS_P12_PASSWORD` и глобальную env-переменную `MACOS_P12_BASE64` (её
   отсутствие использовалось как условие `if:` для шагов подписи).
2. Импорт notarize-ключа (`MACOS_NOTARIZE_JSON`) и установку `rcodesign`.
3. Заменить ad-hoc подпись на:
   `codesign --force --options runtime -s "$MACOS_CODESIGN_IDENTITY" --deep --strict "TradingMD Remote.app"`
   (обязательно `--options runtime` — hardened runtime требуется для нотаризации).
4. Добавить `rcodesign notary-submit --api-key-path <key.json> --staple <dmg>`.
5. Убрать из `INSTALL_MACOS_RU.md` разделы про предупреждение Gatekeeper и
   `xattr -cr` — они станут не нужны.

## Быстрая проверка без полной сборки

```bash
# Rust (не требует vcpkg только для hbb_common):
cargo check -p hbb_common

# Полный check требует vcpkg (vpx/yuv/opus/aom):
$env:VCPKG_ROOT = "C:\vcpkg"; cargo check

# Flutter (требует сгенерированный generated_bridge.dart):
cd flutter && flutter analyze
```

## CI (GitHub Actions)

`.github/workflows/flutter-build.yml` собирает Windows/macOS/Linux/Android.
Значения сервера/ключа прошиты в исходниках; при необходимости их можно
переопределить, экспортировав `RENDEZVOUS_SERVER`/`RS_PUB_KEY` в env
соответствующей джобы (для macOS уже сделано через `secrets`, см. раздел
macOS ниже).

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

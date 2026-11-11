@echo off
rem Builds the native app from the short drive M: (native builds hit the 260-character path limit
rem under "D:\SHUVO SOFTWARE\MUN Platform"). Usage: build.cmd [gradle tasks]   (default: assembleRelease)
if not exist M:\ subst M: "%~dp0.."
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "TASKS=%*"
if "%TASKS%"=="" set "TASKS=assembleRelease"
pushd M:\android-native
call M:\android-native\gradlew.bat %TASKS% --console=plain
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%

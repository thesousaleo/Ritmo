#!/usr/bin/env python3
"""Injeta o plugin nativo do Ritmo no projeto Android gerado pelo Capacitor (rodado no CI depois de `cap add android`)."""
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'android-plugin'
APP = ROOT / 'android' / 'app'
PKG_DIR = APP / 'src' / 'main' / 'java' / 'io' / 'github' / 'thesousaleo' / 'ritmo'
RES = APP / 'src' / 'main' / 'res'
MANIFEST = APP / 'src' / 'main' / 'AndroidManifest.xml'
GRADLE = APP / 'build.gradle'

# 1. Código Java e recursos
PKG_DIR.mkdir(parents=True, exist_ok=True)
for f in (SRC / 'java').glob('*.java'):
    shutil.copy(f, PKG_DIR / f.name)
for f in (SRC / 'res').rglob('*'):
    if f.is_file():
        dest = RES / f.relative_to(SRC / 'res')
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(f, dest)

# 2. Manifesto
m = MANIFEST.read_text()
perms = [
    'USE_BIOMETRIC', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION',
    'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'SCHEDULE_EXACT_ALARM', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED',
]
for p in perms:
    if f'android.permission.{p}' not in m:
        m = m.replace('</manifest>', f'    <uses-permission android:name="android.permission.{p}" />\n</manifest>')

# O lançador sai da MainActivity e vai para aliases (um por ícone)
launcher = re.compile(r'\s*<intent-filter>\s*<action android:name="android.intent.action.MAIN"\s*/>\s*<category android:name="android.intent.category.LAUNCHER"\s*/>\s*</intent-filter>', re.S)
m, n = launcher.subn('', m, count=1)
if n != 1:
    raise SystemExit('Não achei o intent-filter LAUNCHER no AndroidManifest.xml')

def alias(name, icon, enabled):
    round_icon = f' android:roundIcon="{icon}_round"' if icon == '@mipmap/ic_launcher' else ''
    return f'''
        <activity-alias
            android:name=".{name}"
            android:targetActivity=".MainActivity"
            android:enabled="{'true' if enabled else 'false'}"
            android:exported="true"
            android:icon="{icon}"{round_icon}
            android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>'''

extra = ''.join([
    alias('IconDefault', '@mipmap/ic_launcher', True),
    alias('IconDark', '@mipmap/ic_alt_dark', False),
    alias('IconMint', '@mipmap/ic_alt_mint', False),
    alias('IconSand', '@mipmap/ic_alt_sand', False),
    '''
        <receiver android:name=".RitmoWidget" android:exported="false" android:label="Ritmo">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/ritmo_widget_info" />
        </receiver>
        <receiver android:name=".GeofenceReceiver" android:exported="false" />
        <receiver android:name=".BootReceiver" android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>
''',
])
m = m.replace('</application>', extra + '\n    </application>', 1)
MANIFEST.write_text(m)

# 3. Dependências
g = GRADLE.read_text()
g += '''

dependencies {
    implementation "androidx.biometric:biometric:1.1.0"
    implementation "com.google.android.gms:play-services-location:21.3.0"
}
'''
GRADLE.write_text(g)
print('Plugin nativo injetado:', sorted(p.name for p in PKG_DIR.glob('*.java')))

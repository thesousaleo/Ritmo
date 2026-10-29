package io.github.thesousaleo.ritmo;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.view.Window;

import androidx.activity.result.ActivityResult;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.ArrayList;
import java.util.concurrent.Executor;

@CapacitorPlugin(
    name = "RitmoNative",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
    }
)
public class RitmoNativePlugin extends Plugin {

    static final String PREFS = "ritmo_native";
    static final String[] ICONS = { "default", "dark", "mint", "sand" };
    static final String[] ALIASES = { ".IconDefault", ".IconDark", ".IconMint", ".IconSand" };

    /* ---------------- digital / rosto ---------------- */
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void biometricAvailable(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject ret = new JSObject();
        ret.put("available", r == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        final String title = call.getString("title", "Ritmo");
        final String subtitle = call.getString("subtitle", "Desbloquear");
        getActivity().runOnUiThread(() -> {
            try {
                Executor ex = ContextCompat.getMainExecutor(getContext());
                BiometricPrompt prompt = new BiometricPrompt((FragmentActivity) getActivity(), ex, new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        call.resolve(ret);
                    }

                    @Override
                    public void onAuthenticationError(int code, CharSequence msg) {
                        JSObject ret = new JSObject();
                        ret.put("ok", false);
                        ret.put("error", String.valueOf(msg));
                        call.resolve(ret);
                    }
                });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .build();
                prompt.authenticate(info);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("ok", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    /* ---------------- ícone alternativo ---------------- */
    @PluginMethod
    public void setAppIcon(PluginCall call) {
        String name = call.getString("name", "default");
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        int chosen = 0;
        for (int i = 0; i < ICONS.length; i++) if (ICONS[i].equals(name)) chosen = i;
        // Liga o novo antes de desligar os outros: sempre existe um ícone na tela inicial
        pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ALIASES[chosen]), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (int i = 0; i < ALIASES.length; i++) {
            if (i == chosen) continue;
            pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ALIASES[i]), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
        call.resolve();
    }

    /* ---------------- ditado por voz ---------------- */
    @PluginMethod
    public void listen(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "pt-BR"));
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Diga a tarefa"));
        try {
            startActivityForResult(call, intent, "onSpeech");
        } catch (ActivityNotFoundException e) {
            call.reject("Reconhecimento de voz indisponível neste aparelho");
        }
    }

    @ActivityCallback
    private void onSpeech(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String text = "";
        Intent data = result.getData();
        if (data != null) {
            ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (matches != null && !matches.isEmpty()) text = matches.get(0);
        }
        JSObject ret = new JSObject();
        ret.put("text", text);
        call.resolve(ret);
    }

    /* ---------------- lugares (geofence) ---------------- */
    @PluginMethod
    public void setGeofences(PluginCall call) {
        JSArray fences = call.getArray("fences", new JSArray());
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("fences", fences.toString()).apply();
        if (fences.length() == 0) {
            GeofenceReceiver.register(getContext());
            call.resolve();
            return;
        }
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "onLocationForFences");
            return;
        }
        afterFineLocation(call);
    }

    @PermissionCallback
    private void onLocationForFences(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Permissão de localização negada");
            return;
        }
        afterFineLocation(call);
    }

    private void afterFineLocation(PluginCall call) {
        // Android 10+: lembrar ao chegar com o app fechado precisa de "permitir o tempo todo"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (!sp.getBoolean("askedBackground", false)) {
                sp.edit().putBoolean("askedBackground", true).apply();
                getActivity().requestPermissions(new String[] { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, 7341);
            }
        }
        boolean ok = GeofenceReceiver.register(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void currentPosition(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "onLocationForPosition");
            return;
        }
        readPosition(call);
    }

    @PermissionCallback
    private void onLocationForPosition(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Permissão de localização negada");
            return;
        }
        readPosition(call);
    }

    @SuppressWarnings("MissingPermission")
    private void readPosition(PluginCall call) {
        try {
            CurrentLocationRequest req = new CurrentLocationRequest.Builder().setPriority(Priority.PRIORITY_HIGH_ACCURACY).setMaxUpdateAgeMillis(60000).build();
            LocationServices.getFusedLocationProviderClient(getContext())
                .getCurrentLocation(req, null)
                .addOnSuccessListener(loc -> {
                    if (loc == null) {
                        call.reject("Sem localização");
                        return;
                    }
                    JSObject ret = new JSObject();
                    ret.put("lat", loc.getLatitude());
                    ret.put("lng", loc.getLongitude());
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> call.reject(e.getMessage()));
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /* ---------------- diagnóstico de lembretes ---------------- */
    @PluginMethod
    public void diagnostics(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            exact = am != null && am.canScheduleExactAlarms();
        }
        ret.put("exactAlarms", exact);
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        ret.put("ignoringBattery", pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        boolean channel = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        if (channel && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel ch = nm != null ? nm.getNotificationChannel("lembretes") : null;
            if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) channel = false;
        }
        ret.put("channelEnabled", channel);
        call.resolve(ret);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(i);
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    /* ---------------- barra de navegação ---------------- */
    /** Pinta a barra de navegação (gestos ou botões) com a cor do tema; ícones claros no tema escuro. */
    @PluginMethod
    public void setNavigationBar(PluginCall call) {
        final String color = call.getString("color", "#ECEFE9");
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            try {
                paintNavigationBar(getActivity().getWindow(), Color.parseColor(color), dark);
            } catch (Exception ignored) {
            }
            call.resolve();
        });
    }

    static void paintNavigationBar(Window window, int color, boolean dark) {
        window.setNavigationBarColor(color);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) window.setNavigationBarDividerColor(color);
        // Sem o véu translúcido que o Android 10+ põe sobre a barra de gestos
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.setNavigationBarContrastEnforced(false);
        new WindowInsetsControllerCompat(window, window.getDecorView()).setAppearanceLightNavigationBars(!dark);
    }

    /* ---------------- widget ---------------- */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        String json = call.getString("json", "{}");
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("widget", json).apply();
        RitmoWidget.updateAll(getContext());
        call.resolve();
    }
}

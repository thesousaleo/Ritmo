package io.github.thesousaleo.ritmo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Depois de reiniciar o aparelho, as cercas dos lugares precisam ser registradas de novo. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            GeofenceReceiver.register(ctx);
            RitmoWidget.updateAll(ctx);
        }
    }
}

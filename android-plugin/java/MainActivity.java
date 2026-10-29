package io.github.thesousaleo.ritmo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin próprio do Ritmo (widget, ícone, digital, voz, lugares e diagnóstico)
        registerPlugin(RitmoNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

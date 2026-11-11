package com.munpro.app.data

// Is the phone online? The RN app asked expo-network; here the OS's ConnectivityManager answers.
// Unknown counts as online (the RN rule): only say "offline" when the OS says so.

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class NetworkMonitor(context: Context) {
    private val cm = context.getSystemService(ConnectivityManager::class.java)
    private val _online = MutableStateFlow(current())
    val online: StateFlow<Boolean> = _online.asStateFlow()

    /** Bumps on every real change of network (reconnect, or a different kind of network). */
    private val _changes = MutableStateFlow(0)
    val changes: StateFlow<Int> = _changes.asStateFlow()
    private var lastTransport: Int? = null

    init {
        val request = NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build()
        cm.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = refresh()
            override fun onLost(network: Network) = refresh()
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = refresh()
        })
    }

    private fun refresh() {
        val was = _online.value
        val now = current()
        val transport = transport()
        if (now && (!was || (lastTransport != null && transport != lastTransport))) _changes.value++
        lastTransport = transport
        _online.value = now
    }

    private fun current(): Boolean {
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun transport(): Int? {
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return null
        return listOf(NetworkCapabilities.TRANSPORT_WIFI, NetworkCapabilities.TRANSPORT_CELLULAR, NetworkCapabilities.TRANSPORT_ETHERNET)
            .firstOrNull { caps.hasTransport(it) }
    }

    fun isOnline(): Boolean = current()
}

package com.mypes.vinto.sync

import android.content.Context

object AuthSession {
    private const val PREFERENCES = "mypes_auth"
    private const val ACCESS_TOKEN = "access_token"
    private const val REFRESH_TOKEN = "refresh_token"
    private const val CATALOG_SYNC_TIMESTAMP = "catalog_sync_timestamp"

    fun token(context: Context): String? =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(ACCESS_TOKEN, null)

    fun saveToken(context: Context, token: String, refreshToken: String? = null) {
        val editor = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(ACCESS_TOKEN, token)
        if (!refreshToken.isNullOrBlank()) editor.putString(REFRESH_TOKEN, refreshToken)
        editor.apply()
    }

    fun refreshToken(context: Context): String? =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(REFRESH_TOKEN, null)

    fun lastCatalogSync(context: Context): Long =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getLong(CATALOG_SYNC_TIMESTAMP, 0L)

    fun saveLastCatalogSync(context: Context, timestamp: Long) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putLong(CATALOG_SYNC_TIMESTAMP, timestamp)
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .remove(ACCESS_TOKEN)
            .remove(REFRESH_TOKEN)
            .apply()
    }
}

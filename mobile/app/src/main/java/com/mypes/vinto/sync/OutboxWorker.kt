package com.mypes.vinto.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.mypes.vinto.data.MypesDatabase
import com.mypes.vinto.data.Producto
import com.mypes.vinto.network.LearningFeedbackRequest
import com.mypes.vinto.network.VoiceCorrection
import com.mypes.vinto.network.ApiClient
import com.mypes.vinto.network.RefreshRequest
import com.mypes.vinto.network.dto.ProductUpsertItem
import com.mypes.vinto.network.dto.ProductUpsertRequest
import com.mypes.vinto.network.dto.SyncBatchRequest
import com.mypes.vinto.network.dto.TransaccionEntrante
import com.mypes.vinto.network.dto.TransaccionPayload
import org.json.JSONObject
import retrofit2.HttpException
import java.io.IOException

class OutboxWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val token = obtenerTokenVigente() ?: return Result.failure()
        if (token.isEmpty()) return Result.retry()
        val authorization = "Bearer $token"
        val db = MypesDatabase.obtener(applicationContext)
        val ventasResultado = sincronizarVentas(authorization, db)
        if (ventasResultado != null) return ventasResultado
        val productosResultado = subirProductosLocales(authorization, db)
        if (productosResultado != null) return productosResultado
        val catalogoResultado = sincronizarCatalogo(authorization, db)
        if (catalogoResultado != null) return catalogoResultado
        return sincronizarCorrecciones(authorization, db)
    }

    private suspend fun sincronizarVentas(
        authorization: String,
        database: MypesDatabase
    ): Result? {
        val outboxDao = database.outboxDao()
        while (true) {
            val pendientes = outboxDao.pendientes()
            if (pendientes.isEmpty()) return null

            val transacciones = mutableListOf<TransaccionEntrante>()
            pendientes.forEach { entry ->
                try {
                    val json = JSONObject(entry.payloadJson)
                    transacciones += TransaccionEntrante(
                        operationId = entry.operationId,
                        tipo = entry.tipo,
                        payload = TransaccionPayload(
                            ventaId = json.getString("ventaId"),
                            productoId = IdNube.deProducto(json.getString("productoId")),
                            cantidad = json.getDouble("cantidad"),
                            precioUnitario = json.getDouble("precioUnitario"),
                            total = json.getDouble("total"),
                            formaPago = json.getString("formaPago"),
                            clienteFiado = if (json.isNull("clienteFiado")) null else json.getString("clienteFiado"),
                            creadoEn = json.getLong("creadoEn")
                        ),
                        schemaVersion = entry.schemaVersion
                    )
                } catch (error: Exception) {
                    Log.e("OutboxWorker", "No se pudo leer la operación local ${entry.operationId}.", error)
                    outboxDao.marcarErrorPorId(entry.id)
                }
            }

            try {
                if (transacciones.isEmpty()) continue
                val response = ApiClient.syncApi.enviarLote(
                    authorization = authorization,
                    body = SyncBatchRequest(transacciones)
                )
                if (response.procesadas != transacciones.size) {
                    throw IllegalStateException("La API devolvió un total de operaciones inconsistente.")
                }
                val operationIds = transacciones.mapTo(mutableSetOf()) { it.operationId }
                val resultIds = response.resultados.map { it.operationId }
                if (
                    resultIds.size != operationIds.size
                    || resultIds.toSet() != operationIds
                    || resultIds.size != resultIds.toSet().size
                ) {
                    throw IllegalStateException("La API devolvió resultados incompletos o duplicados.")
                }
                response.resultados.forEach { resultado ->
                    when (resultado.estado) {
                        "ACEPTADA", "DUPLICADA" -> outboxDao.marcarSincronizada(resultado.operationId)
                        "CONFLICTO", "RECHAZADA" -> outboxDao.marcarError(resultado.operationId)
                        else -> throw IllegalStateException(
                            "La API devolvió un estado desconocido para ${resultado.operationId}."
                        )
                    }
                }
                outboxDao.limpiarSincronizadas()
            } catch (error: HttpException) {
                if (error.code() == 401) {
                    AuthSession.clear(applicationContext)
                    Log.w("OutboxWorker", "El token de sincronización expiró; vuelve a iniciar sesión.")
                    return Result.failure()
                } else {
                    Log.e("OutboxWorker", "La API rechazó el lote con HTTP ${error.code()}.", error)
                    return Result.retry()
                }
            } catch (error: IOException) {
                Log.w("OutboxWorker", "No se pudo conectar con la API; se reintentará.", error)
                return Result.retry()
            } catch (error: Exception) {
                Log.e("OutboxWorker", "Error inesperado al sincronizar el lote.", error)
                return Result.retry()
            }
        }
        return null
    }

    /**
     * Renueva la sesión con el refresh token antes de sincronizar, para que el envío no falle
     * cuando el token de acceso de 15 minutos ya venció (caso normal en modo offline).
     * Devuelve null si no hay sesión válida, "" si no hubo red para renovar.
     */
    private suspend fun obtenerTokenVigente(): String? {
        val refresh = AuthSession.refreshToken(applicationContext)
            ?: return AuthSession.token(applicationContext)
        return try {
            val respuesta = ApiClient.authApi.renovarSesion(RefreshRequest(refresh))
            val nuevo = respuesta.accessToken
            if (nuevo.isNullOrBlank()) {
                AuthSession.token(applicationContext)
            } else {
                AuthSession.saveToken(applicationContext, nuevo, respuesta.refreshToken)
                nuevo
            }
        } catch (error: HttpException) {
            when (error.code()) {
                401 -> {
                    AuthSession.clear(applicationContext)
                    Log.w("OutboxWorker", "La sesión expiró; vuelve a iniciar sesión en la nube.")
                    null
                }
                // Servidor anterior sin renovación de sesión: se usa el token guardado.
                404 -> AuthSession.token(applicationContext)
                else -> ""
            }
        } catch (error: IOException) {
            Log.w("OutboxWorker", "Sin conexión para renovar la sesión; se reintentará.", error)
            ""
        }
    }

    /** Sube al servidor los productos creados o editados en el celular (upsert por id). */
    private suspend fun subirProductosLocales(
        authorization: String,
        database: MypesDatabase
    ): Result? {
        val productos = database.productoDao().listarTodos()
            .filter { it.nombre.isNotBlank() && it.precio.isFinite() && it.precio >= 0.0 }
        if (productos.isEmpty()) return null
        return try {
            productos.chunked(500).forEach { lote ->
                ApiClient.syncApi.subirProductos(
                    authorization,
                    ProductUpsertRequest(
                        lote.map { ProductUpsertItem(IdNube.deProducto(it.id), it.nombre.trim(), it.precio, it.actualizadoEn) }
                    )
                )
            }
            null
        } catch (error: HttpException) {
            when (error.code()) {
                401 -> {
                    AuthSession.clear(applicationContext)
                    Result.failure()
                }
                // Servidor anterior sin subida de productos: no bloquea el resto de la sincronización.
                404 -> null
                else -> {
                    Log.e("OutboxWorker", "La API rechazó los productos con HTTP ${error.code()}.", error)
                    Result.retry()
                }
            }
        } catch (error: IOException) {
            Log.w("OutboxWorker", "No se pudieron subir los productos; se reintentará.", error)
            Result.retry()
        }
    }

    private suspend fun sincronizarCatalogo(
        authorization: String,
        database: MypesDatabase
    ): Result? {
        val desde = AuthSession.lastCatalogSync(applicationContext)
        var cursorActualizadoEn: Long? = null
        var cursorId: String? = null
        var timestampInicial: Long? = null

        // Productos locales con id antiguo: su equivalente en la nube no debe duplicarse al descargar.
        val localPorIdNube = database.productoDao().listarTodos()
            .filter { !IdNube.esUuid(it.id) }
            .associateBy { IdNube.deProducto(it.id) }

        return try {
            do {
                val response = ApiClient.syncApi.sincronizarProductos(
                    authorization = authorization,
                    desde = desde,
                    cursorActualizadoEn = cursorActualizadoEn,
                    cursorId = cursorId
                )
                if (response.total != response.items.size || response.timestamp < desde) {
                    throw IllegalStateException("Respuesta de sincronización del catálogo inconsistente.")
                }
                if (timestampInicial == null) timestampInicial = response.timestamp

                response.items.forEach { item ->
                    if (
                        item.id.isBlank()
                        || item.nombre.isBlank()
                        || !item.precio.isFinite()
                        || item.precio < 0.0
                        || !item.stock.isFinite()
                    ) {
                        throw IllegalStateException("La API devolvió un producto inválido.")
                    }
                    val local = localPorIdNube[item.id]
                    if (local != null) {
                        database.productoDao().actualizarDesdeServidor(local.id, item.nombre, item.precio, item.actualizadoEn)
                        return@forEach
                    }
                    database.productoDao().guardarProductoSincronizado(
                        Producto(
                            id = item.id,
                            nombre = item.nombre,
                            precio = item.precio,
                            stock = item.stock,
                            actualizadoEn = item.actualizadoEn
                        )
                    )
                }

                if (response.items.size == 500) {
                    val ultimo = response.items.last()
                    val cursorAnterior = cursorActualizadoEn
                    val idAnterior = cursorId
                    if (
                        cursorAnterior != null
                        && (ultimo.actualizadoEn < cursorAnterior
                            || (ultimo.actualizadoEn == cursorAnterior && ultimo.id <= idAnterior.orEmpty()))
                    ) {
                        throw IllegalStateException("El cursor del catálogo no avanzó.")
                    }
                    cursorActualizadoEn = ultimo.actualizadoEn
                    cursorId = ultimo.id
                }
            } while (response.items.size == 500)

            AuthSession.saveLastCatalogSync(
                applicationContext,
                maxOf(desde, timestampInicial ?: desde)
            )
            null
        } catch (error: HttpException) {
            if (error.code() == 401) {
                AuthSession.clear(applicationContext)
                Log.w("OutboxWorker", "El token de sincronización expiró; vuelve a iniciar sesión.")
                Result.failure()
            } else {
                Log.e("OutboxWorker", "La API rechazó el catálogo con HTTP ${error.code()}.", error)
                Result.retry()
            }
        } catch (error: IOException) {
            Log.w("OutboxWorker", "No se pudo descargar el catálogo; se reintentará.", error)
            Result.retry()
        } catch (error: Exception) {
            Log.e("OutboxWorker", "Error inesperado al sincronizar el catálogo.", error)
            Result.retry()
        }
    }

    private suspend fun sincronizarCorrecciones(
        authorization: String,
        database: MypesDatabase
    ): Result {
        val pendientes = database.voiceLogDao().pendientes()
        if (pendientes.isEmpty()) return Result.success()

        return try {
            val response = ApiClient.learningApi.enviarCorrecciones(
                authorization,
                LearningFeedbackRequest(
                    pendientes.map {
                        VoiceCorrection(
                            eventId = it.eventId,
                            textoOriginal = it.textoOriginal,
                            textoCorregido = it.textoCorregido,
                            intencion = it.intencion,
                            fecha = it.fecha
                        )
                    }
                )
            )
            if (response.accepted != pendientes.size) {
                throw IllegalStateException("La API no confirmó todas las correcciones enviadas.")
            }
            database.voiceLogDao().eliminarPorEventIds(pendientes.map { it.eventId })
            Result.success()
        } catch (error: HttpException) {
            if (error.code() == 401) {
                AuthSession.clear(applicationContext)
                Log.w("OutboxWorker", "El token de aprendizaje expiró; vuelve a iniciar sesión.")
                Result.failure()
            } else {
                Log.e("OutboxWorker", "La API rechazó las correcciones con HTTP ${error.code()}.", error)
                Result.retry()
            }
        } catch (error: IOException) {
            Log.w("OutboxWorker", "No se pudieron enviar las correcciones; se reintentará.", error)
            Result.retry()
        } catch (error: Exception) {
            Log.e("OutboxWorker", "Error inesperado al sincronizar las correcciones.", error)
            Result.retry()
        }
    }

    companion object {
        const val WORK_NAME = "outbox_sync"
    }
}

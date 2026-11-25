package com.mypes.vinto.network.dto

import com.google.gson.annotations.SerializedName

data class SyncBatchRequest(
    @SerializedName("transacciones") val transacciones: List<TransaccionEntrante>
)

data class TransaccionEntrante(
    @SerializedName("operationId") val operationId: String,
    @SerializedName("tipo") val tipo: String,
    @SerializedName("payload") val payload: TransaccionPayload,
    @SerializedName("schemaVersion") val schemaVersion: Int
)

data class TransaccionPayload(
    @SerializedName("ventaId") val ventaId: String,
    @SerializedName("productoId") val productoId: String,
    @SerializedName("cantidad") val cantidad: Double,
    @SerializedName("precioUnitario") val precioUnitario: Double,
    @SerializedName("total") val total: Double,
    @SerializedName("formaPago") val formaPago: String,
    @SerializedName("clienteFiado") val clienteFiado: String?,
    @SerializedName("creadoEn") val creadoEn: Long
)

data class SyncBatchResponse(
    @SerializedName("procesadas") val procesadas: Int,
    @SerializedName("resultados") val resultados: List<ResultadoOperacion>
)

data class ResultadoOperacion(
    @SerializedName("operationId") val operationId: String,
    @SerializedName("estado") val estado: String,
    @SerializedName("mensaje") val mensaje: String?
)

data class ProductSyncResponse(
    @SerializedName("items") val items: List<ProductSyncItem>,
    @SerializedName("total") val total: Int,
    @SerializedName("timestamp") val timestamp: Long
)

data class ProductUpsertRequest(
    @SerializedName("items") val items: List<ProductUpsertItem>
)

data class ProductUpsertItem(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("salePrice") val salePrice: Double,
    @SerializedName("updatedAt") val updatedAt: Long
)

data class ProductUpsertResponse(
    @SerializedName("recibidos") val recibidos: Int,
    @SerializedName("guardados") val guardados: Int,
    @SerializedName("omitidos") val omitidos: List<String>
)

data class ProductSyncItem(
    @SerializedName("id") val id: String,
    @SerializedName("nombre") val nombre: String,
    @SerializedName("precio") val precio: Double,
    @SerializedName("stock") val stock: Double,
    @SerializedName("actualizadoEn") val actualizadoEn: Long
)

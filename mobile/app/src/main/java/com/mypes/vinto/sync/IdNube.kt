package com.mypes.vinto.sync

import java.util.UUID

/**
 * La nube identifica productos con UUID. Los productos de plantilla antiguos usan ids legibles
 * (por ejemplo "abarrotes_arroz"); se convierten a un UUID estable derivado del id local,
 * así la venta y el producto apuntan siempre al mismo registro en el servidor.
 */
object IdNube {
    private val patronUuid =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

    fun esUuid(id: String): Boolean = patronUuid.matches(id)

    fun deProducto(idLocal: String): String =
        if (esUuid(idLocal)) idLocal
        else UUID.nameUUIDFromBytes("yapay:producto:$idLocal".toByteArray(Charsets.UTF_8)).toString()
}

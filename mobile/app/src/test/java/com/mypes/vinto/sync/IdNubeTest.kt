package com.mypes.vinto.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class IdNubeTest {
    @Test
    fun conservaLosUuidExistentes() {
        val id = "7b0e3c7e-8f9a-4d5e-9b1a-2c3d4e5f6a7b"
        assertEquals(id, IdNube.deProducto(id))
    }

    @Test
    fun convierteIdsDePlantillaEnUuidEstable() {
        val primero = IdNube.deProducto("abarrotes_arroz_1_kg")
        assertTrue(IdNube.esUuid(primero))
        assertEquals(primero, IdNube.deProducto("abarrotes_arroz_1_kg"))
        assertNotEquals(primero, IdNube.deProducto("abarrotes_azucar_1_kg"))
    }
}

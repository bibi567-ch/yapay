package com.mypes.vinto.nlu

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Casos tomados de pruebas reales con el modelo vosk-model-small-es-0.42: el texto "abierto" es lo que
 * devuelve el modelo sin vocabulario y el de "vocabulario" lo que devuelve el reconocedor restringido.
 */
class ReconocimientoVozTest {
    private val clasificador = IntentClassifier()

    @Test
    fun `prefiere el vocabulario del negocio cuando el modelo abierto se equivoca`() {
        assertEquals("quiero vender arroz", AsrEngine.elegirTexto("quiero aprender arroz", "quiero vender arroz"))
        assertEquals("enciende linterna", AsrEngine.elegirTexto("enciende la a", "enciende linterna"))
        assertEquals("abre whatsapp", AsrEngine.elegirTexto("whatsapp", "abre whatsapp"))
    }

    @Test
    fun `conserva el texto abierto para nombres de contactos y frases desconocidas`() {
        assertEquals("llama a juan", AsrEngine.elegirTexto("llama a juan", "llama [unk]"))
        assertEquals("comando raro", AsrEngine.elegirTexto("comando raro", "[unk]"))
        assertEquals("quiero vender", AsrEngine.elegirTexto("quiero aprender", "quiero vender [unk]"))
    }

    @Test
    fun `clasifica las frases cortas que devuelve el reconocedor`() {
        assertEquals(IntentClassifier.Intencion.REGISTRAR_VENTA, clasificador.clasificar("vender kilos azúcar"))
        assertEquals(IntentClassifier.Intencion.CONSULTAR_STOCK, clasificador.clasificar("consultar aceite"))
        assertEquals(IntentClassifier.Intencion.AGREGAR_PRODUCTO, clasificador.clasificar("producto fideos cinco bolivianos"))
        assertEquals(IntentClassifier.Intencion.LEER_TEXTO, clasificador.clasificar("texto"))
        assertEquals(IntentClassifier.Intencion.CREAR_ALARMA, clasificador.clasificar("alarma las siete"))
        assertEquals(IntentClassifier.Intencion.CONSULTAR_VENTAS, clasificador.clasificar("cuánto vendí hoy"))
        assertEquals(IntentClassifier.Intencion.LINTERNA, clasificador.clasificar("enciende linterna"))
        assertEquals(IntentClassifier.Intencion.ABRIR_APP, clasificador.clasificar("whatsapp"))
    }
}

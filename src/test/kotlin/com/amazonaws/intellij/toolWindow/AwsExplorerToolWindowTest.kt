package com.amazonaws.intellij.toolWindow

import org.junit.Test
import java.util.*
import kotlin.reflect.KProperty


class AwsExplorerToolWindowTest {
    @Test
    fun myTest() {
        val blah = Blah("kyle")

//        blah.upper
//        blah.upper
    }

    data class Blah(val name: String)

    val Blah.upper: String by LazyWithReceiver<Blah, String> {
        println("running")
        this.name.toUpperCase()
    }

}

class LazyWithReceiver<This, Return>(val initializer: This.() -> Return) {
    private val values = WeakHashMap<This, Return>()

    @Suppress("UNCHECKED_CAST")
    operator fun getValue(thisRef: Any, property: KProperty<*>): Return = synchronized(values)
    {
        thisRef as This
        return values.getOrPut(thisRef) { thisRef.initializer() }
    }
}
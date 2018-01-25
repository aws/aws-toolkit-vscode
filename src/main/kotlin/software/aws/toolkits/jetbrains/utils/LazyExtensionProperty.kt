package software.aws.toolkits.jetbrains.utils

import java.util.WeakHashMap
import kotlin.reflect.KProperty

/**
 * A helper that allows extension properties to be lazily evaluated and the result cached
 * Useful for extending types with expensive lookup functions.
 *
 * @sample LazyExtensionProperty.sample
 */
class LazyExtensionProperty<TypeBeingExtended, Return>(val initializer: TypeBeingExtended.() -> Return) {
    private val values = WeakHashMap<TypeBeingExtended, Return>()

    @Suppress("UNCHECKED_CAST")
    operator fun getValue(thisRef: Any, property: KProperty<*>): Return = synchronized(values)
    {
        thisRef as TypeBeingExtended
        return values.getOrPut(thisRef) { thisRef.initializer() }
    }
}

/**
 * Documentation only
 */
@Suppress("UNUSED")
private class LazyExtensionPropertyExample {
    data class SomeClass(val property: String)

    val SomeClass.lazilyEvaluatedExtensionProperty: String by LazyExtensionProperty<SomeClass, String> {
        //some expensive function that determines value of lazilyEvaluatedExtensionProperty
        this.property
    }
}
package software.aws.toolkits.core.rules

import org.junit.rules.ExternalResource
import java.security.AccessController
import java.security.PrivilegedAction

/**
 * A utility that can temporarily forcibly set environment variables and
 * then allows resetting them to the original values.
 */
class EnvironmentVariableHelper : ExternalResource() {
    private val originalEnvironmentVariables: Map<String, String> = System.getenv().toMap()
    private val modifiableMap: MutableMap<String, String>
    @Volatile
    private var mutated = false

    init {
        val field = System.getenv().javaClass.getDeclaredField("m")
        AccessController.doPrivileged(PrivilegedAction<Unit> {
            field.isAccessible = true
        })

        @Suppress("UNCHECKED_CAST")
        modifiableMap = getProcessEnvMap() ?: getEnvMap()
    }

    fun remove(vararg keys: String) {
        mutated = true
        keys.forEach { modifiableMap.remove(it) }
    }

    operator fun set(key: String, value: String) {
        mutated = true
        modifiableMap[key] = value
    }

    private fun getEnvMap(): MutableMap<String, String> {
        return getField(System.getenv().javaClass, System.getenv(), "m")!!
    }

    private fun getProcessEnvMap(): MutableMap<String, String>? {
        val processEnvironment = Class.forName("java.lang.ProcessEnvironment")
        return getField(processEnvironment, null, "theCaseInsensitiveEnvironment")
    }

    private fun getField(processEnvironment: Class<*>, obj: Any?, fieldName: String): MutableMap<String, String>? {
        return try {
            val declaredField = processEnvironment.getDeclaredField(fieldName)
            AccessController.doPrivileged(PrivilegedAction<Unit> {
                declaredField.isAccessible = true
            })
            @Suppress("UNCHECKED_CAST")
            declaredField.get(obj) as MutableMap<String, String>
        } catch (_: NoSuchFieldException) {
            null
        }
    }

    private fun reset() {
        if (mutated) {
            synchronized(this) {
                if (mutated) {
                    modifiableMap.clear()
                    modifiableMap.putAll(originalEnvironmentVariables)
                    mutated = false
                }
            }
        }
    }

    override fun after() {
        reset()
    }
}

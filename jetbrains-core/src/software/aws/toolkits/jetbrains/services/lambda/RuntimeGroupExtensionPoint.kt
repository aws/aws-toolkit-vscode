package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.openapi.extensions.AbstractExtensionPointBean
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.openapi.util.LazyInstance
import com.intellij.util.KeyedLazyInstance
import com.intellij.util.xmlb.annotations.Attribute

/**
 * A bean that represents an extension point based on a [RuntimeGroup]
 */
class RuntimeGroupExtensionPoint<T> : AbstractExtensionPointBean(), KeyedLazyInstance<T> {

    @Attribute("implementation")
    lateinit var implementation: String

    /**
     * The [RuntimeGroup] that this extension point refers to
     */
    @Attribute("runtimeGroup")
    lateinit var runtimeGroup: RuntimeGroup

    private val instance = object : LazyInstance<T>() {
        override fun getInstanceClass(): Class<T> {
            return findClass(implementation)
        }
    }

    override fun getKey(): String = runtimeGroup.name

    override fun getInstance(): T = instance.value
}

/**
 * To be implemented on a companion object of the extension point object to expose factory methods.
 * See [software.aws.toolkits.jetbrains.services.lambda.LambdaPackager]
 */
abstract class RuntimeGroupExtensionPointObject<T>(private val extensionPointName: ExtensionPointName<RuntimeGroupExtensionPoint<T>>) {
    protected val collector = KeyedExtensionCollector<T, RuntimeGroup>(extensionPointName.name)
    fun getInstance(runtimeGroup: RuntimeGroup): T = collector.findSingle(runtimeGroup)
    val supportedRuntimeGroups: Set<RuntimeGroup> by lazy { extensionPointName.extensions.map { it.runtimeGroup }.toSet() }
    val supportedLanguages: Set<Language> by lazy { supportedRuntimeGroups.flatMap { it.languageIds }.mapNotNull { Language.findLanguageByID(it) }.toSet() }
}
// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.openapi.extensions.AbstractExtensionPointBean
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.openapi.util.LazyInstance
import com.intellij.util.KeyedLazyInstance
import com.intellij.util.xmlb.annotations.Attribute
import software.amazon.awssdk.services.lambda.model.Runtime

/**
 * Grouping of Lambda [Runtime] by parent language.
 *
 * A Lambda [Runtime] belongs to a single [RuntimeGroup], a [RuntimeGroup] may have several
 * Lambda [Runtime]s, [Language]s or [Sdk]s.
 */
enum class RuntimeGroup {
    JAVA,
    PYTHON;

    private val info by lazy {
        RuntimeGroupInformation.getInstances(this)
    }

    val runtimes: Set<Runtime> by lazy { info.flatMap { it.runtimes }.toSet() }
    val languageIds: Set<String> by lazy { info.flatMap { it.languageIds }.toSet() }
    fun runtimeForSdk(sdk: Sdk): Runtime? = info.asSequence().mapNotNull { it.runtimeForSdk(sdk) }.firstOrNull()

    internal companion object {
        /**
         * Lazily apply the predicate to each [RuntimeGroup] and return the first match (or null)
         */
        fun find(predicate: (RuntimeGroup) -> Boolean): RuntimeGroup? = RuntimeGroup.values().asSequence().filter(predicate).firstOrNull()

        fun runtimeForSdk(sdk: Sdk): Runtime? = values().asSequence().mapNotNull { it.runtimeForSdk(sdk) }.firstOrNull()
    }
}

/**
 * Represents information about a specific [Runtime] or [RuntimeGroup]. A single [RuntimeGroup] can have more than one RuntimeGroupInformation
 * registered.
 */
interface RuntimeGroupInformation {
    val runtimes: Set<Runtime>
    val languageIds: Set<String>
    fun runtimeForSdk(sdk: Sdk): Runtime?

    companion object : RuntimeGroupExtensionPointObject<RuntimeGroupInformation>(ExtensionPointName("aws.toolkit.lambda.runtimeGroup")) {
        fun getInstances(runtimeGroup: RuntimeGroup): List<RuntimeGroupInformation> = collector.forKey(runtimeGroup)
    }
}

val Runtime.runtimeGroup: RuntimeGroup? get() = RuntimeGroup.find { this in it.runtimes }

/**
 * For a given [com.intellij.lang.Language] determine the corresponding Lambda [RuntimeGroup]
 */
val Language.runtimeGroup: RuntimeGroup? get() = RuntimeGroup.find { this.id in it.languageIds }

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
        override fun getInstanceClass(): Class<T> = findClass(implementation)
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
// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("RuntimeGroupUtil")

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.extensions.AbstractExtensionPointBean
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.SdkType
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ProjectRootManager
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
    PYTHON,
    NODEJS,
    DOTNET;

    private val info by lazy {
        RuntimeGroupInformation.getInstances(this)
    }

    val runtimes: Set<Runtime> by lazy { info.flatMap { it.runtimes }.toSet() }
    val languageIds: Set<String> by lazy { info.flatMap { it.languageIds }.toSet() }

    fun determineRuntime(project: Project): Runtime? = info.asSequence().mapNotNull { it.determineRuntime(project) }.firstOrNull()
    fun determineRuntime(module: Module): Runtime? = info.asSequence().mapNotNull { it.determineRuntime(module) }.firstOrNull()
    fun getModuleType(): ModuleType<*>? = info.asSequence().mapNotNull { it.getModuleType() }.firstOrNull()
    fun getIdeSdkType(): SdkType? = info.asSequence().mapNotNull { it.getIdeSdkType() }.firstOrNull()
    fun supportsSamBuild(): Boolean = info.asSequence().all { it.supportsSamBuild() }

    internal companion object {
        /**
         * Lazily apply the predicate to each [RuntimeGroup] and return the first match (or null)
         */
        @JvmStatic
        fun find(predicate: (RuntimeGroup) -> Boolean): RuntimeGroup? = RuntimeGroup.values().asSequence().filter(predicate).firstOrNull()

        fun determineRuntime(project: Project?): Runtime? = project?.let { _ ->
            values().asSequence().mapNotNull { it.determineRuntime(project) }.firstOrNull()
        }

        fun determineRuntime(module: Module?): Runtime? = module?.let { _ ->
            values().asSequence().mapNotNull { it.determineRuntime(module) }.firstOrNull()
        }

        fun determineRuntimeGroup(project: Project?): RuntimeGroup? = project?.let { _ ->
            values().asSequence().find { it.determineRuntime(project) != null }
        }
    }
}

/**
 * Represents information about a specific [Runtime] or [RuntimeGroup]. A single [RuntimeGroup] can have more than one RuntimeGroupInformation
 * registered.
 */
interface RuntimeGroupInformation {
    val runtimes: Set<Runtime>
    val languageIds: Set<String>

    /**
     * Attempt to determine the runtime from the [project] level scope.
     */
    fun determineRuntime(project: Project): Runtime?

    /**
     * Attempt to determine the runtime from the [module] level scope.
     * Do not fall back to [Project] level scope; logic controlling fallback to [Project] scope should be done at the call-site.
     */
    fun determineRuntime(module: Module): Runtime?

    /**
     * The IDE module type that should be associated with this runtime group
     */
    fun getModuleType(): ModuleType<*>?

    /**
     * The IDE SDK type that this runtime group supports
     */
    fun getIdeSdkType(): SdkType?

    /**
     * Whether this runtime group supports SAM build so that SAM template with runtimes of this type could be deployed to AWS.
     */
    fun supportsSamBuild(): Boolean

    companion object : RuntimeGroupExtensionPointObject<RuntimeGroupInformation>(ExtensionPointName("aws.toolkit.lambda.runtimeGroup")) {
        fun getInstances(runtimeGroup: RuntimeGroup): List<RuntimeGroupInformation> = collector.forKey(runtimeGroup)
    }
}

abstract class SdkBasedRuntimeGroupInformation : RuntimeGroupInformation {
    protected abstract fun runtimeForSdk(sdk: Sdk): Runtime?

    override fun determineRuntime(project: Project): Runtime? = ProjectRootManager.getInstance(project).projectSdk?.let { runtimeForSdk(it) }

    override fun determineRuntime(module: Module): Runtime? = ModuleRootManager.getInstance(module).sdk?.let { runtimeForSdk(it) }

    override fun getModuleType(): ModuleType<*>? = null

    override fun getIdeSdkType(): SdkType? = null

    override fun supportsSamBuild(): Boolean = false
}

val Runtime?.validOrNull: Runtime? get() = this?.takeUnless { it == Runtime.UNKNOWN_TO_SDK_VERSION }

val Runtime.runtimeGroup: RuntimeGroup? get() = RuntimeGroup.find { this in it.runtimes }

/**
 * For a given [com.intellij.lang.Language] determine the corresponding Lambda [RuntimeGroup]
 */
val Language.runtimeGroup: RuntimeGroup? get() = RuntimeGroup.find { this.id in it.languageIds }

/**
 * Given [AnActionEvent] attempt to determine the [Runtime]
 */
fun AnActionEvent.runtime(): Runtime? {
    val runtimeGroup = getData(LangDataKeys.LANGUAGE)?.runtimeGroup ?: return null
    return getData(LangDataKeys.MODULE)?.let { runtimeGroup.determineRuntime(it) } ?: getData(LangDataKeys.PROJECT)?.let { runtimeGroup.determineRuntime(it) }
}

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
 * See [software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder]
 */
abstract class RuntimeGroupExtensionPointObject<T>(private val extensionPointName: ExtensionPointName<RuntimeGroupExtensionPoint<T>>) {
    protected val collector = KeyedExtensionCollector<T, RuntimeGroup>(extensionPointName.name)
    fun getInstance(runtimeGroup: RuntimeGroup): T? = collector.findSingle(runtimeGroup)
    fun getInstanceOrThrow(runtimeGroup: RuntimeGroup): T =
        getInstance(runtimeGroup) ?: throw IllegalStateException("Attempted to retrieve feature for unsupported runtime group $runtimeGroup")

    val supportedRuntimeGroups: Set<RuntimeGroup> by lazy { extensionPointName.extensions.map { it.runtimeGroup }.toSet() }
    val supportedLanguages: Set<Language> by lazy { supportedRuntimeGroups.flatMap { it.languageIds }.mapNotNull { Language.findLanguageByID(it) }.toSet() }
}

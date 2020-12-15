// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("RuntimeGroupUtil")

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.lang.Language
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.SdkType
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.util.text.SemVer
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.IdBasedExtensionPoint
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.resources.message

/**
 * IDs for built-in runtime groups that ship with toolkit
 */
object BuiltInRuntimeGroups {
    const val Python = "PYTHON"
    const val Dotnet = "DOTNET"
    const val Java = "JAVA"
    const val NodeJs = "NODEJS"
    const val Go = "GO"
}

data class RuntimeInfo(val runtime: Runtime, val minimumVersion: SemVer = SamExecutable.minVersion)

/**
 * Grouping of Lambda [Runtime] by parent language.
 *
 * A Lambda [Runtime] belongs to a single [RuntimeGroup], a [RuntimeGroup] may have several Lambda [Runtime]s, [Language]s or [Sdk]s.
 */
abstract class RuntimeGroup {
    abstract val id: String
    abstract val languageIds: Set<String>
    abstract val supportsPathMappings: Boolean

    val runtimes: List<Runtime> by lazy {
        supportedRuntimes.map { it.runtime }
    }

    protected abstract val supportedRuntimes: List<RuntimeInfo>

    open fun determineRuntime(project: Project): Runtime? = null
    open fun determineRuntime(module: Module): Runtime? = null
    open fun getModuleType(): ModuleType<*>? = null
    open fun getIdeSdkType(): SdkType? = null

    open fun supportsSamBuild(): Boolean = true

    fun validateSamVersion(runtime: Runtime, samVersion: SemVer) {
        val minVersion = supportedRuntimes.first { it.runtime == runtime }.minimumVersion
        if (samVersion < minVersion) {
            throw RuntimeException(message("sam.executable.minimum_too_low_runtime", runtime, minVersion))
        }
    }

    companion object {
        private val EP_NAM = ExtensionPointName.create<RuntimeGroup>("aws.toolkit.lambda.runtimeGroup")

        @JvmStatic
        fun find(predicate: (RuntimeGroup) -> Boolean): RuntimeGroup? = registeredRuntimeGroups().firstOrNull(predicate)

        fun getById(id: String?): RuntimeGroup = id?.let { find { it.id == id } } ?: throw IllegalStateException("No RuntimeGroup with id '$id' is registered")

        fun determineRuntime(project: Project?): Runtime? = project?.let { _ ->
            registeredRuntimeGroups().asSequence().mapNotNull { it.determineRuntime(project) }.firstOrNull()
        }

        fun determineRuntime(module: Module?): Runtime? = module?.let { _ ->
            registeredRuntimeGroups().asSequence().mapNotNull { it.determineRuntime(module) }.firstOrNull()
        }

        fun determineRuntimeGroup(project: Project?): RuntimeGroup? = project?.let { _ ->
            registeredRuntimeGroups().find { it.determineRuntime(project) != null }
        }

        fun registeredRuntimeGroups(): List<RuntimeGroup> = EP_NAM.extensionList
    }
}

abstract class SdkBasedRuntimeGroup : RuntimeGroup() {
    protected abstract fun runtimeForSdk(sdk: Sdk): Runtime?

    override fun determineRuntime(project: Project): Runtime? = ProjectRootManager.getInstance(project).projectSdk?.let { runtimeForSdk(it) }

    override fun determineRuntime(module: Module): Runtime? = ModuleRootManager.getInstance(module).sdk?.let { runtimeForSdk(it) }
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
 * To be implemented on a companion object of the extension point object to expose factory methods.
 * See [software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder]
 */
abstract class RuntimeGroupExtensionPointObject<T>(val extensionPointName: ExtensionPointName<IdBasedExtensionPoint<T>>) {
    private val collector = KeyedExtensionCollector<T, String>(extensionPointName.name)

    fun getInstanceOrNull(runtimeGroup: RuntimeGroup): T? = collector.findSingle(runtimeGroup.id)
    fun getInstance(runtimeGroup: RuntimeGroup): T = getInstanceOrNull(runtimeGroup)
        ?: throw IllegalStateException("Attempted to retrieve feature for unsupported runtime group $runtimeGroup")

    fun supportedRuntimeGroups(): Set<RuntimeGroup> {
        val alRuntimeGroups = RuntimeGroup.registeredRuntimeGroups()
        val supportedIds = extensionPointName.extensions.map { it.id }
        return alRuntimeGroups.filter { supportedIds.contains(it.id) }.toSet()
    }

    fun supportedLanguages(): Set<Language> {
        val supportedRuntimeGroups = supportedRuntimeGroups()
        return supportedRuntimeGroups.asSequence().flatMap { it.languageIds.asSequence() }.mapNotNull { Language.findLanguageByID(it) }.toSet()
    }
}

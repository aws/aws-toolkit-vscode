// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.util.io.exists
import com.intellij.util.io.lastModified
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance.ExecutableWithPath
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.attribute.FileTime
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

// A startup activity to load the executable manager at startup. This validates the executables if they exist on disk
// which allows us to use them without explicitly loading loading them.
// For more background on why this is the way it is: Services are lazily loaded, which means on the first get of the service it will be loaded.
// Additionally, once it is loaded, the executables are validated in an async way, so they do not finish validating before the first real call happens.
// This means that the first call to getExecutableIfPresent will fail because it does not explicitly validate (by design).
class ExecutableLoader : StartupActivity, DumbAware {
    override fun runActivity(project: Project) {
        ExecutableManager.getInstance()
    }
}

interface ExecutableManager {
    fun getExecutable(type: ExecutableType<*>): CompletionStage<ExecutableInstance>
    fun getExecutableIfPresent(type: ExecutableType<*>): ExecutableInstance
    fun validateExecutablePath(type: ExecutableType<*>, path: Path): ExecutableInstance
    fun setExecutablePath(type: ExecutableType<*>, path: Path): CompletionStage<ExecutableInstance>
    fun removeExecutable(type: ExecutableType<*>)

    companion object {
        @JvmStatic
        fun getInstance(): ExecutableManager = ServiceManager.getService(ExecutableManager::class.java)
    }
}

inline fun <reified T : ExecutableType<*>> ExecutableManager.getExecutable() = getExecutable(ExecutableType.getInstance<T>())
inline fun <reified T : ExecutableType<*>> ExecutableManager.getExecutableIfPresent() = getExecutableIfPresent(ExecutableType.getInstance<T>())
inline fun <reified T : ExecutableType<*>> ExecutableManager.setExecutablePath(path: Path) = setExecutablePath(ExecutableType.getInstance<T>(), path)

@State(name = "executables", storages = [Storage("aws.xml")])
class DefaultExecutableManager : PersistentStateComponent<ExecutableStateList>, ExecutableManager {
    private val internalState = mutableMapOf<String, Triple<ExecutableState, ExecutableInstance?, FileTime?>>()

    override fun getState(): ExecutableStateList = ExecutableStateList(internalState.values.map { it.first }.toList())

    override fun loadState(state: ExecutableStateList) {
        internalState.clear()
        state.value.forEach {
            val id = it.id ?: return@forEach
            internalState[id] = Triple(it, null, null)
        }
        ExecutableType.executables().forEach {
            getExecutable(it)
        }
    }

    override fun getExecutableIfPresent(type: ExecutableType<*>): ExecutableInstance {
        val instance = internalState[type.id]?.second?.takeIf {
            when (it) {
                is ExecutableWithPath -> it.executablePath.exists()
                else -> true
            }
        }

        // If the executable is unresolved, either the path does not exist, or there is no
        // entry in the cache. In this case, always try to get the executable out of the cache.
        if (instance == null) {
            getExecutable(type).exceptionally {
                LOG.warn(it) { "Error thrown while updating executable cache" }
                null
            }
            return ExecutableInstance.UnresolvedExecutable(message("executableCommon.missing_executable", type.displayName))
        }

        // Check if the set executable was modified. If it was, start an update in the background. Overlapping
        // runs of update are eventually consistent, and called often, so we do not have to keep track of the future
        val lastModified = (instance as ExecutableWithPath).executablePath.lastModifiedOrNull()
        if (lastModified != internalState[type.id]?.third) {
            getExecutable(type).exceptionally {
                LOG.warn(it) { "Error thrown while updating executable cache" }
                null
            }
        }
        return instance
    }

    override fun validateExecutablePath(type: ExecutableType<*>, path: Path): ExecutableInstance = validate(type, path, false)

    override fun getExecutable(type: ExecutableType<*>): CompletionStage<ExecutableInstance> {
        val future = CompletableFuture<ExecutableInstance>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val loaded = internalState[type.id]
            if (loaded == null) {
                future.complete(load(type, null))
                return@executeOnPooledThread
            }

            val (persisted, instance, lastValidated) = loaded
            val lastKnownFileTime = persisted.lastKnownFileTime?.let { FileTime.fromMillis(it) }

            future.complete(
                when {
                    instance is ExecutableWithPath && persisted.autoResolved == true && instance.executablePath.isNewerThan(lastKnownFileTime) ->
                        validateAndSave(type, instance.executablePath, autoResolved = false)
                    instance is ExecutableWithPath && instance.executablePath.lastModifiedOrNull() == lastValidated ->
                        instance
                    else ->
                        load(type, persisted)
                }
            )
        }
        return future
    }

    override fun setExecutablePath(type: ExecutableType<*>, path: Path): CompletionStage<ExecutableInstance> {
        val future = CompletableFuture<ExecutableInstance>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val executable = validateAndSave(type, path, false)
            future.complete(executable)
        }
        return future
    }

    override fun removeExecutable(type: ExecutableType<*>) {
        internalState[type.id] = Triple(ExecutableState(type.id), null, null)
    }

    private fun load(type: ExecutableType<*>, persisted: ExecutableState?): ExecutableInstance {
        val persistedPath = persisted?.executablePath?.let { Paths.get(it) }
        val autoResolved = persisted?.autoResolved ?: false
        return when {
            persistedPath?.exists() == true -> validateAndSave(type, persistedPath, autoResolved)
            else -> resolve(type)
        }
    }

    private fun updateInternalState(type: ExecutableType<*>, instance: ExecutableInstance) {
        val resolved = instance as? ExecutableWithPath
        val newPersistedState = ExecutableState(
            type.id,
            resolved?.executablePath?.toString(),
            resolved?.autoResolved,
            resolved?.executablePath?.lastModifiedOrNull()?.toMillis()
        )
        val lastModified = try {
            resolved?.executablePath?.lastModified()
        } catch (e: Exception) {
            null
        }
        internalState[type.id] = Triple(newPersistedState, instance, lastModified)
    }

    private fun resolve(type: ExecutableType<*>): ExecutableInstance = try {
        (type as? AutoResolvable)?.resolve()?.let { validateAndSave(type, it, autoResolved = true) }
            ?: ExecutableInstance.UnresolvedExecutable(message("executableCommon.missing_executable", type.displayName))
    } catch (e: Exception) {
        ExecutableInstance.UnresolvedExecutable(message("aws.settings.executables.resolution_exception", type.displayName, e.asString))
    }

    private fun validate(type: ExecutableType<*>, path: Path, autoResolved: Boolean): ExecutableInstance =
        try {
            (type as? Validatable)?.validate(path)
            determineVersion(type, path, autoResolved)
        } catch (e: Exception) {
            val message = message("aws.settings.executables.executable_invalid", type.displayName, e.asString)
            LOG.warn(e) { message }

            ExecutableInstance.InvalidExecutable(
                path,
                null,
                autoResolved,
                message
            )
        }

    private fun validateAndSave(type: ExecutableType<*>, path: Path, autoResolved: Boolean): ExecutableInstance {
        val originalValue = internalState[type.id]?.second

        return when (val instance = validate(type, path, autoResolved)) {
            is ExecutableInstance.Executable -> {
                updateInternalState(type, instance)
                instance
            }
            is ExecutableInstance.UnresolvedExecutable, is ExecutableInstance.InvalidExecutable -> {
                if (originalValue is ExecutableInstance.Executable) {
                    originalValue
                } else {
                    updateInternalState(type, instance)
                    instance
                }
            }
        }
    }

    private fun determineVersion(type: ExecutableType<*>, path: Path, autoResolved: Boolean): ExecutableInstance = try {
        ExecutableInstance.Executable(path, type.version(path).toString(), autoResolved)
    } catch (e: Exception) {
        ExecutableInstance.InvalidExecutable(
            path,
            null,
            autoResolved,
            message("aws.settings.executables.cannot_determine_version", type.displayName, e.asString)
        )
    }

    private val Exception.asString: String get() = this.message ?: this.toString()
    private fun Path.lastModifiedOrNull() = this.takeIf { it.exists() }?.lastModified()
    private fun Path.isNewerThan(time: FileTime?): Boolean {
        if (time == null) return false
        return lastModifiedOrNull()?.let { it.toMillis() > time.toMillis() } == true
    }

    companion object {
        val LOG = getLogger<DefaultExecutableManager>()
    }
}

sealed class ExecutableInstance {
    abstract val version: String?

    interface ExecutableWithPath {
        val executablePath: Path
        val autoResolved: Boolean
    }

    interface BadExecutable {
        val validationError: String
    }

    class Executable(
        override val executablePath: Path,
        override val version: String,
        override val autoResolved: Boolean
    ) : ExecutableInstance(), ExecutableWithPath {
        // TODO get executable name as part of this
        fun getCommandLine(): GeneralCommandLine =
            ExecutableCommon.getCommandLine(executablePath.toAbsolutePath().toString(), executablePath.fileName.toString())
    }

    class InvalidExecutable(
        override val executablePath: Path,
        override val version: String?,
        override val autoResolved: Boolean,
        override val validationError: String
    ) : ExecutableInstance(), ExecutableWithPath, BadExecutable

    class UnresolvedExecutable(override val validationError: String) : ExecutableInstance(), BadExecutable {
        override val version: String? = null
    }
}

// PersistentStateComponent requires a bean, so we wrap the List
data class ExecutableStateList(
    var value: List<ExecutableState> = listOf()
)

data class ExecutableState(
    var id: String? = null,
    var executablePath: String? = null,
    var autoResolved: Boolean? = false,
    var lastKnownFileTime: Long? = null
)

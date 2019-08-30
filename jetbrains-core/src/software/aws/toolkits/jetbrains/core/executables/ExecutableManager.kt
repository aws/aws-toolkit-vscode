// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
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

interface ExecutableManager {

    fun getExecutable(type: ExecutableType<*>): CompletionStage<ExecutableInstance>
    fun getExecutableIfPresent(type: ExecutableType<*>): ExecutableInstance
    fun setExecutablePath(type: ExecutableType<*>, path: Path): CompletionStage<ExecutableInstance>

    companion object {
        fun getInstance(): ExecutableManager = ServiceManager.getService(ExecutableManager::class.java)
    }
}

inline fun <reified T : ExecutableType<*>> ExecutableManager.getExecutable() = getExecutable(ExecutableType.getInstance<T>())
inline fun <reified T : ExecutableType<*>> ExecutableManager.getExecutableIfPresent() = getExecutableIfPresent(ExecutableType.getInstance<T>())

@State(name = "executables", storages = [Storage("aws.xml")])
class DefaultExecutableManager : PersistentStateComponent<List<ExecutableState>>, ExecutableManager {
    private val internalState = mutableMapOf<String, Triple<ExecutableState, ExecutableInstance?, FileTime?>>()

    override fun getState(): List<ExecutableState>? = internalState.values.map { it.first }.toList()

    override fun loadState(state: List<ExecutableState>) {
        internalState.clear()
        state.forEach {
            val id = it.id ?: return@forEach
            internalState[id] = Triple(it, null, null)
        }
        ExecutableType.executables().forEach {
            getExecutable(it)
        }
    }

    override fun getExecutableIfPresent(type: ExecutableType<*>): ExecutableInstance = internalState[type.id]?.second?.takeIf {
        when (it) {
            is ExecutableWithPath -> it.executablePath.exists()
            else -> true
        }
    } ?: ExecutableInstance.UnresolvedExecutable()

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
                    instance is ExecutableWithPath && persisted.autoResolved == true && instance.executablePath.isNewerThan(lastKnownFileTime) -> validate(type, instance.executablePath, false)
                    instance is ExecutableWithPath && instance.executablePath.lastModifiedOrNull() == lastValidated -> instance
                    else -> load(type, persisted)
                }
            )
        }
        return future
    }

    override fun setExecutablePath(type: ExecutableType<*>, path: Path): CompletionStage<ExecutableInstance> {
        val future = CompletableFuture<ExecutableInstance>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val executable = validate(type, path, false)
            updateInternalState(type, executable)
            future.complete(executable)
        }
        return future
    }

    private fun load(type: ExecutableType<*>, persisted: ExecutableState?): ExecutableInstance {
        val persistedPath = persisted?.executablePath?.let { Paths.get(it) }
        val autoResolved = persisted?.autoResolved ?: false
        return when {
            persistedPath?.exists() == true -> validate(type, persistedPath, autoResolved)
            else -> resolve(type)
        }
    }

    private fun updateInternalState(type: ExecutableType<*>, instance: ExecutableInstance) {
        val resolved = instance as? ExecutableWithPath
        val newPersistedState = ExecutableState(type.id,
            resolved?.executablePath?.toString(),
            resolved?.autoResolved,
            resolved?.executablePath?.lastModifiedOrNull()?.toMillis())
        internalState[type.id] = Triple(newPersistedState, instance, resolved?.executablePath?.lastModified())
    }

    private fun resolve(type: ExecutableType<*>): ExecutableInstance = try {
        (type as? AutoResolvable)?.resolve()?.let { validate(type, it, true) } ?: ExecutableInstance.UnresolvedExecutable()
    } catch (e: Exception) {
        ExecutableInstance.UnresolvedExecutable(message("aws.settings.executables.resolution_exception", type.displayName, e.asString))
    }

    private fun validate(type: ExecutableType<*>, path: Path, autoResolved: Boolean): ExecutableInstance = try {
        (type as? Validatable)?.validate(path)
        determineVersion(type, path, autoResolved)
    } catch (e: Exception) {
        val message = message("aws.settings.executables.executable_invalid", type.displayName, e.asString)
        LOG.warn(e) { message }

        ExecutableInstance.InvalidExecutable(path,
            null,
            autoResolved,
            message
        )
    }.also { updateInternalState(type, it) }

    private fun determineVersion(type: ExecutableType<*>, path: Path, autoResolved: Boolean): ExecutableInstance = try {
        ExecutableInstance.Executable(path, type.version(path).toString(), autoResolved)
    } catch (e: Exception) {
        ExecutableInstance.InvalidExecutable(path, null, autoResolved, message("aws.settings.executables.cannot_determine_version", type.displayName, e.asString))
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
    interface ExecutableWithPath {
        val executablePath: Path
        val version: String?
        val autoResolved: Boolean
    }

    class Executable(
        override val executablePath: Path,
        override val version: String,
        override val autoResolved: Boolean
    ) : ExecutableInstance(), ExecutableWithPath

    class InvalidExecutable(
        override val executablePath: Path,
        override val version: String?,
        override val autoResolved: Boolean,
        val validationError: String
    ) : ExecutableInstance(), ExecutableWithPath

    class UnresolvedExecutable(val resolutionError: String? = null) : ExecutableInstance()
}

data class ExecutableState(
    var id: String? = null,
    var executablePath: String? = null,
    var autoResolved: Boolean? = false,
    var lastKnownFileTime: Long? = null
)
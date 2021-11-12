// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.progress.util.ProgressIndicatorUtils
import com.intellij.openapi.util.ThrowableComputable
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.lastModified
import software.aws.toolkits.core.utils.warn
import java.nio.file.Files
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock

/**
 * Stores data related to a file path. Cache is invalidated when the cache entry is detected as stale.  Errors are
 * cached until the underlying path is detected as stale. Stale is defined as the cache entries (file modification time)[Files.getLastModifiedTime]
 * is older than the path's current modification time.
 */
class ToolVersionCache {
    private val cache = ConcurrentHashMap<Tool<*>, Result<*>>()
    private val lock = ReentrantLock()

    @Suppress("UNCHECKED_CAST")
    fun <V : Version> getValue(tool: Tool<ToolType<V>>): Result<V> = ProgressIndicatorUtils.computeWithLockAndCheckingCanceled(
        lock,
        50,
        TimeUnit.MILLISECONDS,
        ThrowableComputable {
            val lastResult = cache[tool]
            var lastModifiedTime = 0L
            try {
                lastModifiedTime = tool.path.lastModified().toMillis()

                if (lastResult == null || lastResult.lastModifiedTime < lastModifiedTime) {
                    Result.Success(getVersion(tool), lastModifiedTime).also {
                        cache[tool] = it
                    } as Result<V>
                } else {
                    lastResult as Result<V>
                }
            } catch (e: Exception) {
                LOG.warn(e) { "Unable to get tool version for $tool" }
                Result.Failure(e, lastModifiedTime).also {
                    cache[tool] = it
                } as Result<V>
            }
        }
    )

    private fun <T : Version> getVersion(tool: Tool<ToolType<T>>): Version = tool.type.determineVersion(tool.path)

    sealed class Result<T : Version>(open val lastModifiedTime: Long) {
        data class Failure(val reason: Exception, override val lastModifiedTime: Long) : Result<Nothing>(lastModifiedTime)
        data class Success<V : Version>(val version: V, override val lastModifiedTime: Long) : Result<V>(lastModifiedTime)
    }

    private companion object {
        val LOG = getLogger<ToolVersionCache>()
    }
}

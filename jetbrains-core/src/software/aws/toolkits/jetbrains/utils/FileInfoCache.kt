// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProcessCanceledException
import org.jetbrains.annotations.TestOnly
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import org.jetbrains.concurrency.isPending
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.resources.message
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Paths
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Stores data related to a file path. Cache is invalidated when the cache entry is detected as stale.  Errors are
 * cached until the underlying path is detected as stale. Stale is defined as the cache entries (file modification time)[Files.getLastModifiedTime]
 * is older than the path's current modification time.
 */
abstract class FileInfoCache<T> {
    private val logger: Logger = LoggerFactory.getLogger(this::class.java)
    private val infoCache = hashMapOf<String, InfoResult<T>>()
    private val lock = Object()

    /**
     * @return A promise for the requested file info. Promise will be resolved when the info is ready.
     */
    fun evaluate(path: String): Promise<T> {
        logger.info { "Evaluating $path" }

        val asyncPromise = AsyncPromise<T>()
        asyncPromise
            .onSuccess { result ->
                logger.info { "File info evaluation is completed: '$result'" }
            }
            .onError { error -> // Need to set an error handler early, else the setError call will throw AssertionError
                if (error !is ProcessCanceledException) {
                    logger.info(error) { "Failed to evaluate $path" }
                }
            }

        val infoResult = synchronized(lock) {
            getCacheEntry(path, asyncPromise)
        }

        if (infoResult.result == asyncPromise && asyncPromise.isPending) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    val result = getFileInfo(path)
                    asyncPromise.setResult(result)
                } catch (t: Throwable) {
                    asyncPromise.setError(t)
                }
            }
        }

        return infoResult.result
    }

    private fun getCacheEntry(path: String, asyncPromise: AsyncPromise<T>): InfoResult<T> {
        val cacheEntry = infoCache[path]

        val currentLastModificationDate = try {
            Files.getLastModifiedTime(Paths.get(path)).toInstant()
        } catch (e: NoSuchFileException) {
            // If unable to get the current time, override the cache entry that the file can't be found

            asyncPromise.setError(IllegalStateException(message("general.file_not_found", path)))

            val newResult = InfoResult(asyncPromise, Instant.MIN)
            infoCache[path] = newResult
            return newResult
        }

        // If the promise is fulfilled, and the path has been modified since last checking, we need to check again
        return if (cacheEntry == null ||
            (!cacheEntry.result.isPending && currentLastModificationDate.isAfter(cacheEntry.timestamp))
        ) {
            logger.info { "InfoResult for $path is either missing, or stale. Checking again" }

            val newResult = InfoResult(asyncPromise, currentLastModificationDate)
            infoCache[path] = newResult
            newResult
        } else {
            cacheEntry
        }
    }

    @Suppress("UNCHECKED_CAST")
    fun evaluateBlocking(path: String, blockingTime: Int = 500, blockingUnit: TimeUnit = TimeUnit.MILLISECONDS): T {
        val promise = evaluate(path)
        return promise.blockingGet(blockingTime, blockingUnit).also {
            if (!promise.isSucceeded) {
                throw IllegalStateException("Promise did not succeed successfully")
            }
        } as T
    }

    @TestOnly
    fun testOnlyGetRequestCache() = infoCache

    protected abstract fun getFileInfo(path: String): T

    data class InfoResult<T>(val result: Promise<T>, internal val timestamp: Instant)
}
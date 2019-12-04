// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.util.io.FileUtil
import software.aws.toolkits.resources.message
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Paths
import java.time.Instant

/**
 * Stores data related to a file path. Cache is invalidated when the cache entry is detected as stale.  Errors are
 * cached until the underlying path is detected as stale. Stale is defined as the cache entries (file modification time)[Files.getLastModifiedTime]
 * is older than the path's current modification time.
 */
abstract class FileInfoCache<T> : CachingAsyncEvaluator<String, FileInfoCache.InfoResult<T>>() {

    override fun getValue(entry: String): InfoResult<T> {
        if (!FileUtil.exists(entry))
            throw IllegalStateException(message("general.file_not_found", entry))

        return InfoResult(getFileInfo(entry), getLastModificationDate(entry))
    }

    override fun isInvalidated(entry: String, value: InfoResult<T>): Boolean =
        getLastModificationDate(entry).isAfter(value.timestamp)

    protected abstract fun getFileInfo(path: String): T

    private fun getLastModificationDate(path: String): Instant {
        try {
            return Files.getLastModifiedTime(Paths.get(path)).toInstant()
        } catch (e: NoSuchFileException) {
            // If unable to get the current time, override the cache entry that the file can't be found
            throw IllegalStateException(message("general.file_not_found", path))
        }
    }

    data class InfoResult<T>(val result: T, internal val timestamp: Instant)
}

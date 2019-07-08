// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import software.aws.toolkits.resources.message
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Paths
import java.time.Instant

abstract class FileInfoCache<T> {
    private val infoCache = mutableMapOf<String, InfoResult<T>>()

    @Synchronized
    fun getResult(path: String): T {
        val cacheResult = infoCache.remove(path)
        val currentLastModificationDate = try {
            Files.getLastModifiedTime(Paths.get(path)).toInstant()
        } catch (e: NoSuchFileException) {
            throw IllegalStateException(message("general.file_not_found", path))
        }

        val infoResult = if (cacheResult == null || currentLastModificationDate.isAfter(cacheResult.timestamp)) {
            InfoResult(getFileInfo(path), currentLastModificationDate)
        } else {
            cacheResult
        }
        infoCache[path] = infoResult

        return infoResult.result
    }

    abstract fun getFileInfo(path: String): T

    private class InfoResult<T>(val result: T, val timestamp: Instant)
}
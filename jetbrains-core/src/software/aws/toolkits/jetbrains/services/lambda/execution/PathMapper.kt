// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution

import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.io.FileUtil
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.lambda.execution.PathMapper.Companion.normalizeLocal
import java.nio.file.Files
import java.nio.file.Paths
import java.util.Objects

/**
 * Maps a local path to a remote path. The order of the list indicates the order of priority where first possible
 * candidate wins out. When mapping back to the local file system, the file must exist for it to count as a match.
 */
class PathMapper(private val mappings: List<PathMapping>) {
    fun convertToLocal(remotePath: String): String? {
        val normalizedRemote = FileUtil.normalize(remotePath)
        for (mapping in mappings) {
            if (normalizedRemote.startsWith(mapping.remoteRoot)) {
                val localPath = normalizedRemote.replaceFirst(mapping.remoteRoot, mapping.localRoot)
                if (Files.exists(Paths.get(FileUtil.toSystemDependentName(localPath)))) {
                    return localPath
                }
            }
        }
        LOG.debug { "Failed to map $remotePath to local file system: $mappings" }
        return null
    }

    fun convertToRemote(localPath: String): String? {
        val normalizedLocal = normalizeLocal(localPath)
        for (mapping in mappings) {
            if (normalizedLocal.startsWith(mapping.localRoot)) {
                return FileUtil.normalize(normalizedLocal.replaceFirst(mapping.localRoot, mapping.remoteRoot))
            }
        }
        LOG.debug { "Failed to map $localPath to remote file system: $mappings" }
        return null
    }

    companion object {
        private val LOG = getLogger<PathMapper>()

        fun normalizeLocal(localPath: String): String {
            val updatedPath = if (SystemInfo.isWindows) {
                localPath.toLowerCase()
            } else {
                localPath
            }

            return FileUtil.normalize(updatedPath)
        }
    }
}

class PathMapping(localPath: String, remotePath: String) {
    internal val localRoot = normalizeLocal("$localPath/")
    internal val remoteRoot = FileUtil.normalize("$remotePath/")

    override fun toString() = "PathMapping(localRoot='$localRoot', remoteRoot='$remoteRoot')"

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as PathMapping

        if (localRoot != other.localRoot) return false
        if (remoteRoot != other.remoteRoot) return false

        return true
    }

    override fun hashCode(): Int = Objects.hash(localRoot, remoteRoot)
}
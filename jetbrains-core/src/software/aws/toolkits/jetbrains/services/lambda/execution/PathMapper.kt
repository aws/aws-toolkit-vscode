// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution

import com.intellij.openapi.util.io.FileUtil
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import java.nio.file.Files
import java.nio.file.Paths

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
        LOG.info { "Failed to map $remotePath to local file system: $mappings" }
        return null
    }

    fun convertToRemote(localPath: String): String? {
        val normalizedLocal = FileUtil.normalize(localPath)
        for (mapping in mappings) {
            if (normalizedLocal.startsWith(mapping.localRoot)) {
                return normalizedLocal.replaceFirst(mapping.localRoot, mapping.remoteRoot)
            }
        }
        LOG.info { "Failed to map $localPath to remote file system: $mappings" }
        return null
    }

    private companion object {
        val LOG = getLogger<PathMapper>()
    }
}

class PathMapping(localPath: String, remotePath: String) {
    internal val localRoot = FileUtil.normalize("$localPath/")
    internal val remoteRoot = FileUtil.normalize("$remotePath/")

    override fun toString() = "PathMapping(localRoot='$localRoot', remoteRoot='$remoteRoot')"
}
// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services

import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.io.FileUtil
import com.intellij.xdebugger.XSourcePosition
import com.jetbrains.python.debugger.PyLocalPositionConverter
import com.jetbrains.python.debugger.PySourcePosition
import com.intellij.util.io.isFile
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.PathMapper.Companion.normalizeLocal
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
        val (normalizedPath, ignoreCase) = if (SystemInfo.isWindows) {
            FileUtil.normalize(localPath) to true
        } else {
            localPath to false
        }
        for (mapping in mappings) {
            if (normalizedPath.startsWith(mapping.localRoot, ignoreCase)) {
                return FileUtil.normalize(normalizedPath.replaceFirst(mapping.localRoot, mapping.remoteRoot, ignoreCase))
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

            return FileUtil.toCanonicalPath(updatedPath, true)
        }
    }

    /**
     * Converts the IDE's view of the world into the Docker image's view allowing for breakpoints and frames to work
     */
    internal class PositionConverter(private val pathMapper: PathMapper) : PyLocalPositionConverter() {
        class PyLocalSourcePosition(file: String, line: Int) : PySourcePosition(file, line) {

            override fun normalize(file: String?): String? = file?.let {
                super.normalize(file)
            }
        }

        override fun convertToPython(filePath: String, line: Int): PySourcePosition {
            val localSource = PyLocalSourcePosition(filePath, line)
            val remoteFile = pathMapper.convertToRemote(localSource.file) ?: localSource.file
            return PyRemoteSourcePosition(remoteFile, localSource.line)
        }

        override fun convertFromPython(position: PySourcePosition, frameName: String?): XSourcePosition? {
            val localFile = pathMapper.convertToLocal(position.file) ?: position.file
            return createXSourcePosition(getVirtualFile(localFile), position.line)
        }
    }
}

class PathMapping(localPath: String, remoteDirectory: String) {
    private val directory = Paths.get(localPath).let {
        if (it.isFile()) {
            it.parent.toString()
        } else {
            localPath
        }
    }
    val localRoot = normalizeLocal(directory) + "/"
    val remoteRoot = FileUtil.normalize("$remoteDirectory/")

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

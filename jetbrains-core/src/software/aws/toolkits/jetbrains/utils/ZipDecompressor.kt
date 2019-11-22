// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.io.FileUtil
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipFile
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermission

// TODO: Write tests
class ZipDecompressor(sourceFile: File) : AutoCloseable {
    private val zipFile = ZipFile(sourceFile)
    private val zipEntries = zipFile.entries.toList()
    private val directorySplitRegex = Regex.fromLiteral("""[/\\]""")

    fun extract(destination: File) {
        zipEntries.forEach {
            val outputFile = outputFile(destination, it.name)
            // TODO: Handle symlink if we ever need it
            when {
                it.isDirectory -> FileUtil.createDirectory(outputFile)
                else -> createFile(outputFile, it)
            }
        }
    }

    private fun createFile(outputFile: File, zipEntry: ZipArchiveEntry) {
        zipFile.getInputStream(zipEntry).use { zipStream ->
            FileUtil.createParentDirs(outputFile)

            FileOutputStream(outputFile).use { outputStream ->
                zipStream.copyTo(outputStream)
            }

            if (SystemInfo.isUnix) {
                Files.setPosixFilePermissions(outputFile.toPath(), convertPermissions(zipEntry.unixMode))
            }
        }
    }

    private fun outputFile(outputDir: File, entryName: String): File {
        if (entryName.split(directorySplitRegex).contains("..")) {
            throw IOException("Entry name attempting to traverse up directory: $entryName")
        }

        return File(outputDir, entryName)
    }

    private fun convertPermissions(mode: Int): Set<PosixFilePermission> {
        val permissions = mutableSetOf<PosixFilePermission>()
        if ((mode and 400) > 0) {
            permissions.add(PosixFilePermission.OWNER_READ)
        }
        if ((mode and 200) > 0) {
            permissions.add(PosixFilePermission.OWNER_WRITE)
        }
        if ((mode and 100) > 0) {
            permissions.add(PosixFilePermission.OWNER_EXECUTE)
        }
        if ((mode and 40) > 0) {
            permissions.add(PosixFilePermission.GROUP_READ)
        }
        if ((mode and 20) > 0) {
            permissions.add(PosixFilePermission.GROUP_WRITE)
        }
        if ((mode and 10) > 0) {
            permissions.add(PosixFilePermission.GROUP_EXECUTE)
        }
        if ((mode and 4) > 0) {
            permissions.add(PosixFilePermission.OTHERS_READ)
        }
        if ((mode and 2) > 0) {
            permissions.add(PosixFilePermission.OTHERS_WRITE)
        }
        if ((mode and 1) > 0) {
            permissions.add(PosixFilePermission.OTHERS_EXECUTE)
        }
        return permissions
    }

    override fun close() {
        zipFile.close()
    }
}

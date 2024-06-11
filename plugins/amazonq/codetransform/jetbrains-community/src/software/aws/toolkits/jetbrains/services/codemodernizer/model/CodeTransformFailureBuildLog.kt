// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.intellij.openapi.util.io.FileUtil.createTempDirectory
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.unzipFile
import java.io.File
import java.nio.file.Path
import kotlin.io.path.Path

/**
 * Represents a CodeModernizer artifact. Essentially a wrapper around the manifest file in the downloaded artifact zip.
 */
open class CodeTransformFailureBuildLog(
    val logFile: File
) : CodeTransformDownloadArtifact {
    companion object : CodeTransformDownloadArtifact {
        private val tempDir = createTempDirectory("codeTransformBuildLog", null)

        // We currently don't have a need for information in the "manifest.json", so we just ignore it.
        // In the future if we have multiple build artifacts available, then we can use this to
        // determine the path to each artifact
        private const val BUILD_LOG_NAME_IN_ZIP = "buildCommandOutput.log"
        private val LOG = getLogger<CodeTransformFailureBuildLog>()

        /**
         * Extracts the file at [zipPath] and uses its contents to produce a [CodeTransformFailureBuildLog].
         * If anything goes wrong during this process an exception is thrown.
         */
        fun create(zipPath: String): CodeTransformFailureBuildLog {
            val path = Path(zipPath)
            if (path.exists()) {
                if (!unzipFile(path, tempDir.toPath())) {
                    LOG.error { "Could not unzip failure build log" }
                    throw RuntimeException("Could not unzip failure build log")
                }
                val logFile = extractBuildLogFile(tempDir.toPath())
                return CodeTransformFailureBuildLog(logFile)
            }
            throw RuntimeException("Could not find build log")
        }

        private fun extractBuildLogFile(dirPath: Path): File {
            val buildLogPath = dirPath.resolve(BUILD_LOG_NAME_IN_ZIP)
            if (!buildLogPath.exists()) {
                throw RuntimeException("Could not find build log")
            }

            return buildLogPath.toAbsolutePath().toFile()
        }
    }
}

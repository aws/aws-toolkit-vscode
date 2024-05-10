// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.unzipFile
import java.io.File
import java.nio.file.Path
import kotlin.io.path.pathString

const val MANIFEST_PATH_IN_ZIP = "manifest.json"
const val POM_PATH_IN_ZIP = "pomFolder/pom.xml"

/**
 * Represents a CodeModernizer artifact. Essentially a wrapper around the manifest file in the downloaded artifact zip.
 */
open class CodeTransformHilDownloadArtifact(
    val manifest: CodeTransformHilDownloadManifest,
    val pomFile: File,
) {
    companion object {
        private val LOG = getLogger<CodeTransformHilDownloadArtifact>()
        private val MAPPER = jacksonObjectMapper()

        /**
         * Extracts the file at [zipPath] and uses its contents to produce a [CodeTransformHilDownloadArtifact].
         * If anything goes wrong during this process an exception is thrown.
         */
        fun create(zipPath: Path, outputDirPath: Path): CodeTransformHilDownloadArtifact {
            if (zipPath.exists()) {
                if (!unzipFile(zipPath, outputDirPath)) {
                    LOG.error { "Could not unzip artifact" }
                    throw RuntimeException("Could not unzip artifact")
                }
                val manifest = extractManifest(outputDirPath)
                val pomFile = extractDependencyPom(outputDirPath)
                return CodeTransformHilDownloadArtifact(manifest, pomFile)
            }
            throw RuntimeException("Could not find artifact")
        }

        /**
         * Attempts to extract the manifest from the zip file. Throws an exception if the manifest is not found or cannot be serialized.
         */
        private fun extractManifest(dirPath: Path): CodeTransformHilDownloadManifest {
            try {
                val manifestPath = dirPath.resolve(MANIFEST_PATH_IN_ZIP)
                if (!manifestPath.exists()) {
                    throw RuntimeException("Could not find manifest")
                }

                val manifestFile = File(manifestPath.pathString)
                val manifest = MAPPER.readValue<CodeTransformHilDownloadManifest>(manifestFile)
                if (
                    manifest.pomArtifactId == null ||
                    manifest.pomFolderName == null ||
                    manifest.hilCapability == null ||
                    manifest.pomGroupId == null ||
                    manifest.sourcePomVersion == null
                ) {
                    throw RuntimeException(
                        "Unable to deserialize the manifest"
                    )
                }
                return manifest
            } catch (exception: JsonProcessingException) {
                throw RuntimeException("Unable to deserialize the manifest")
            }
        }

        private fun extractDependencyPom(dirPath: Path): File {
            val pomFilePath = dirPath.resolve(POM_PATH_IN_ZIP)
            if (!pomFilePath.exists()) {
                throw RuntimeException("Could not find pom.xml")
            }

            return pomFilePath.toAbsolutePath().toFile()
        }
    }
}

// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util

import java.nio.file.Path
import kotlin.io.path.createDirectories
import kotlin.io.path.deleteIfExists
import kotlin.io.path.writeBytes

/**
 * FileUtils.kt
 *
 * These are utility functions to abstact file IO calls for testing purposes.
 */

fun resolveAndCreateOrUpdateFile(projectRootPath: Path, relativeFilePath: String, fileContent: String) {
    val filePath = projectRootPath.resolve(relativeFilePath)
    filePath.parent.createDirectories() // Create directories if needed
    filePath.writeBytes(fileContent.toByteArray(Charsets.UTF_8))
}

fun resolveAndDeleteFile(projectRootPath: Path, relativePath: String) {
    val filePath = projectRootPath.resolve(relativePath)
    filePath.deleteIfExists()
}

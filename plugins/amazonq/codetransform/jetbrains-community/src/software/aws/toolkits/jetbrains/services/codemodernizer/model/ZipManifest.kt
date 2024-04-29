// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import software.aws.toolkits.jetbrains.services.codemodernizer.BUILD_LOG_PATH
import software.aws.toolkits.jetbrains.services.codemodernizer.EXPLAINABILITY_V1
import software.aws.toolkits.jetbrains.services.codemodernizer.UPLOAD_ZIP_MANIFEST_VERSION
import software.aws.toolkits.jetbrains.services.codemodernizer.ZIP_SOURCES_PATH

data class ZipManifest(
    val sourcesRoot: String = ZIP_SOURCES_PATH,
    val dependenciesRoot: String? = null,
    val buildLogs: String = BUILD_LOG_PATH,
    val version: String = UPLOAD_ZIP_MANIFEST_VERSION.toString(),
    val transformCapabilities: List<String> = listOf(EXPLAINABILITY_V1)
)

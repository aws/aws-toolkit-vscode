// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(ignoreUnknown = true)
data class HilInput(
    val dependenciesRoot: String,
    val pomGroupId: String,
    val pomArtifactId: String,
    val targetPomVersion: String,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CodeTransformHilUploadManifest(
    val hilCapability: String = "HIL_1pDependency_VersionUpgrade",
    val hilInput: HilInput,
)

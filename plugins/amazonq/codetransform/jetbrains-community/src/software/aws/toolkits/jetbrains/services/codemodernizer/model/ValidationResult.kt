// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.telemetry.CodeTransformBuildSystem

data class ValidationResult(
    val valid: Boolean,
    val invalidReason: String? = null,
    val invalidTelemetryReason: InvalidTelemetryReason = InvalidTelemetryReason(),
    val validatedBuildFiles: List<VirtualFile> = emptyList(),
    val validatedProjectJdkName: String = "",
    val buildSystem: CodeTransformBuildSystem = CodeTransformBuildSystem.Unknown,
    val buildSystemVersion: String = ""
)

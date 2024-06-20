// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

sealed class DownloadArtifactResult {
    data class Success(val artifact: CodeTransformDownloadArtifact, val zipPath: String) : DownloadArtifactResult()
    object Skipped : DownloadArtifactResult()
    data class DownloadFailure(val failureReason: DownloadFailureReason) : DownloadArtifactResult()
    data class ParseZipFailure(val failureReason: ParseZipFailureReason) : DownloadArtifactResult()
    data class UnzipFailure(val failureReason: UnzipFailureReason) : DownloadArtifactResult()
}

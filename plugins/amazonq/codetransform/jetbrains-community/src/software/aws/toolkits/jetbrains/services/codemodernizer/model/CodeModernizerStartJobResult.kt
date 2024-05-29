// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

sealed class CodeModernizerStartJobResult {
    data class ZipCreationFailed(val reason: String) : CodeModernizerStartJobResult()
    data class ZipUploadFailed(val reason: UploadFailureReason) : CodeModernizerStartJobResult()
    data class Started(val jobId: JobId) : CodeModernizerStartJobResult()
    data class UnableToStartJob(val exception: String) : CodeModernizerStartJobResult()
    object Cancelled : CodeModernizerStartJobResult()
    object CancelledMissingDependencies : CodeModernizerStartJobResult()
    object CancelledZipTooLarge : CodeModernizerStartJobResult()
    object Disposed : CodeModernizerStartJobResult()
}

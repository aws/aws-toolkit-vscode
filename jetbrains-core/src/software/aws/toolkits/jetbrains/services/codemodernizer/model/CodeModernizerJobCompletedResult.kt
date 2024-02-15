// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.intellij.openapi.projectRoots.JavaSdkVersion

sealed class CodeModernizerJobCompletedResult {
    data class RetryableFailure(val jobId: JobId, val failureReason: String) : CodeModernizerJobCompletedResult()
    data class UnableToCreateJob(val failureReason: String, val retryable: Boolean = false) : CodeModernizerJobCompletedResult()
    data class JobFailed(val jobId: JobId, val failureReason: String?) : CodeModernizerJobCompletedResult()

    data class JobCompletedSuccessfully(val jobId: JobId) : CodeModernizerJobCompletedResult()
    data class JobPartiallySucceeded(val jobId: JobId, val targetJavaVersion: JavaSdkVersion) : CodeModernizerJobCompletedResult()
    data class JobFailedInitialBuild(val jobId: JobId, val failureReason: String) : CodeModernizerJobCompletedResult()
    object ManagerDisposed : CodeModernizerJobCompletedResult()
    object JobAbortedBeforeStarting : CodeModernizerJobCompletedResult()
    object JobAbortedMissingDependencies : CodeModernizerJobCompletedResult()
}

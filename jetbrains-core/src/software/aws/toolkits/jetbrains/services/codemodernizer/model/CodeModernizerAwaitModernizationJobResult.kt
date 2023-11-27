// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan

sealed class CodeModernizerAwaitModernizationJobResult {
    data class ZipCreationFailed(val reason: String) : CodeModernizerAwaitModernizationJobResult()
    data class Started(val jobId: JobId) : CodeModernizerAwaitModernizationJobResult()
    data class UnableToStartJob(val exception: String) : CodeModernizerAwaitModernizationJobResult()
}

sealed class AwaitModernizationPlanResult {
    object UnknownStatusWhenPolling : AwaitModernizationPlanResult()
    data class Success(val plan: TransformationPlan) : AwaitModernizationPlanResult()

    data class Failure(val failureReason: String) : AwaitModernizationPlanResult()
    data class BuildFailed(val failureReason: String) : AwaitModernizationPlanResult()
}

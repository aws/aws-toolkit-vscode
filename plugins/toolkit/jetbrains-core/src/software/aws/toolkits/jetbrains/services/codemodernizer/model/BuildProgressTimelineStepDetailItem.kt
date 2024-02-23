// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

data class BuildProgressTimelineStepDetailItem(
    val text: String,
    val description: String,
    val status: BuildStepStatus,
    var runtime: String? = null,
    var finishedTime: String? = null
)

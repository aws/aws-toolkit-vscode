// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients

data class GenerateTaskAssistPlanResult(
    val approach: String,
    val succeededPlanning: Boolean
)

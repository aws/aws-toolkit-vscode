// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

data class DeployServerlessApplicationSettings(
    val stackName: String,
    val bucket: String,
    val ecrRepo: String?,
    val autoExecute: Boolean,
    val parameters: Map<String, String>,
    val tags: Map<String, String>,
    val useContainer: Boolean,
    val capabilities: List<CreateCapabilities>
)

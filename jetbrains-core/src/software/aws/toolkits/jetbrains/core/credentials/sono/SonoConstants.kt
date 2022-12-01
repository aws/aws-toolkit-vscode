// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sono

import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection

internal const val SONO_REGION = "us-east-1"
internal const val SONO_URL = "https://view.awsapps.com/start"

// limit of 10
// at least one scope must be provided
internal val ALL_SSO_SCOPES = listOf(
    "codewhisperer:completions",
    "codewhisperer:analysis",
)

internal val ALL_AVAILABLE_SCOPES = ALL_SSO_SCOPES + listOf(
    "codecatalyst:read_write"
)

fun ToolkitConnection?.isSono() = if (this == null) {
    false
} else {
    this is ManagedBearerSsoConnection && this.startUrl == SONO_URL
}

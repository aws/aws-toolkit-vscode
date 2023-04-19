// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sono

import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection

const val SONO_REGION = "us-east-1"
const val SONO_URL = "https://view.awsapps.com/start"
internal val CODEWHISPERER_SCOPES = listOf(
    "codewhisperer:completions",
    "codewhisperer:analysis",
)
internal val CODECATALYST_SCOPES = listOf(
    "codecatalyst:read_write"
)

// limit of 10
// at least one scope must be provided
internal val ALL_SSO_SCOPES = CODEWHISPERER_SCOPES
val ALL_SONO_SCOPES = CODEWHISPERER_SCOPES + CODECATALYST_SCOPES

fun ToolkitConnection?.isSono() = if (this == null) {
    false
} else {
    this is ManagedBearerSsoConnection && this.startUrl == SONO_URL
}

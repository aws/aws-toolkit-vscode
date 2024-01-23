// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sono

import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection

const val SONO_REGION = "us-east-1"
const val SONO_URL = "https://view.awsapps.com/start"

const val IDENTITY_CENTER_ROLE_ACCESS_SCOPE = "sso:account:access"

val CODEWHISPERER_SCOPES = listOf(
    "codewhisperer:completions",
    "codewhisperer:analysis",
)

val Q_SCOPES = listOf(
    "codewhisperer:conversations",
    "codewhisperer:transformations",
    "codewhisperer:taskassist"
)

val Q_SCOPES_UNAVAILABLE_BUILDER_ID = listOf(
    "codewhisperer:transformations",
    "codewhisperer:taskassist"
)

val CODECATALYST_SCOPES = listOf(
    "codecatalyst:read_write"
)

fun ToolkitConnection?.isSono() = if (this == null) {
    false
} else {
    this is ManagedBearerSsoConnection && this.startUrl == SONO_URL
}

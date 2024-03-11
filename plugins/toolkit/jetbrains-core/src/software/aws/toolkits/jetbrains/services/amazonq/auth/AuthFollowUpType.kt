// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.auth

import com.fasterxml.jackson.annotation.JsonValue

enum class AuthFollowUpType(
    @field:JsonValue val json: String,
) {
    FullAuth("full-auth"),
    ReAuth("re-auth"),
    MissingScopes("missing_scopes"),
    Unsupported("use-supported-auth"),
}

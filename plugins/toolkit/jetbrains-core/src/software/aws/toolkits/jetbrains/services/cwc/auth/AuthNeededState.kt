// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.auth

data class AuthNeededState(
    val message: String,
    val authType: AuthFollowUpType
)

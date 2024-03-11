// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.auth

data class AuthNeededState(
    val message: String,
    val authType: AuthFollowUpType
)

data class AuthNeededStates(
    val chat: AuthNeededState? = null,
    val amazonQ: AuthNeededState? = null
)

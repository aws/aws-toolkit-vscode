// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.exceptions

/**
 * Base class for exceptions thrown by this app
 */
open class ChatException(
    message: String,
    cause: Throwable? = null
) : Exception(message, cause)

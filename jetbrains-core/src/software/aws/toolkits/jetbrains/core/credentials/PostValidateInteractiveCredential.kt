// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

/**
 * Marker interface for credentials that may require interactivity after [AwsConnectionManager] attempts validation
 */
interface PostValidateInteractiveCredential {
    fun handleValidationException(e: Exception): ConnectionState.RequiresUserAction?
}

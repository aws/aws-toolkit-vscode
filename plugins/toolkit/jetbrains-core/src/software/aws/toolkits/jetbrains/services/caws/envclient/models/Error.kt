// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws.envclient.models

/**
 * @param message A description of the error condition
 */
data class Error(
    /* A description of the error condition */
    val message: String? = null
)

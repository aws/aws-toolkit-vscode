// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws.envclient.models

/**
 * Project to create a devfile from.
 * @param path
 */
data class CreateDevfileRequest(
    val path: String
)

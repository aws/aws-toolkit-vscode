// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.auth

// Data class that represents the schema used for DB secrets in secretsmanger
// used by RDS and Redshift
data class SecretsManagerDbSecret(
    val username: String?,
    val password: String?,
    val engine: String?,
    val host: String?,
    val port: String?
)

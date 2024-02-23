// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

data class RdsDatasourceConfiguration(
    val regionId: String,
    val credentialId: String,
    val database: RdsDatabase,
    val username: String
)

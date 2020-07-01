// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import software.amazon.awssdk.services.rds.model.Endpoint

data class RdsDatasourceConfiguration(
    val regionId: String,
    val credentialId: String,
    val dbEngine: String,
    val endpoint: Endpoint,
    val username: String
)

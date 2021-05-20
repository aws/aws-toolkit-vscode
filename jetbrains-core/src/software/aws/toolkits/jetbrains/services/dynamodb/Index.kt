// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb

data class Index(
    val displayName: String,
    val indexName: String?,
    val partitionKey: String,
    val sortKey: String?
)

// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb

import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource

object DynamoDbResources {
    val LIST_TABLES = ClientBackedCachedResource(DynamoDbClient::class, "dynamodb.list_tables") {
        listTablesPaginator().tableNames().toList()
    }
}

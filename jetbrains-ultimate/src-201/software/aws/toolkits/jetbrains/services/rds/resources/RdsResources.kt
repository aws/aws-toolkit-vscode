// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.resources

import software.amazon.awssdk.services.rds.RdsClient
import software.amazon.awssdk.services.rds.model.DBInstance
import software.amazon.awssdk.services.rds.model.Filter
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.services.rds.AuroraMySql
import software.aws.toolkits.jetbrains.services.rds.RdsEngine

// FIX_WHEN_MIN_IS_202 remove this one and merge the 202+ one into RdsResources
// Filters are also just a string
private const val ENGINE_FILTER = "engine"

val LIST_SUPPORTED_INSTANCES: Resource.Cached<List<DBInstance>> = ClientBackedCachedResource(RdsClient::class, "rds.list_supported_instances") {
    describeDBInstancesPaginator {
        it.filters(
            Filter.builder()
                .name(ENGINE_FILTER)
                .values(
                    RdsEngine
                        .values()
                        // Filter out AuroraMySql because it is only supported on 202+
                        .filterNot { e -> e == AuroraMySql }
                        .flatMap { e -> e.engines }
                ).build()
        )
    }.dbInstances().toList()
}

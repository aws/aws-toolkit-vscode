// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.resources

import software.amazon.awssdk.services.rds.RdsClient
import software.amazon.awssdk.services.rds.model.Filter
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.services.rds.Endpoint
import software.aws.toolkits.jetbrains.services.rds.RdsDatabase
import software.aws.toolkits.jetbrains.services.rds.RdsEngine

// Filters are also just a string
private const val ENGINE_FILTER = "engine"

val LIST_SUPPORTED_INSTANCES: Resource.Cached<List<RdsDatabase>> = ClientBackedCachedResource(RdsClient::class, "rds.list_supported_instances") {
    describeDBInstancesPaginator {
        it.filters(
            Filter.builder()
                .name(ENGINE_FILTER)
                .values(
                    RdsEngine
                        .values()
                        .flatMap { e -> e.engines }
                ).build()
        )
    }.dbInstances()
        .map {
            RdsDatabase(
                // if it has a cluster (aurora), use that as the identifier so it will de-dupe
                identifier = it.dbClusterIdentifier() ?: it.dbInstanceIdentifier(),
                arn = it.dbInstanceArn(),
                engine = it.engine(),
                iamDatabaseAuthenticationEnabled = it.iamDatabaseAuthenticationEnabled(),
                masterUsername = it.masterUsername(),
                endpoint = Endpoint(
                    host = it.endpoint().address(),
                    port = it.endpoint().port()
                )
            )
        }.toList()
}

val LIST_SUPPORTED_CLUSTERS: Resource.Cached<List<RdsDatabase>> = ClientBackedCachedResource(RdsClient::class, "rds.list_supported_cluster") {
    describeDBClustersPaginator {
        it.filters(
            Filter.builder()
                .name(ENGINE_FILTER)
                .values(
                    RdsEngine
                        .values()
                        .flatMap { e -> e.engines }
                ).build()
        )
    }.dbClusters()
        .map {
            RdsDatabase(
                identifier = it.dbClusterIdentifier(),
                arn = it.dbClusterArn(),
                engine = it.engine(),
                iamDatabaseAuthenticationEnabled = it.iamDatabaseAuthenticationEnabled(),
                masterUsername = it.masterUsername(),
                endpoint = Endpoint(
                    host = it.endpoint(),
                    port = it.port()
                )
            )
        }.toList()
}

// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import software.amazon.awssdk.services.rds.RdsClient
import software.amazon.awssdk.services.rds.model.DBInstance
import software.amazon.awssdk.services.rds.model.Filter
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

// These are the member engine in DBInstance, but it is a string
const val mysqlEngineType = "mysql"
const val postgresEngineType = "postgres"

fun DBInstance.rdsEngine(): RdsEngine = RdsEngine.fromEngine(engine())

const val jdbcMysql = "mysql"
const val jdbcMariadb = "mariadb"
const val jdbcPostgres = "postgresql"

// Filters are also just a string
private const val ENGINE_FILTER = "engine"

object RdsResources {
    private val RDS_REGION_REGEX =
        """.*\.(.+).rds\.""".toRegex()
    private val RDS_IDENTIFIER_REGEX =
        """.*//(.+)\..*\..*.rds\..""".toRegex()

    fun extractRegionFromUrl(url: String?): String? = url?.let { RDS_REGION_REGEX.find(url)?.groupValues?.get(1) }

    val LIST_SUPPORTED_INSTANCES: Resource.Cached<List<DBInstance>> = ClientBackedCachedResource(RdsClient::class, "rds.list_supported_instances") {
        describeDBInstancesPaginator {
            it.filters(Filter.builder().name(ENGINE_FILTER).values(RdsEngine.values().flatMap { e -> e.engines }).build())
        }.dbInstances().toList()
    }
}

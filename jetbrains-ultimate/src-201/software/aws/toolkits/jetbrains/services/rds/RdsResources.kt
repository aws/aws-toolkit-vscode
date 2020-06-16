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
const val jdbcMysql = "mysql"
const val jdbcPostgres = "postgresql"

// Filters are also just a string
const val engineFilter = "engine"

object RdsResources {
    private val RDS_REGION_REGEX = """.*\.(.+).rds\.""".toRegex()
    fun extractRegionFromUrl(url: String?): String? = url?.let { RDS_REGION_REGEX.find(url)?.groupValues?.get(1) }

    val LIST_INSTANCES_MYSQL: Resource.Cached<List<DBInstance>> = listInstancesFilter(mysqlEngineType)
    val LIST_INSTANCES_POSTGRES: Resource.Cached<List<DBInstance>> = listInstancesFilter(postgresEngineType)

    private fun listInstancesFilter(engine: String) = ClientBackedCachedResource(RdsClient::class, "rds.list_instances.$engine") {
        this.describeDBInstancesPaginator {
            it.filters(Filter.builder().name(engineFilter).values(engine).build())
        }.toList().flatMap { it.dbInstances() }
    }
}

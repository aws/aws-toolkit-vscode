// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import software.amazon.awssdk.services.rds.model.DBInstance

// These are the member engine in DBInstance, but it is a string
const val mysqlEngineType = "mysql"
const val postgresEngineType = "postgres"

fun DBInstance.rdsEngine(): RdsEngine = RdsEngine.fromEngine(engine())

const val jdbcMysql = "mysql"
const val jdbcMysqlAurora = "mysql:aurora"
const val jdbcPostgres = "postgresql"

object RdsResources {
    private val RDS_REGION_REGEX =
        """.*\.(.+).rds\.""".toRegex()

    fun extractRegionFromUrl(url: String?): String? = url?.let { RDS_REGION_REGEX.find(url)?.groupValues?.get(1) }
}

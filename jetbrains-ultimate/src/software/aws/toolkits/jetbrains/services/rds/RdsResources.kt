// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

// These are the member engine in DBInstance, but it is a string
const val mysqlEngineType = "mysql"
const val postgresEngineType = "postgres"

const val jdbcMysql = "mysql"
const val jdbcMysqlAurora = "mysql:aurora"
const val jdbcPostgres = "postgresql"

object RdsResources {
    private val RDS_REGION_REGEX = """.*\.(.+).rds\.""".toRegex()

    fun extractRegionFromUrl(url: String?): String? = url?.let { RDS_REGION_REGEX.find(url)?.groupValues?.get(1) }
}

data class RdsDatabase(
    val identifier: String,
    val arn: String,
    val engine: String,
    val iamDatabaseAuthenticationEnabled: Boolean,
    val endpoint: Endpoint,
    val masterUsername: String
) {
    fun rdsEngine() = RdsEngine.fromEngine(engine)
}

data class Endpoint(val host: String, val port: Int)

// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip

import com.intellij.database.Dbms
import com.intellij.database.dataSource.DataSourceSslConfiguration
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.LocalDataSource
import com.intellij.database.remote.jdbc.helpers.JdbcSettings.SslMode
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.rds.AuroraMySql
import software.aws.toolkits.jetbrains.services.rds.AuroraPostgres
import software.aws.toolkits.jetbrains.services.rds.JDBC_MARIADB
import software.aws.toolkits.jetbrains.services.rds.JDBC_MYSQL
import software.aws.toolkits.jetbrains.services.rds.JDBC_MYSQL_AURORA
import software.aws.toolkits.jetbrains.services.rds.JDBC_POSTGRES
import software.aws.toolkits.jetbrains.services.rds.Maria
import software.aws.toolkits.jetbrains.services.rds.MySql
import software.aws.toolkits.jetbrains.services.rds.Postgres
import software.aws.toolkits.jetbrains.services.redshift.RedshiftResources.JDBC_REDSHIFT
import software.aws.toolkits.jetbrains.services.redshift.RedshiftResources.REDSHIFT_ENGINE_TYPE
import software.aws.toolkits.resources.message

const val CREDENTIAL_ID_PROPERTY = "AWS.CredentialId"
const val REGION_ID_PROPERTY = "AWS.RegionId"

val RequireSsl = DataSourceSslConfiguration("", "", "", true, SslMode.REQUIRE)

fun ProtoConnection.getAwsConnectionSettings(): ConnectionSettings {
    val credentialManager = CredentialManager.getInstance()
    val regionId = connectionPoint.additionalProperties[REGION_ID_PROPERTY]
        ?: throw IllegalArgumentException(message("settings.regions.none_selected"))
    val region = AwsRegionProvider.getInstance().allRegions()[regionId]
        ?: throw IllegalArgumentException(
            message("datagrip.validation.invalid_region_specified", regionId)
        )
    val credentialId = connectionPoint.additionalProperties[CREDENTIAL_ID_PROPERTY]
        ?: throw IllegalArgumentException(message("settings.credentials.none_selected"))
    val credentials = credentialManager.getCredentialIdentifierById(credentialId)?.let {
        credentialManager.getAwsCredentialProvider(it, region)
    } ?: throw IllegalArgumentException(message("datagrip.validation.invalid_credential_specified", credentialId))
    return ConnectionSettings(credentials, region)
}

fun jdbcAdapterFromRuntime(runtime: String?): String? = when (runtime) {
    in Postgres.engines -> JDBC_POSTGRES
    in MySql.engines -> JDBC_MYSQL
    in Maria.engines -> JDBC_MARIADB
    in AuroraMySql.engines -> JDBC_MYSQL_AURORA
    in AuroraPostgres.engines -> JDBC_POSTGRES
    REDSHIFT_ENGINE_TYPE -> JDBC_REDSHIFT
    else -> null
}

fun secretsManagerIsApplicable(dataSource: LocalDataSource): Boolean {
    val dbms = dataSource.dbms
    return dbms == Dbms.MYSQL || dbms == Dbms.MARIA || dbms == Dbms.POSTGRES || dbms == Dbms.REDSHIFT || dbms == Dbms.MYSQL_AURORA
}

fun iamIsApplicable(dataSource: LocalDataSource): Boolean =
    dataSource.dbms == Dbms.MYSQL || dataSource.dbms == Dbms.MARIA || dataSource.dbms == Dbms.POSTGRES || dataSource.dbms == Dbms.MYSQL_AURORA

fun validateIamConfiguration(connection: ProtoConnection) {
    // MariaDB/Mysql aurora will never work if SSL is turned off, so validate and give
    // a good message if it is not enabled
    if (
        connection.connectionPoint.dataSource.dbms == Dbms.MYSQL_AURORA &&
        connection.connectionPoint.dataSource.sslCfg == null
    ) {
        throw IllegalArgumentException(message("rds.validation.aurora_mysql_ssl_required"))
    }
}

// We don't have access to service information when we need this. What we do have access to is the database driver
// which matches up with the engine field for mysql, postgres, and redshift which is what we currently
// support. TODO find a more direct way to do this
fun ProtoConnection.getDatabaseEngine() = connectionPoint.databaseDriver.id

// The format for a jdbc url is: jdbc:<drivertype>://<host>:<port>/<dbName>
fun String?.hostFromJdbcString(): String? = this?.substringAfter("://")?.substringBefore(":")
fun String?.portFromJdbcString(): String? = this?.substringAfter("://")?.substringAfter(":")?.substringBefore("/")

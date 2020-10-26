// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip

import com.intellij.database.dataSource.DataSourceSslConfiguration
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.remote.jdbc.helpers.JdbcSettings.SslMode
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.rds.AuroraMySql
import software.aws.toolkits.jetbrains.services.rds.AuroraPostgres
import software.aws.toolkits.jetbrains.services.rds.MySql
import software.aws.toolkits.jetbrains.services.rds.Postgres
import software.aws.toolkits.jetbrains.services.rds.jdbcMysql
import software.aws.toolkits.jetbrains.services.rds.jdbcMysqlAurora
import software.aws.toolkits.jetbrains.services.rds.jdbcPostgres
import software.aws.toolkits.jetbrains.services.redshift.RedshiftResources.jdbcRedshift
import software.aws.toolkits.jetbrains.services.redshift.RedshiftResources.redshiftEngineType
import software.aws.toolkits.resources.message

const val CREDENTIAL_ID_PROPERTY = "AWS.CredentialId"
const val REGION_ID_PROPERTY = "AWS.RegionId"

val RequireSsl = DataSourceSslConfiguration("", "", "", true, SslMode.REQUIRE)

fun ProtoConnection.getAwsConnectionSettings(): ConnectionSettings {
    val credentialManager = CredentialManager.getInstance()
    val regionId = connectionPoint.additionalJdbcProperties[REGION_ID_PROPERTY]
        ?: throw IllegalArgumentException(message("settings.regions.none_selected"))
    val region = AwsRegionProvider.getInstance().allRegions()[regionId]
        ?: throw IllegalArgumentException(
            message("datagrip.validation.invalid_region_specified", regionId)
        )
    val credentialId = connectionPoint.additionalJdbcProperties[CREDENTIAL_ID_PROPERTY]
        ?: throw IllegalArgumentException(message("settings.credentials.none_selected"))
    val credentials = credentialManager.getCredentialIdentifierById(credentialId)?.let {
        credentialManager.getAwsCredentialProvider(it, region)
    } ?: throw IllegalArgumentException(message("datagrip.validation.invalid_credential_specified", credentialId))
    return ConnectionSettings(credentials, region)
}

fun jdbcAdapterFromRuntime(runtime: String?): String? = when (runtime) {
    in Postgres.engines -> jdbcPostgres
    in MySql.engines -> jdbcMysql
    in AuroraMySql.engines -> jdbcMysqlAurora
    in AuroraPostgres.engines -> jdbcPostgres
    redshiftEngineType -> jdbcRedshift
    else -> null
}

// We don't have access to service information when we need this. What we do have access to is the database driver
// which matches up with the engine field for mysql, postgres, and redshift which is what we currently
// support. TODO find a more direct way to do this
fun ProtoConnection.getDatabaseEngine() = connectionPoint.databaseDriver.id

// The format for a jdbc url is: jdbc:<drivertype>://<host>:<port>/<dbName>
fun String?.hostFromJdbcString(): String? = this?.substringAfter("://")?.substringBefore(":")
fun String?.portFromJdbcString(): String? = this?.substringAfter("://")?.substringAfter(":")?.substringBefore("/")

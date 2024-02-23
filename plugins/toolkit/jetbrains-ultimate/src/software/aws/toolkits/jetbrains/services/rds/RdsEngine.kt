// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.database.dataSource.DataSourceSslConfiguration
import com.intellij.icons.AllIcons
import icons.AwsIcons
import software.aws.toolkits.jetbrains.datagrip.RequireSsl
import software.aws.toolkits.resources.message
import javax.swing.Icon

/**
 * The [additionalInfo] shows as [software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode.statusText] if present
 * TODO: This can probably ultimately become [DbEngine] and encompass Redshift functionality too
 */
sealed class RdsEngine(val engines: Set<String>, val icon: Icon, val additionalInfo: String?) {
    /**
     * Create a connection string, using the passed hostname/port [endpoint] parameter
     */
    abstract fun connectionStringUrl(endpoint: String): String

    /**
     * Some engines need to manipulate the [username] (e.g. Postgres should be lower-cased), this hook allows that
     */
    open fun iamUsername(username: String) = username

    /**
     * SSL is not turned on by default by DataGrip. We would like it to be turned on, and Aurora MySQL requires it turned on, so
     * we have to patch it into the configuration. Postgres breaks by default with ssl (due to requring adding a trust store manually),
     * so we have to configure it on a per database basis.
     */
    open fun sslConfig(): DataSourceSslConfiguration? = null

    companion object {
        fun values(): Set<RdsEngine> = setOf(Maria, MySql, AuroraMySql, Postgres, AuroraPostgres)
        fun fromEngine(engine: String) = values().find { it.engines.contains(engine) } ?: throw IllegalArgumentException("Unknown RDS engine $engine")
    }
}

abstract class MySqlBase(engine: Set<String>, additionalInfo: String? = null) : RdsEngine(engine, AwsIcons.Resources.Rds.MYSQL, additionalInfo) {
    override fun sslConfig(): DataSourceSslConfiguration = RequireSsl
}

abstract class PostgresBase(engine: Set<String>, additionalInfo: String? = null) : RdsEngine(engine, AwsIcons.Resources.Rds.POSTGRES, additionalInfo) {
    override fun connectionStringUrl(endpoint: String) = "jdbc:$JDBC_POSTGRES://$endpoint/"

    /**
     * In postgres this is case sensitive as lower case. If you add a db user for
     * IAM role "Admin", it is inserted to the db as "admin"
     */
    override fun iamUsername(username: String) = username.lowercase()
}

object Maria : RdsEngine(setOf("mariadb"), AllIcons.Providers.Mariadb, null) {
    override fun sslConfig(): DataSourceSslConfiguration = RequireSsl
    override fun connectionStringUrl(endpoint: String) = "jdbc:$JDBC_MARIADB://$endpoint/"
}

object MySql : MySqlBase(setOf("mysql")) {
    override fun connectionStringUrl(endpoint: String) = "jdbc:$JDBC_MYSQL://$endpoint/"
}

// aurora-mysql == 5.7
object AuroraMySql : MySqlBase(setOf("aurora-mysql"), additionalInfo = message("rds.aurora")) {
    // The docs recommend using MariaDB instead of MySQL to connect to MySQL Aurora DBs:
    // https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Connecting.html#Aurora.Connecting.AuroraMySQL
    override fun connectionStringUrl(endpoint: String) = "jdbc:$JDBC_MYSQL_AURORA://$endpoint/"
}

object Postgres : PostgresBase(setOf("postgres"))

object AuroraPostgres : PostgresBase(setOf("aurora-postgresql"), additionalInfo = message("rds.aurora"))

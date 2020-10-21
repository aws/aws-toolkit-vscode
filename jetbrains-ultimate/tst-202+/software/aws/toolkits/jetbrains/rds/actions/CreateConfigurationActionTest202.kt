// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.intellij.database.autoconfig.DataSourceRegistry
import com.intellij.database.remote.jdbc.helpers.JdbcSettings.SslMode
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.rds.model.DBInstance
import software.amazon.awssdk.services.rds.model.Endpoint
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.services.rds.RdsDatasourceConfiguration
import software.aws.toolkits.jetbrains.services.rds.RdsNode
import software.aws.toolkits.jetbrains.services.rds.actions.createRdsDatasource
import software.aws.toolkits.jetbrains.services.rds.jdbcMysqlAurora
import software.aws.toolkits.jetbrains.services.rds.mysqlEngineType
import software.aws.toolkits.jetbrains.services.rds.postgresEngineType

// FIX_WHEN_MIN_IS_202 merge this with the normal one
class CreateConfigurationActionTest202 {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    private val port = RuleUtils.randomNumber()
    private val address = RuleUtils.randomName()
    private val username = "${RuleUtils.randomName()}CAPITAL"
    private val masterUsername = RuleUtils.randomName()

    @Test
    fun `Add Aurora MySQL data source`() {
        val instance = createDbInstance(address = address, port = port, engineType = "aurora")
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = MockCredentialsManager.DUMMY_PROVIDER_IDENTIFIER.id,
                regionId = MockRegionProvider.getInstance().defaultRegion().id,
                dbInstance = instance
            )
        )
        assertThat(registry.newDataSources).hasOnlyOneElementSatisfying {
            assertThat(it.username).isEqualTo(username)
            assertThat(it.driverClass).contains("mariadb")
            assertThat(it.url).contains(jdbcMysqlAurora)
            assertThat(it.sslCfg?.myMode).isEqualTo(SslMode.REQUIRE)
        }
    }

    @Test
    fun `Add Aurora MySQL 5_7 data source`() {
        val instance = createDbInstance(address = address, port = port, engineType = "aurora-mysql")
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = MockCredentialsManager.DUMMY_PROVIDER_IDENTIFIER.id,
                regionId = MockRegionProvider.getInstance().defaultRegion().id,
                dbInstance = instance
            )
        )
        assertThat(registry.newDataSources).hasOnlyOneElementSatisfying {
            assertThat(it.username).isEqualTo(username)
            assertThat(it.driverClass).contains("mariadb")
            assertThat(it.url).contains(jdbcMysqlAurora)
            assertThat(it.sslCfg?.myMode).isEqualTo(SslMode.REQUIRE)
        }
    }

    private fun createNode(
        address: String = RuleUtils.randomName(),
        port: Int = RuleUtils.randomNumber(),
        dbName: String = RuleUtils.randomName(),
        iamAuthEnabled: Boolean = true,
        engineType: String = mysqlEngineType
    ): RdsNode = mock {
        on { nodeProject } doAnswer { projectRule.project }
        on { dbInstance } doAnswer {
            createDbInstance(address, port, dbName, iamAuthEnabled, engineType)
        }
    }

    private fun createDbInstance(
        address: String = RuleUtils.randomName(),
        port: Int = RuleUtils.randomNumber(),
        dbName: String = RuleUtils.randomName(),
        iamAuthEnabled: Boolean = true,
        engineType: String = postgresEngineType
    ): DBInstance = mock {
        on { iamDatabaseAuthenticationEnabled() } doAnswer { iamAuthEnabled }
        on { endpoint() } doAnswer {
            Endpoint.builder().address(address).port(port).build()
        }
        on { engine() } doAnswer { engineType }
        on { dbInstanceIdentifier() } doAnswer { dbName }
        on { masterUsername() } doAnswer { masterUsername }
    }
}

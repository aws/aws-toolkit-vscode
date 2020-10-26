// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.actions

import com.intellij.database.autoconfig.DataSourceRegistry
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
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.services.rds.RdsDatasourceConfiguration
import software.aws.toolkits.jetbrains.services.rds.RdsNode
import software.aws.toolkits.jetbrains.services.rds.auth.IamAuth
import software.aws.toolkits.jetbrains.services.rds.jdbcMysql
import software.aws.toolkits.jetbrains.services.rds.jdbcPostgres
import software.aws.toolkits.jetbrains.services.rds.mysqlEngineType
import software.aws.toolkits.jetbrains.services.rds.postgresEngineType
import software.aws.toolkits.jetbrains.services.sts.StsResources
import java.util.concurrent.CompletableFuture

class CreateConfigurationActionTest {
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
    fun `Prerequisites fails when IAM authentication is disabled`() {
        val node = createNode(iamAuthEnabled = false)
        assertThat(CreateIamDataSourceAction().checkPrerequisites(node)).isFalse()
    }

    @Test
    fun `Prerequisites succeeds when all are met`() {
        val node = createNode(iamAuthEnabled = true)
        assertThat(CreateIamDataSourceAction().checkPrerequisites(node)).isTrue()
    }

    @Test
    fun `Create data source gets user`() {
        resourceCache.addEntry(projectRule.project, StsResources.USER, username)
        val node = createNode()
        val registry = DataSourceRegistry(projectRule.project)
        CreateIamDataSourceAction().createDatasource(node, registry)
        assertThat(registry.newDataSources).hasOnlyOneElementSatisfying {
            assertThat(it.isTemporary).isFalse()
            assertThat(it.username).isEqualTo(username)
        }
    }

    @Test
    fun `Create data source falls back to master username`() {
        resourceCache.addEntry(
            projectRule.project,
            StsResources.USER,
            CompletableFuture<String>().also {
                it.completeExceptionally(RuntimeException("Failed to get current user"))
            }
        )
        val node = createNode()
        val registry = DataSourceRegistry(projectRule.project)
        CreateIamDataSourceAction().createDatasource(node, registry)
        assertThat(registry.newDataSources).hasOnlyOneElementSatisfying {
            assertThat(it.isTemporary).isFalse()
            assertThat(it.username).isEqualTo(masterUsername)
        }
    }

    // This tests common properties. The ones below test driver specific properties
    @Test
    fun `Add data source`() {
        val instance = createDbInstance(address = address, port = port)
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
            assertThat(it.isTemporary).isFalse()
            assertThat(it.url).contains(port.toString())
            assertThat(it.url).contains(address)
            assertThat(it.additionalJdbcProperties[CREDENTIAL_ID_PROPERTY]).isEqualTo(MockCredentialsManager.DUMMY_PROVIDER_IDENTIFIER.displayName)
            assertThat(it.additionalJdbcProperties[REGION_ID_PROPERTY]).isEqualTo(MockRegionProvider.getInstance().defaultRegion().id)
            assertThat(it.authProviderId).isEqualTo(IamAuth.providerId)
        }
    }

    @Test
    fun `Add postgres data source`() {
        val instance = createDbInstance(port = port, address = address, engineType = postgresEngineType)
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
            assertThat(it.username).isLowerCase().isEqualTo(username.toLowerCase())
            assertThat(it.driverClass).contains("postgres")
            assertThat(it.url).contains(jdbcPostgres)
        }
    }

    @Test
    fun `Add Aurora PostgreSQL data source`() {
        val instance = createDbInstance(port = port, address = address, engineType = "aurora-postgresql")
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
            assertThat(it.username).isLowerCase().isEqualTo(username.toLowerCase())
            assertThat(it.driverClass).contains("postgres")
            assertThat(it.url).contains(jdbcPostgres)
        }
    }

    @Test
    fun `Add mysql data source`() {
        val instance = createDbInstance(address = address, port = port, engineType = mysqlEngineType)
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
            assertThat(it.driverClass).contains("mysql")
            assertThat(it.url).contains(jdbcMysql)
            assertThat(it.sslCfg).isNotNull
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun `Bad engine throws`() {
        val instance = createDbInstance(engineType = "NOT SUPPORTED")
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = MockCredentialsManager.DUMMY_PROVIDER_IDENTIFIER.id,
                regionId = MockRegionProvider.getInstance().defaultRegion().id,
                dbInstance = instance
            )
        )
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

// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.actions

import com.intellij.database.autoconfig.DataSourceRegistry
import com.intellij.database.remote.jdbc.helpers.JdbcSettings
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.RuleChain
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager.ProjectAccountSettingsManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.services.rds.JDBC_MYSQL
import software.aws.toolkits.jetbrains.services.rds.JDBC_MYSQL_AURORA
import software.aws.toolkits.jetbrains.services.rds.JDBC_POSTGRES
import software.aws.toolkits.jetbrains.services.rds.MYSQL_ENGINE_TYPE
import software.aws.toolkits.jetbrains.services.rds.POSTGRES_ENGINE_TYPE
import software.aws.toolkits.jetbrains.services.rds.RdsDatabase
import software.aws.toolkits.jetbrains.services.rds.RdsDatasourceConfiguration
import software.aws.toolkits.jetbrains.services.rds.RdsNode
import software.aws.toolkits.jetbrains.services.rds.auth.IamAuth
import software.aws.toolkits.jetbrains.services.sts.StsResources
import java.util.concurrent.CompletableFuture

class CreateConfigurationActionTest {
    private val projectRule = ProjectRule()
    private val resourceCache = MockResourceCacheRule()
    private val credentialManager = MockCredentialManagerRule()
    private val settingsManager = ProjectAccountSettingsManagerRule(projectRule)

    @Rule
    @JvmField
    val ruleChain = RuleChain(
        projectRule,
        credentialManager,
        resourceCache
    )

    private val port = RuleUtils.randomNumber()
    private val address = RuleUtils.randomName()
    private val username = "${RuleUtils.randomName()}CAPITAL"
    private val masterUsername = RuleUtils.randomName()
    private lateinit var credentialIdentifier: CredentialIdentifier
    private lateinit var region: AwsRegion

    @Before
    fun setUp() {
        credentialIdentifier = credentialManager.createCredentialProvider().identifier
        region = AwsRegionProvider.getInstance().defaultRegion()
        settingsManager.settingsManager.changeCredentialProviderAndWait(credentialIdentifier)
        settingsManager.settingsManager.changeRegionAndWait(region)
    }

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
        assertThat(registry.newDataSources).singleElement().satisfies {
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
        assertThat(registry.newDataSources).singleElement().satisfies {
            assertThat(it.isTemporary).isFalse()
            assertThat(it.username).isEqualTo(masterUsername)
        }
    }

    // This tests common properties. The ones below test driver specific properties
    @Test
    fun `Add data source`() {
        val database = createDbInstance(address = address, port = port)
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = credentialIdentifier.id,
                regionId = region.id,
                database = database
            )
        )
        assertThat(registry.newDataSources).singleElement().satisfies {
            assertThat(it.isTemporary).isFalse()
            assertThat(it.url).contains(port.toString())
            assertThat(it.url).contains(address)
            assertThat(it.additionalProperties[CREDENTIAL_ID_PROPERTY]).isEqualTo(credentialIdentifier.displayName)
            assertThat(it.additionalProperties[REGION_ID_PROPERTY]).isEqualTo(region.id)
            assertThat(it.authProviderId).isEqualTo(IamAuth.providerId)
        }
    }

    @Test
    fun `Add postgres data source`() {
        val database = createDbInstance(port = port, address = address, engineType = POSTGRES_ENGINE_TYPE)
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = credentialIdentifier.id,
                regionId = region.id,
                database = database
            )
        )
        assertThat(registry.newDataSources).singleElement().satisfies {
            assertThat(it.username).isLowerCase().isEqualTo(username.lowercase())
            assertThat(it.driverClass).contains("postgres")
            assertThat(it.url).contains(JDBC_POSTGRES)
        }
    }

    @Test
    fun `Add Aurora PostgreSQL data source`() {
        val database = createDbInstance(port = port, address = address, engineType = "aurora-postgresql")
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = credentialIdentifier.id,
                regionId = region.id,
                database = database
            )
        )
        assertThat(registry.newDataSources).singleElement().satisfies {
            assertThat(it.username).isLowerCase().isEqualTo(username.lowercase())
            assertThat(it.driverClass).contains("postgres")
            assertThat(it.url).contains(JDBC_POSTGRES)
        }
    }

    @Test
    fun `Add mysql data source`() {
        val database = createDbInstance(address = address, port = port, engineType = MYSQL_ENGINE_TYPE)
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = credentialIdentifier.id,
                regionId = region.id,
                database = database
            )
        )
        assertThat(registry.newDataSources).singleElement().satisfies {
            assertThat(it.username).isEqualTo(username)
            assertThat(it.driverClass).contains("mysql")
            assertThat(it.url).contains(JDBC_MYSQL)
            assertThat(it.sslCfg).isNotNull
        }
    }

    @Test
    fun `Add Aurora MySQL 5_7 data source`() {
        val database = createDbInstance(address = address, port = port, engineType = "aurora-mysql")
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = credentialIdentifier.id,
                regionId = region.id,
                database = database
            )
        )
        assertThat(registry.newDataSources).singleElement().satisfies {
            assertThat(it.username).isEqualTo(username)
            assertThat(it.driverClass).contains("mariadb")
            assertThat(it.url).contains(JDBC_MYSQL_AURORA)
            assertThat(it.sslCfg?.myMode).isEqualTo(JdbcSettings.SslMode.REQUIRE)
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun `Bad engine throws`() {
        val database = createDbInstance(engineType = "NOT SUPPORTED")
        val registry = DataSourceRegistry(projectRule.project)
        registry.createRdsDatasource(
            RdsDatasourceConfiguration(
                username = username,
                credentialId = credentialIdentifier.id,
                regionId = region.id,
                database = database
            )
        )
    }

    private fun createNode(
        address: String = RuleUtils.randomName(),
        port: Int = RuleUtils.randomNumber(),
        dbName: String = RuleUtils.randomName(),
        iamAuthEnabled: Boolean = true,
        engineType: String = MYSQL_ENGINE_TYPE
    ): RdsNode = mock {
        on { nodeProject } doAnswer { projectRule.project }
        on { database } doAnswer {
            createDbInstance(address, port, dbName, iamAuthEnabled, engineType)
        }
    }

    private fun createDbInstance(
        address: String = RuleUtils.randomName(),
        port: Int = RuleUtils.randomNumber(),
        dbName: String = RuleUtils.randomName(),
        iamAuthEnabled: Boolean = true,
        engineType: String = POSTGRES_ENGINE_TYPE
    ): RdsDatabase = RdsDatabase(
        identifier = dbName,
        engine = engineType,
        arn = aString(),
        iamDatabaseAuthenticationEnabled = iamAuthEnabled,
        endpoint = software.aws.toolkits.jetbrains.services.rds.Endpoint(
            host = address,
            port = port
        ),
        masterUsername = masterUsername,
    )
}

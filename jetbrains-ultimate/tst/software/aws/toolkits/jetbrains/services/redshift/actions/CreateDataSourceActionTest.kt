// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift.actions

import com.intellij.database.autoconfig.DataSourceRegistry
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.redshift.model.Cluster
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.services.redshift.auth.CLUSTER_ID_PROPERTY
import software.aws.toolkits.jetbrains.services.redshift.auth.IamAuth
import software.aws.toolkits.jetbrains.services.redshift.createDatasource

class CreateDataSourceActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    @Rule
    @JvmField
    val settingsManager = MockAwsConnectionManager.ProjectAccountSettingsManagerRule(projectRule)

    @Test
    fun `Add data source`() {
        val credentialProvider = credentialManager.createCredentialProvider()
        val region = AwsRegionProvider.getInstance().defaultRegion()
        settingsManager.settingsManager.changeCredentialProviderAndWait(credentialProvider.identifier)
        settingsManager.settingsManager.changeRegionAndWait(region)

        val port = RuleUtils.randomNumber()
        val address = RuleUtils.randomName()
        val username = RuleUtils.randomName()
        val dbName = RuleUtils.randomName()
        val registry = DataSourceRegistry(projectRule.project)
        registry.createDatasource(
            projectRule.project,
            Cluster.builder()
                .endpoint { it.address(address).port(port) }
                .masterUsername(username)
                .clusterIdentifier(address)
                .dbName(dbName)
                .build()
        )
        assertThat(registry.newDataSources).singleElement().satisfies {
            assertThat(it.isTemporary).isFalse()
            assertThat(it.sslCfg?.myEnabled).isTrue()
            assertThat(it.url).isEqualTo("jdbc:redshift://$address:$port/$dbName")
            assertThat(it.additionalProperties[CREDENTIAL_ID_PROPERTY]).isEqualTo(credentialProvider.id)
            assertThat(it.additionalProperties[REGION_ID_PROPERTY]).isEqualTo(region.id)
            assertThat(it.additionalProperties[CLUSTER_ID_PROPERTY]).isEqualTo(address)
            assertThat(it.authProviderId).isEqualTo(IamAuth.providerId)
        }
    }
}

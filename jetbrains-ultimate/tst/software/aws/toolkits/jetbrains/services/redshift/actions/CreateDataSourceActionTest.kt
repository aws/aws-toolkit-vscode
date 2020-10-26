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
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.services.redshift.auth.CLUSTER_ID_PROPERTY
import software.aws.toolkits.jetbrains.services.redshift.auth.IamAuth
import software.aws.toolkits.jetbrains.services.redshift.createDatasource

class CreateDataSourceActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun `Add data source`() {
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
        assertThat(registry.newDataSources).hasOnlyOneElementSatisfying {
            assertThat(it.isTemporary).isFalse()
            assertThat(it.sslCfg?.myEnabled).isTrue()
            assertThat(it.url).isEqualTo("jdbc:redshift://$address:$port/$dbName")
            assertThat(it.additionalJdbcProperties[CREDENTIAL_ID_PROPERTY]).isEqualTo(MockCredentialsManager.DUMMY_PROVIDER_IDENTIFIER.displayName)
            assertThat(it.additionalJdbcProperties[REGION_ID_PROPERTY]).isEqualTo(MockRegionProvider.getInstance().defaultRegion().id)
            assertThat(it.additionalJdbcProperties[CLUSTER_ID_PROPERTY]).isEqualTo(address)
            assertThat(it.authProviderId).isEqualTo(IamAuth.providerId)
        }
    }
}

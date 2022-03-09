// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.actions

import com.intellij.database.autoconfig.DataSourceRegistry
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager.ProjectAccountSettingsManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.datagrip.CREDENTIAL_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.REGION_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.auth.SECRET_ID_PROPERTY
import software.aws.toolkits.jetbrains.datagrip.auth.SecretsManagerAuth
import software.aws.toolkits.jetbrains.datagrip.auth.SecretsManagerDbSecret

class AddSecretsManagerConnectionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    @Rule
    @JvmField
    val settingsManager = ProjectAccountSettingsManagerRule(projectRule)

    @Test
    fun `Add data source`() {
        val credentialProvider = credentialManager.createCredentialProvider()
        val region = AwsRegionProvider.getInstance().defaultRegion()
        settingsManager.settingsManager.changeCredentialProviderAndWait(credentialProvider.identifier)
        settingsManager.settingsManager.changeRegionAndWait(region)

        val port = RuleUtils.randomNumber()
        val address = RuleUtils.randomName()
        val username = RuleUtils.randomName()
        val password = RuleUtils.randomName()
        val secretArn = RuleUtils.randomName()
        val engine = RuleUtils.randomName()
        val registry = DataSourceRegistry(projectRule.project)
        registry.createDatasource(
            projectRule.project,
            SecretsManagerDbSecret(username, password, engine, address, port.toString()),
            secretArn,
            "adapter"
        )
        assertThat(registry.newDataSources).singleElement().satisfies {
            assertThat(it.isTemporary).isFalse()
            assertThat(it.sslCfg?.myEnabled).isTrue()
            assertThat(it.url).isEqualTo("jdbc:adapter://$address:$port")
            assertThat(it.additionalProperties[CREDENTIAL_ID_PROPERTY]).isEqualTo(credentialProvider.identifier.id)
            assertThat(it.additionalProperties[REGION_ID_PROPERTY]).isEqualTo(region.id)
            assertThat(it.additionalProperties[SECRET_ID_PROPERTY]).isEqualTo(secretArn)
            assertThat(it.authProviderId).isEqualTo(SecretsManagerAuth.providerId)
        }
    }
}

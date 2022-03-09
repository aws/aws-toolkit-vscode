// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.execution.RunManager
import com.intellij.execution.application.ApplicationConfiguration
import com.intellij.execution.application.ApplicationConfigurationType
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.jdom.Element
import org.jetbrains.plugins.gradle.service.execution.GradleRunConfiguration
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.settings.AwsSettingsRule
import software.aws.toolkits.jetbrains.utils.rules.ExperimentRule

class JavaAwsConnectionExtensionTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val settingsRule = AwsSettingsRule()

    @Rule
    @JvmField
    val regionProvider = MockRegionProviderRule()

    @Rule
    @JvmField
    val registryRule = ExperimentRule(JavaAwsConnectionExperiment)

    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        MockCredentialsManager.getInstance().addCredentials("MockCredentials", mockCreds)
    }

    @Test
    fun `Round trip persistence`() {
        val runManager = RunManager.getInstance(projectRule.project)
        val configuration = runManager.createConfiguration("test", ApplicationConfigurationType::class.java).configuration as ApplicationConfiguration

        val data = AwsCredentialInjectionOptions {
            region = "abc123"
            credential = "mockCredential"
        }

        configuration.putCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY, data)
        configuration.mainClassName = "com.bla.Boop"

        val element = Element("bling")
        configuration.writeExternal(element)

        val deserialized = runManager.createConfiguration("re-read", ApplicationConfigurationType::class.java).configuration as ApplicationConfiguration
        deserialized.readExternal(element)

        assertThat(deserialized.mainClassName).isEqualTo("com.bla.Boop")
        assertThat(deserialized.getCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY)).usingRecursiveComparison().isEqualTo(data)
    }

    @Test
    fun `ignores gradle based run configs`() {
        val configuration = mock<GradleRunConfiguration>().apply {
            putCopyableUserData<AwsCredentialInjectionOptions>(
                AWS_CONNECTION_RUN_CONFIGURATION_KEY,
                AwsCredentialInjectionOptions {
                    region = "abc123"
                    credential = "mockCredential"
                }
            )
        }

        assertThat(JavaAwsConnectionExtension().isApplicableFor(configuration)).isFalse()
    }

    @Test
    fun `Does not inject by default`() {
        val runManager = RunManager.getInstance(projectRule.project)
        val configuration = runManager.createConfiguration("test", ApplicationConfigurationType::class.java).configuration as ApplicationConfiguration
        assertThat(configuration.getCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY)).isNull()
    }

    @Test
    fun `Does not throw on default options`() {
        val runManager = RunManager.getInstance(projectRule.project)
        val configuration = runManager.createConfiguration("test", ApplicationConfigurationType::class.java).configuration as ApplicationConfiguration
        configuration.putCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY, AwsCredentialInjectionOptions.DEFAULT_OPTIONS)
        val extension = JavaAwsConnectionExtension()
        val map = mutableMapOf<String, String>()
        extension.updateJavaParameters(configuration, mock { on { env } doAnswer { map } }, null)
    }

    @Test
    fun `Inject injects environment variables`() {
        val runManager = RunManager.getInstance(projectRule.project)
        val configuration = runManager.createConfiguration("test", ApplicationConfigurationType::class.java).configuration as ApplicationConfiguration
        val data = AwsCredentialInjectionOptions {
            region = regionProvider.defaultRegion().id
            credential = "MockCredentials"
        }
        configuration.putCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY, data)

        val extension = JavaAwsConnectionExtension()
        val map = mutableMapOf<String, String>()
        extension.updateJavaParameters(configuration, mock { on { env } doAnswer { map } }, null)
        assertThat(map).hasSize(4)
        listOf(
            "AWS_ACCESS_KEY_ID",
            "AWS_REGION",
            "AWS_DEFAULT_REGION",
            "AWS_SECRET_ACCESS_KEY"
        ).forEach { assertThat(map[it]).isNotNull() }
    }
}

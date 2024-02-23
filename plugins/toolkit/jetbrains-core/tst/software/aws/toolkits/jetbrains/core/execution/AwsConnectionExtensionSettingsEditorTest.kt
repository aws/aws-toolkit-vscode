// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.execution.RunManager
import com.intellij.execution.application.ApplicationConfiguration
import com.intellij.execution.application.ApplicationConfigurationType
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.ObjectAssert
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.settings.AwsSettingsRule

class AwsConnectionExtensionSettingsEditorTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val settingsRule = AwsSettingsRule()

    @Test
    fun baseState() {
        val editor = AwsConnectionExtensionSettingsEditor<ApplicationConfiguration>(projectRule.project, false)

        assertThat(editor.view.none.isSelected).isTrue()

        assertThat(editor.view.credentialProvider.isEnabled).isFalse()
        assertThat(editor.view.credentialProvider.itemCount).isZero() // We don't want to eagerly load for every RunConfiguration

        assertThat(editor.view.region.isEnabled).isFalse()
        assertThat(editor.view.region.itemCount).isZero() // We don't want to eagerly load for every RunConfiguration
    }

    @Test
    fun canRoundTripUseCurrentConnection() {
        val configuration = createConfiguration {
            useCurrentConnection = true
        }

        val editor = AwsConnectionExtensionSettingsEditor<ApplicationConfiguration>(projectRule.project, false)

        editor.resetFrom(configuration)

        assertThat(editor.view.useCurrentConnection.isSelected).isTrue()

        assertThat(editor.view.credentialProvider.isEnabled).isFalse()
        assertThat(editor.view.credentialProvider.itemCount).isZero() // We don't want to eagerly load for every RunConfiguration
        assertThat(editor.view.region.isEnabled).isFalse()
        assertThat(editor.view.region.itemCount).isZero() // We don't want to eagerly load for every RunConfiguration

        assertThat(editor).isPersistedAs {
            useCurrentConnection = true
            region = null
            credential = null
        }
    }

    @Test
    fun canLoadSpecificManualSelection() {
        val configuration = createConfiguration {
            useCurrentConnection = false
            region = "us-east-1"
            credential = "DUMMY"
        }

        val editor = AwsConnectionExtensionSettingsEditor<ApplicationConfiguration>(projectRule.project, false)

        editor.resetFrom(configuration)

        assertThat(editor.view.manuallyConfiguredConnection.isSelected).isTrue()
        assertThat(editor.view.region.isEnabled).isTrue()
        assertThat(editor.view.region.itemCount).isGreaterThan(0)
        assertThat(editor.view.credentialProvider.isEnabled).isTrue()
        assertThat(editor.view.credentialProvider.itemCount).isGreaterThan(0)

        assertThat(editor).isPersistedAs {
            useCurrentConnection = false
            region = "us-east-1"
            credential = "DUMMY"
        }
    }

    @Test
    fun canLoadNone() {
        val configuration = createConfiguration { }

        val editor = AwsConnectionExtensionSettingsEditor<ApplicationConfiguration>(projectRule.project, false)

        editor.resetFrom(configuration)

        assertThat(editor.view.none.isSelected).isTrue()

        assertThat(editor.view.credentialProvider.isEnabled).isFalse()
        assertThat(editor.view.credentialProvider.itemCount).isZero() // We don't want to eagerly load for every RunConfiguration

        assertThat(editor.view.region.isEnabled).isFalse()
        assertThat(editor.view.region.itemCount).isZero() // We don't want to eagerly load for every RunConfiguration

        assertThat(editor).isPersistedAs {
            useCurrentConnection = false
            region = null
            credential = null
        }
    }

    @Test
    fun manualConnectionEnablesDropDowns() {
        val editor = AwsConnectionExtensionSettingsEditor<ApplicationConfiguration>(projectRule.project, false)
        editor.view.manuallyConfiguredConnection.doClick()

        assertThat(editor.view.region.isEnabled).isTrue()
        assertThat(editor.view.credentialProvider.isEnabled).isTrue()
    }

    private fun createConfiguration(optionBuilder: AwsCredentialInjectionOptions.() -> Unit): ApplicationConfiguration {
        val runManager = RunManager.getInstance(projectRule.project)
        val configuration = runManager.createConfiguration("test", ApplicationConfigurationType::class.java).configuration as ApplicationConfiguration
        configuration.putCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY, AwsCredentialInjectionOptions().apply(optionBuilder))
        return configuration
    }

    private fun ApplicationConfiguration.extensionOptions() = getCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY)

    private fun ObjectAssert<AwsConnectionExtensionSettingsEditor<ApplicationConfiguration>>.isPersistedAs(
        expected: AwsCredentialInjectionOptions.() -> Unit
    ) {
        satisfies {
            val updatedConfiguration = createConfiguration { }
            it.applyTo(updatedConfiguration)
            assertThat(updatedConfiguration.extensionOptions()).usingRecursiveComparison().isEqualTo(AwsCredentialInjectionOptions(expected))
        }
    }
}

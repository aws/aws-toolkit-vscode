// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.notification.Notification
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.aCredentialsIdentifier
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.settings.AwsSettingsRule
import software.aws.toolkits.jetbrains.settings.UseAwsCredentialRegion
import software.aws.toolkits.jetbrains.utils.rules.NotificationListenerRule
import software.aws.toolkits.resources.message

class CredentialsRegionHandlerTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val regionProviderRule = MockRegionProviderRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val notificationListener = NotificationListenerRule(projectRule, disposableRule.disposable)

    private lateinit var sut: DefaultCredentialsRegionHandler

    @Rule
    @JvmField
    val settingsRule = AwsSettingsRule()

    @Before
    fun setup() {
        sut = DefaultCredentialsRegionHandler(projectRule.project)
        AwsSettings.getInstance().useDefaultCredentialRegion = UseAwsCredentialRegion.Always
    }

    @Test
    fun `Credential with no default region returns selected region`() {
        val identifier = aCredentialsIdentifier(defaultRegionId = null)
        val region = anAwsRegion()

        assertThat(sut.determineSelectedRegion(identifier, region)).isEqualTo(region)
    }

    @Test
    fun `When selected region is null always use credential region`() {
        val defaultRegion = regionProviderRule.createAwsRegion()
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        assertThat(sut.determineSelectedRegion(identifier, selectedRegion = null)).isEqualTo(defaultRegion)
    }

    @Test
    fun `Always use credential region if its partition is different from the selected region`() {
        val defaultRegion = regionProviderRule.createAwsRegion()
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        assertThat(sut.determineSelectedRegion(identifier, selectedRegion = regionProviderRule.createAwsRegion())).isEqualTo(defaultRegion)
    }

    @Test
    fun `Always use credential region if setting is set to Always`() {
        AwsSettings.getInstance().useDefaultCredentialRegion = UseAwsCredentialRegion.Always
        val defaultRegion = regionProviderRule.createAwsRegion()
        val selectedRegion = regionProviderRule.createAwsRegion(partitionId = defaultRegion.partitionId)
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        assertThat(sut.determineSelectedRegion(identifier, selectedRegion = selectedRegion)).isEqualTo(defaultRegion)
    }

    @Test
    fun `Do not use credential region if setting is set to Never`() {
        AwsSettings.getInstance().useDefaultCredentialRegion = UseAwsCredentialRegion.Never
        val defaultRegion = regionProviderRule.createAwsRegion()
        val selectedRegion = regionProviderRule.createAwsRegion(partitionId = defaultRegion.partitionId)
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        assertThat(sut.determineSelectedRegion(identifier, selectedRegion = selectedRegion)).isEqualTo(selectedRegion)
    }

    @Test
    fun `Do not use credential region if setting is set to Never, even if the partition is different`() {
        settingsRule.settings.useDefaultCredentialRegion = UseAwsCredentialRegion.Never
        val defaultRegion = regionProviderRule.createAwsRegion()
        val selectedRegion = regionProviderRule.createAwsRegion()
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        assertThat(sut.determineSelectedRegion(identifier, selectedRegion = selectedRegion)).isEqualTo(selectedRegion)
    }

    @Test
    fun `Do not use credential region if setting is set to Never, even if the region is null`() {
        settingsRule.settings.useDefaultCredentialRegion = UseAwsCredentialRegion.Never
        val defaultRegion = regionProviderRule.createAwsRegion()
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        assertThat(sut.determineSelectedRegion(identifier, selectedRegion = null)).isNull()
    }

    @Test
    fun `Prompt appears when setting is set to prompt, selected region remains active`() {
        settingsRule.settings.useDefaultCredentialRegion = UseAwsCredentialRegion.Prompt

        val defaultRegion = regionProviderRule.createAwsRegion()
        val selectedRegion = regionProviderRule.createAwsRegion(partitionId = defaultRegion.partitionId)
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        val newSelected = sut.determineSelectedRegion(identifier, selectedRegion = selectedRegion)

        assertThat(newSelected).isEqualTo(selectedRegion)
        val notification = getOnlyNotification()
        assertThat(notification.actions).hasSize(3)
    }

    @Test
    fun `Prompt only appears when region is different than default`() {
        settingsRule.settings.useDefaultCredentialRegion = UseAwsCredentialRegion.Prompt

        val defaultRegion = regionProviderRule.createAwsRegion()
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        val newSelected = sut.determineSelectedRegion(identifier, selectedRegion = defaultRegion)

        assertThat(newSelected).isEqualTo(defaultRegion)
        assertThat(notificationListener.notifications.filter { it.title == message("aws.notification.title") }).isEmpty()
    }

    @Test
    fun `Selecting Never at the prompt sets setting to Never`() {
        settingsRule.settings.useDefaultCredentialRegion = UseAwsCredentialRegion.Prompt

        val defaultRegion = regionProviderRule.createAwsRegion()
        val selectedRegion = regionProviderRule.createAwsRegion(partitionId = defaultRegion.partitionId)
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        sut.determineSelectedRegion(identifier, selectedRegion = selectedRegion)

        val notification = getOnlyNotification()

        runInEdtAndWait {
            Notification.fire(notification, notification.actions.first { it.templateText == "Never" }, null)
        }

        assertThat(AwsSettings.getInstance().useDefaultCredentialRegion).isEqualTo(UseAwsCredentialRegion.Never)
    }

    @Test
    fun `Selecting Always at the prompt sets setting to Always`() {
        settingsRule.settings.useDefaultCredentialRegion = UseAwsCredentialRegion.Prompt

        val defaultRegion = regionProviderRule.createAwsRegion()
        val selectedRegion = regionProviderRule.createAwsRegion(partitionId = defaultRegion.partitionId)
        val identifier = aCredentialsIdentifier(defaultRegionId = defaultRegion.id)

        sut.determineSelectedRegion(identifier, selectedRegion = selectedRegion)

        val notification = getOnlyNotification()

        runInEdtAndWait {
            Notification.fire(notification, notification.actions.first { it.templateText == "Always" }, null)
        }

        assertThat(AwsSettings.getInstance().useDefaultCredentialRegion).isEqualTo(UseAwsCredentialRegion.Always)
    }

    private fun getOnlyNotification(): Notification {
        val credentialNotifications = notificationListener.notifications.filter { it.title == message("aws.notification.title") }
        assertThat(credentialNotifications).hasSize(1)

        return credentialNotifications.first()
    }
}

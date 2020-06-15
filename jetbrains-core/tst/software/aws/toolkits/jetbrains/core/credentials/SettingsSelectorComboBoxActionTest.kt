// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.aCredentialsIdentifier
import software.aws.toolkits.core.region.anAwsRegion

class SettingsSelectorComboBoxActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val dummyRegion = anAwsRegion()
    private val dummyCredential = aCredentialsIdentifier()

    @Test
    fun canConfigureForRegions() {
        val settings = MockAwsConnectionManager.getInstance(projectRule.project)

        val group = SettingsSelectorComboBoxAction(projectRule.project, ChangeAccountSettingsMode.REGIONS)

        settings.changeRegionAndWait(dummyRegion)

        val action = TestActionEvent()
        group.update(action)

        assertThat(action.presentation.text).isEqualTo(dummyRegion.id)
        assertThat(action.presentation.description).isEqualTo(dummyRegion.displayName)
    }

    @Test
    fun canConfigureForCredentials() {
        val settings = MockAwsConnectionManager.getInstance(projectRule.project)

        val group = SettingsSelectorComboBoxAction(projectRule.project, ChangeAccountSettingsMode.CREDENTIALS)

        settings.changeCredentialProviderAndWait(dummyCredential)

        val action = TestActionEvent()
        group.update(action)

        assertThat(action.presentation.text).isEqualTo(dummyCredential.shortName)
        assertThat(action.presentation.description).isEqualTo(dummyCredential.displayName)
    }
}

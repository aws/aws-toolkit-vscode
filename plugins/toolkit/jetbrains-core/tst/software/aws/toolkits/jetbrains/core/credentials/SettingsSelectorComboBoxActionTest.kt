// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.aCredentialsIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.anAwsRegion

class SettingsSelectorComboBoxActionTest {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    private val dummyRegion = anAwsRegion()
    private val dummyCredential = aCredentialsIdentifier()

    @Test
    fun `respects updates to regions`() {
        val testSelector = TestSelector(ChangeSettingsMode.REGIONS)
        val comboBox = SettingsSelectorComboBoxAction(testSelector)

        var presentation = comboBox.updatePresentation()
        assertThat(presentation.text).isEqualTo(testSelector.displayValue())
        assertThat(presentation.description).isEqualTo(testSelector.tooltip())

        testSelector.currentRegion = dummyRegion

        presentation = comboBox.updatePresentation()
        assertThat(presentation.text).isEqualTo(testSelector.displayValue())
        assertThat(presentation.description).isEqualTo(testSelector.tooltip())
    }

    @Test
    fun `respects updates to credentials`() {
        val testSelector = TestSelector(ChangeSettingsMode.CREDENTIALS)
        val comboBox = SettingsSelectorComboBoxAction(testSelector)

        var presentation = comboBox.updatePresentation()
        assertThat(presentation.text).isEqualTo(testSelector.displayValue())
        assertThat(presentation.description).isEqualTo(testSelector.tooltip())

        testSelector.currentCredentials = dummyCredential

        presentation = comboBox.updatePresentation()
        assertThat(presentation.text).isEqualTo(testSelector.displayValue())
        assertThat(presentation.description).isEqualTo(testSelector.tooltip())
    }

    private fun AnAction.updatePresentation(): Presentation = TestActionEvent().also { this.update(it) }.presentation

    class TestSelector(menuMode: ChangeSettingsMode) : SettingsSelectorLogicBase(menuMode) {
        var currentRegion: AwsRegion? = null
        var currentCredentials: CredentialIdentifier? = null

        override fun currentRegion(): AwsRegion? = currentRegion

        override fun onRegionChange(region: AwsRegion) {}

        override fun currentCredentials(): CredentialIdentifier? = currentCredentials

        override fun onCredentialChange(identifier: CredentialIdentifier) {}
    }
}

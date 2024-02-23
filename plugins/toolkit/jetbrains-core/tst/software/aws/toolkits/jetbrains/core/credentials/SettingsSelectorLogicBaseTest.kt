// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.SwitchCredentialsAction
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.SwitchRegionAction
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.resources.message

class SettingsSelectorLogicBaseTest {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    @Rule
    @JvmField
    val regionProviderRule = MockRegionProviderRule()

    @Rule
    @JvmField
    val credentialManagerRule = MockCredentialManagerRule()

    private lateinit var testRegion: AwsRegion
    private lateinit var testCredentials: CredentialIdentifier

    @Before
    fun setUp() {
        testRegion = regionProviderRule.createAwsRegion()
        testCredentials = credentialManagerRule.addCredentials()
    }

    @Test
    fun `text is correct in region only mode`() {
        val selector = TestSelector(ChangeSettingsMode.REGIONS)

        assertThat(selector.displayValue()).isEqualTo(message("settings.regions.none_selected"))
        assertThat(selector.tooltip()).isNull()

        selector.changeRegion(testRegion)

        assertThat(selector.displayValue()).isEqualTo(testRegion.id)
        assertThat(selector.tooltip()).isEqualTo(testRegion.displayName)
    }

    @Test
    fun `text is correct in credential only mode`() {
        val selector = TestSelector(ChangeSettingsMode.CREDENTIALS)

        assertThat(selector.displayValue()).isEqualTo(message("settings.credentials.none_selected"))
        assertThat(selector.tooltip()).isNull()

        selector.changeCredentials(testCredentials)

        assertThat(selector.displayValue()).isEqualTo(testCredentials.shortName)
        assertThat(selector.tooltip()).isEqualTo(testCredentials.displayName)
    }

    @Test
    fun `text is correct in both mode with none set`() {
        val selector = TestSelector(ChangeSettingsMode.BOTH)
        assertThat(selector.displayValue()).isEqualTo(message("settings.credentials.none_selected") + "@" + message("settings.regions.none_selected"))
        assertThat(selector.tooltip()).isNull()
    }

    @Test
    fun `text is correct in both mode with only credentials set`() {
        val selector = TestSelector(ChangeSettingsMode.BOTH)
        selector.changeCredentials(testCredentials)

        assertThat(selector.displayValue()).isEqualTo(testCredentials.shortName + "@" + message("settings.regions.none_selected"))
        assertThat(selector.tooltip()).isNull()
    }

    @Test
    fun `text is correct in both mode with only region set`() {
        val selector = TestSelector(ChangeSettingsMode.BOTH)
        selector.changeRegion(testRegion)

        assertThat(selector.displayValue()).isEqualTo(message("settings.credentials.none_selected") + "@" + testRegion.id)
        assertThat(selector.tooltip()).isNull()
    }

    @Test
    fun `text is correct in both mode with both set`() {
        val selector = TestSelector(ChangeSettingsMode.BOTH)

        selector.changeCredentials(testCredentials)
        selector.changeRegion(testRegion)

        assertThat(selector.displayValue()).isEqualTo(testCredentials.shortName + "@" + testRegion.id)
        assertThat(selector.tooltip()).isNull()
    }

    @Test
    fun `listeners get invoked on region change`() {
        var hit = false
        val selector = TestSelector(ChangeSettingsMode.BOTH)
        selector.addChangeListener { hit = true }

        selector.changeRegion(testRegion)

        assertThat(hit).isTrue
    }

    @Test
    fun `listeners get invoked on credential change`() {
        var hit = false
        val selector = TestSelector(ChangeSettingsMode.BOTH)
        selector.addChangeListener { hit = true }

        selector.changeCredentials(testCredentials)

        assertThat(hit).isTrue
    }

    class TestSelector(menuMode: ChangeSettingsMode) : SettingsSelectorLogicBase(menuMode) {
        private var currentRegion: AwsRegion? = null
        private var currentCredentials: CredentialIdentifier? = null

        override fun currentRegion(): AwsRegion? = currentRegion
        override fun currentCredentials(): CredentialIdentifier? = currentCredentials

        override fun onRegionChange(region: AwsRegion) {
            currentRegion = region
        }

        override fun onCredentialChange(identifier: CredentialIdentifier) {
            currentCredentials = identifier
        }

        fun changeRegion(region: AwsRegion) = selectionMenuActions()
            .getChildren(TestActionEvent())
            .filterIsInstance<SwitchRegionAction>()
            .filter { it.value == region }
            .forEach { it.actionPerformed(TestActionEvent()) }

        fun changeCredentials(identifier: CredentialIdentifier) = selectionMenuActions()
            .getChildren(TestActionEvent())
            .filterIsInstance<SwitchCredentialsAction>()
            .filter { it.value == identifier }
            .forEach { it.actionPerformed(TestActionEvent()) }
    }
}

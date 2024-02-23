// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.util.Ref
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.Companion.connectionSettingsMenuBuilder
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.SwitchCredentialsAction
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.SwitchRegionAction
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager.ProjectAccountSettingsManagerRule
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.resources.message

class ConnectionSettingsMenuBuilderTest {
    private val projectRule = ProjectRule()
    private val regionProviderRule = MockRegionProviderRule()
    private val credentialManagerRule = MockCredentialManagerRule()
    private val settingsManagerRule = ProjectAccountSettingsManagerRule(projectRule)

    @Rule
    @JvmField
    val ruleChain = RuleChain(
        projectRule,
        regionProviderRule,
        credentialManagerRule,
        settingsManagerRule
    )

    @Test
    fun `all regions are shown if no previous selection`() {
        val partition = aString()
        regionProviderRule.createAwsRegion(partitionId = partition)
        regionProviderRule.createAwsRegion(partitionId = partition)
        regionProviderRule.createAwsRegion(partitionId = aString())
        regionProviderRule.createAwsRegion(partitionId = aString())

        val group = connectionSettingsMenuBuilder()
            .withRegions(currentSelection = null) {}
            .build()
        val actions = group.getChildren().filterIsInstance<SwitchRegionAction>()

        assertThat(actions).hasSize(AwsRegionProvider.getInstance().allRegions().size)
    }

    @Test
    fun `only regions from same partition is shown if has a selection`() {
        val partition = aString()
        val selected = regionProviderRule.createAwsRegion(partitionId = partition)
        regionProviderRule.createAwsRegion(partitionId = partition)
        regionProviderRule.createAwsRegion(partitionId = aString())
        regionProviderRule.createAwsRegion(partitionId = aString())

        val group = connectionSettingsMenuBuilder()
            .withRegions(currentSelection = selected) {}
            .build()
        val actions = group.getChildren().filterIsInstance<SwitchRegionAction>()

        assertThat(actions).hasSize(AwsRegionProvider.getInstance().regions(selected.partitionId).size)
        assertThat(actions).allMatch { it.value.partitionId == selected.partitionId }
    }

    @Test
    fun `other partitions are a sub-menu if has a selection`() {
        val partition = aString()
        val selected = regionProviderRule.createAwsRegion(partitionId = partition)
        regionProviderRule.createAwsRegion(partitionId = partition)
        regionProviderRule.createAwsRegion(partitionId = aString())
        regionProviderRule.createAwsRegion(partitionId = aString())

        val otherPartitions = AwsRegionProvider.getInstance().partitions().keys.filterNot { partitionId -> partitionId == selected.partitionId }

        val group = connectionSettingsMenuBuilder()
            .withRegions(currentSelection = selected) {}
            .build()
        val actions = group.getChildren().filterIsInstance<ActionGroup>()

        assertThat(actions).singleElement().satisfies {
            assertThat(it.isPopup).isTrue
            assertThat(it.templatePresentation.text).isEqualTo(message("settings.partitions"))
            assertThat(it.getChildren()).hasSize(otherPartitions.size)
        }
    }

    @Test
    fun `other partitions sub-menu is hidden if only 1 partition`() {
        val partition = regionProviderRule.defaultPartition().id
        val selected = regionProviderRule.createAwsRegion(partitionId = regionProviderRule.defaultRegion().partitionId)
        regionProviderRule.createAwsRegion(partitionId = partition)
        regionProviderRule.createAwsRegion(partitionId = partition)

        val otherPartitions = AwsRegionProvider.getInstance().partitions().keys.filterNot { partitionId -> partitionId == selected.partitionId }
        assertThat(otherPartitions).isEmpty()

        val group = connectionSettingsMenuBuilder()
            .withRegions(currentSelection = selected) {}
            .build()
        val actions = group.getChildren().filterIsInstance<ActionGroup>()
        assertThat(actions).isEmpty()
    }

    @Test
    fun `can change regions`() {
        val holder = Ref.create<AwsRegion>()

        val group = connectionSettingsMenuBuilder()
            .withRegions(currentSelection = null, holder::set)
            .build()
        val actions = group.getChildren().filterIsInstance<SwitchRegionAction>()

        assertThat(actions).hasSizeGreaterThanOrEqualTo(1)
        val action = actions.first()

        action.actionPerformed(TestActionEvent())

        assertThat(holder.get()).isEqualTo(action.value)
    }

    @Test
    fun `can change region only if not same as selected`() {
        val holder = Ref.create<AwsRegion>()

        val partition = aString()
        val selected = regionProviderRule.createAwsRegion(partitionId = partition)
        val notSelected = regionProviderRule.createAwsRegion(partitionId = partition)

        val group = connectionSettingsMenuBuilder()
            .withRegions(currentSelection = selected, holder::set)
            .build()
        val actions = group.getChildren().filterIsInstance<SwitchRegionAction>()

        val selectedAction = actions.first { it.value == selected }
        selectedAction.actionPerformed(TestActionEvent())
        assertThat(holder.isNull).isTrue

        val notSelectedAction = actions.first { it.value == notSelected }
        notSelectedAction.actionPerformed(TestActionEvent())
        assertThat(holder.get()).isEqualTo(notSelected)
    }

    @Test
    fun `all credentials are shown`() {
        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()

        val group = connectionSettingsMenuBuilder()
            .withCredentials(currentSelection = null) {}
            .build()
        val actions = group.getChildren().filterIsInstance<SwitchCredentialsAction>()

        assertThat(actions).hasSize(CredentialManager.getInstance().getCredentialIdentifiers().size)
    }

    @Test
    fun `can change credentials`() {
        val holder = Ref.create<CredentialIdentifier>()

        credentialManagerRule.addCredentials()

        val group = connectionSettingsMenuBuilder()
            .withCredentials(currentSelection = null, holder::set)
            .build()
        val actions = group.getChildren().filterIsInstance<SwitchCredentialsAction>()

        assertThat(actions).hasSizeGreaterThan(1)
        val action = actions.first()

        action.actionPerformed(TestActionEvent())

        assertThat(holder.get()).isEqualTo(action.value)
    }

    @Test
    fun `can change credentials only if not same as selected`() {
        val holder = Ref.create<CredentialIdentifier>()

        val selected = credentialManagerRule.addCredentials()
        val notSelected = credentialManagerRule.addCredentials()

        val group = connectionSettingsMenuBuilder()
            .withCredentials(currentSelection = selected, holder::set)
            .build()
        val actions = group.getChildren().filterIsInstance<SwitchCredentialsAction>()

        val selectedAction = actions.first { it.value == selected }
        selectedAction.actionPerformed(TestActionEvent())
        assertThat(holder.isNull).isTrue

        val notSelectedAction = actions.first { it.value == notSelected }
        notSelectedAction.actionPerformed(TestActionEvent())
        assertThat(holder.get()).isEqualTo(notSelected)
    }

    @Test
    fun `both credentials and regions can be in the same menu`() {
        regionProviderRule.createAwsRegion()
        regionProviderRule.createAwsRegion()
        regionProviderRule.createAwsRegion()

        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()

        val group = connectionSettingsMenuBuilder()
            .withCredentials(currentSelection = null) {}
            .withRegions(currentSelection = null) {}
            .build()

        val regionActions = group.getChildren().filterIsInstance<SwitchRegionAction>()
        val credentialActions = group.getChildren().filterIsInstance<SwitchCredentialsAction>()

        assertThat(regionActions).hasSize(AwsRegionProvider.getInstance().allRegions().size)
        assertThat(credentialActions).hasSize(CredentialManager.getInstance().getCredentialIdentifiers().size)
    }

    @Test
    fun `recent regions are shown, with all in a sub-menu`() {
        val settingsManager = settingsManagerRule.settingsManager

        settingsManager.addRecentRegion(regionProviderRule.createAwsRegion())
        settingsManager.addRecentRegion(regionProviderRule.createAwsRegion())
        regionProviderRule.createAwsRegion()
        regionProviderRule.createAwsRegion()

        val group = connectionSettingsMenuBuilder()
            .withRegions(currentSelection = null) {}
            .withRecentChoices(projectRule.project)
            .build()

        val recentActions = group.getChildren().filterIsInstance<SwitchRegionAction>()
        val allRegions = group.getChildren().filterIsInstance<ActionGroup>()
            .first { it.templatePresentation.text == message("settings.regions.region_sub_menu") }
            .getChildren()
            .filterIsInstance<SwitchRegionAction>()

        assertThat(recentActions).hasSize(settingsManager.recentlyUsedRegions().size)
        assertThat(allRegions).hasSize(AwsRegionProvider.getInstance().allRegions().size)
    }

    @Test
    fun `if no recent regions, all are shown`() {
        settingsManagerRule.settingsManager.clearRecentRegions()

        regionProviderRule.createAwsRegion()
        regionProviderRule.createAwsRegion()
        regionProviderRule.createAwsRegion()
        regionProviderRule.createAwsRegion()

        val group = connectionSettingsMenuBuilder()
            .withRegions(currentSelection = null) {}
            .withRecentChoices(projectRule.project)
            .build()

        val titleAction = group.getChildren().filterIsInstance<Separator>().filter { it.text == message("settings.regions.recent") }
        val regionActions = group.getChildren().filterIsInstance<SwitchRegionAction>()

        assertThat(titleAction).isEmpty()
        assertThat(regionActions).hasSize(AwsRegionProvider.getInstance().allRegions().size)
    }

    @Test
    fun `recent credentials are shown, with all in a sub-menu`() {
        val settingsManager = settingsManagerRule.settingsManager

        settingsManager.addRecentCredentials(credentialManagerRule.addCredentials())
        settingsManager.addRecentCredentials(credentialManagerRule.addCredentials())
        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()

        val group = connectionSettingsMenuBuilder()
            .withCredentials(currentSelection = null) {}
            .withRecentChoices(projectRule.project)
            .build()

        val titleAction = group.getChildren().filterIsInstance<Separator>().filter { it.text == message("settings.credentials.iam") }
        val recentActions = group.getChildren().filterIsInstance<SwitchCredentialsAction>()
        val allCredentials = group.getChildren().filterIsInstance<ActionGroup>()
            .first { it.templatePresentation.text == message("settings.credentials.profile_sub_menu") }
            .getChildren()
            .filterIsInstance<SwitchCredentialsAction>()

        assertThat(titleAction).singleElement()
        assertThat(recentActions).hasSize(settingsManager.recentlyUsedCredentials().size)
        assertThat(allCredentials).hasSize(CredentialManager.getInstance().getCredentialIdentifiers().size)
    }

    @Test
    fun `if no recent credentials, all are shown`() {
        settingsManagerRule.settingsManager.clearRecentCredentials()

        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()
        credentialManagerRule.addCredentials()

        val group = connectionSettingsMenuBuilder()
            .withCredentials(currentSelection = null) {}
            .withRecentChoices(projectRule.project)
            .build()

        val titleAction = group.getChildren().filterIsInstance<Separator>().filter { it.text == message("settings.credentials.recent") }
        val credentialsActions = group.getChildren().filterIsInstance<SwitchCredentialsAction>()

        assertThat(titleAction).isEmpty()
        assertThat(credentialsActions).hasSize(CredentialManager.getInstance().getCredentialIdentifiers().size)
    }

    private fun ActionGroup.getChildren(): Array<AnAction> = this.getChildren(TestActionEvent())
}

// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion

class ChangeAccountSettingsActionGroupTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val regionProviderRule = MockRegionProviderRule()

    @Rule
    @JvmField
    val settingsManagerRule = MockAwsConnectionManager.ProjectAccountSettingsManagerRule(projectRule)

    @Test
    fun `Can display both region and credentials selection`() {
        val group = ChangeAccountSettingsActionGroup(projectRule.project, ChangeAccountSettingsMode.BOTH)
        val actions = group.getChildren(null)

        assertThat(actions).hasAtLeastOneElementOfType(ChangeRegionAction::class.java)
        assertThat(actions).hasAtLeastOneElementOfType(ChangeCredentialsAction::class.java)
    }

    @Test
    fun `Can display only region selection`() {
        val group = ChangeAccountSettingsActionGroup(projectRule.project, ChangeAccountSettingsMode.REGIONS)
        val actions = group.getChildren(null)

        assertThat(actions).hasAtLeastOneElementOfType(ChangeRegionAction::class.java)
        assertThat(actions).doesNotHaveAnyElementsOfTypes(ChangeCredentialsAction::class.java)
    }

    @Test
    fun `Can display only credentials selection`() {
        val group = ChangeAccountSettingsActionGroup(projectRule.project, ChangeAccountSettingsMode.CREDENTIALS)
        val actions = group.getChildren(null)

        assertThat(actions).doesNotHaveAnyElementsOfTypes(ChangeRegionAction::class.java)
        assertThat(actions).hasAtLeastOneElementOfType(ChangeCredentialsAction::class.java)
    }

    @Test
    fun `Region group all regions at the top-level for selected partition and shows regions for non-selected partitions in a partition sub-menu`() {
        val selectedRegion = regionProviderRule.createAwsRegion(partitionId = "selected")
        val otherPartitionRegion = regionProviderRule.createAwsRegion(partitionId = "nonSelected")
        val anotherRegionInSamePartition = regionProviderRule.createAwsRegion(partitionId = otherPartitionRegion.partitionId)

        settingsManagerRule.settingsManager.changeRegionAndWait(selectedRegion)

        val group = ChangeAccountSettingsActionGroup(projectRule.project, ChangeAccountSettingsMode.REGIONS)

        val regionActionGroup = getRegionActions(group)

        val topLevelRegionActions = regionActionGroup.filterIsInstance<ChangeRegionAction>()
        val partitionActions = regionActionGroup.filterIsInstance<ChangePartitionActionGroup>().first().getChildren(null)
        val nonSelectedSubAction = partitionActions.filterIsInstance<ChangeRegionActionGroup>().first { it.templateText == otherPartitionRegion.partitionId }
            .getChildren(null).filterIsInstance<ChangeRegionAction>()

        assertThat(topLevelRegionActions).hasOnlyOneElementSatisfying {
            it.templateText == selectedRegion.displayName
        }
        assertThat(partitionActions).noneMatch { it.templateText == selectedRegion.partitionId }

        assertThat(nonSelectedSubAction).hasSize(2)
        assertThat(nonSelectedSubAction.map { it.templateText }).containsExactlyInAnyOrder(
            otherPartitionRegion.displayName,
            anotherRegionInSamePartition.displayName
        )
    }

    @Test
    fun `Don't show partition selector if there is only one partition`() {
        val selectedRegion = getDefaultRegion()

        settingsManagerRule.settingsManager.changeRegionAndWait(selectedRegion)

        val group = ChangeAccountSettingsActionGroup(projectRule.project, ChangeAccountSettingsMode.REGIONS)
        val actions = getRegionActions(group)

        assertThat(actions).doesNotHaveAnyElementsOfTypes(ChangePartitionActionGroup::class.java)
    }

    private fun getRegionActions(group: ChangeAccountSettingsActionGroup) = group.getChildren(null)
        .filterIsInstance<ChangeRegionActionGroup>().first().getChildren(null)
}

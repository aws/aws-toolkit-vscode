// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.psi.util.CachedValueProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.actions.ComputableActionGroup
import software.aws.toolkits.resources.message

class ChangeAccountSettingsActionGroup(private val project: Project, private val showRegions: Boolean) : ComputableActionGroup(), DumbAware {
    private val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)
    private val partitionSelector = ChangePartitionActionGroup()
    private val regionSelector = ChangeRegionActionGroup(partitionSelector, accountSettingsManager)
    private val credentialSelector = ChangeCredentialsActionGroup(true)

    override fun createChildrenProvider(actionManager: ActionManager?): CachedValueProvider<Array<AnAction>> = CachedValueProvider {
        val actions = mutableListOf<AnAction>()

        if (showRegions) {
            val usedRegions = accountSettingsManager.recentlyUsedRegions()
            if (usedRegions.isEmpty()) {
                regionSelector.isPopup = false
                actions.add(regionSelector)
            } else {
                actions.add(Separator.create(message("settings.regions.recent")))
                usedRegions.forEach {
                    actions.add(ChangeRegionAction(it))
                }

                regionSelector.isPopup = true
                actions.add(regionSelector)
            }
        }

        val usedCredentials = accountSettingsManager.recentlyUsedCredentials()
        if (usedCredentials.isEmpty()) {
            actions.add(Separator.create(message("settings.credentials")))

            credentialSelector.isPopup = false
            actions.add(credentialSelector)
        } else {
            actions.add(Separator.create(message("settings.credentials.recent")))
            usedCredentials.forEach {
                actions.add(ChangeCredentialsAction(it))
            }

            credentialSelector.isPopup = true
            actions.add(credentialSelector)
        }

        CachedValueProvider.Result.create(actions.toTypedArray(), accountSettingsManager)
    }
}

private class ChangePartitionActionGroup : DefaultActionGroup(message("settings.partitions"), true), DumbAware {
    init {
        addAll(AwsRegionProvider.getInstance().partitions().map {
            object : ToggleAction(it.value.description), DumbAware {
                private val partition = it.value
                override fun isSelected(e: AnActionEvent) = getAccountSetting(e).selectedPartition == partition

                override fun setSelected(e: AnActionEvent, state: Boolean) {
                    if (state) {
                        getAccountSetting(e).changePartition(partition)
                    }
                }
            }
        })
    }
}

private class ChangeCredentialsActionGroup(popup: Boolean) : ComputableActionGroup(
    message("settings.credentials.profile_sub_menu"),
    popup
), DumbAware {
    override fun createChildrenProvider(actionManager: ActionManager?): CachedValueProvider<Array<AnAction>> = CachedValueProvider {
        val credentialManager = CredentialManager.getInstance()

        val actions = mutableListOf<AnAction>()
        credentialManager.getCredentialIdentifiers().forEach {
            actions.add(ChangeCredentialsAction(it))
        }
        actions.add(Separator.create())
        actions.add(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))

        CachedValueProvider.Result.create(actions.toTypedArray(), credentialManager)
    }
}

private class ChangeRegionActionGroup(
    private val partitionSelector: ChangePartitionActionGroup,
    private val accountSettingsManager: ProjectAccountSettingsManager
) :
    ComputableActionGroup(message("settings.regions.region_sub_menu"), true), DumbAware {
    private val regionProvider = AwsRegionProvider.getInstance()
    override fun createChildrenProvider(actionManager: ActionManager?): CachedValueProvider<Array<AnAction>> = CachedValueProvider {
        val partition = accountSettingsManager.selectedPartition
        val (regionMap, partitionGroup) = partition?.let {
            // if a partition has been selected, only show regions in that partition
            // and the partition selector
            regionProvider.regions(partition.id) to partitionSelector
            // otherwise show everything with no partition selector
        } ?: regionProvider.allRegions() to null
        val regions = regionMap.values.groupBy { it.category }
        val partitionActions = partitionGroup?.let { listOf(it) } ?: emptyList<AnAction>()

        val actions = partitionActions +
        regions.flatMap { (category, subRegions) ->
            listOf(Separator.create(category)) +
            subRegions.map {
                ChangeRegionAction(it)
            }
        } as List<AnAction>

        CachedValueProvider.Result.create(actions.toTypedArray(), accountSettingsManager)
    }
}

private class ChangeRegionAction(private val region: AwsRegion) : ToggleAction(region.displayName), DumbAware {
    override fun isSelected(e: AnActionEvent): Boolean = getAccountSetting(e).selectedRegion == region

    override fun setSelected(e: AnActionEvent, state: Boolean) {
        if (state) {
            getAccountSetting(e).changeRegion(region)
        }
    }
}

private class ChangeCredentialsAction(private val credentialsProvider: ToolkitCredentialsIdentifier) : ToggleAction(credentialsProvider.displayName),
    DumbAware {
    override fun isSelected(e: AnActionEvent): Boolean = getAccountSetting(e).selectedCredentialIdentifier == credentialsProvider

    override fun setSelected(e: AnActionEvent, state: Boolean) {
        if (state) {
            getAccountSetting(e).changeCredentialProvider(credentialsProvider)
        }
    }
}

private fun getAccountSetting(e: AnActionEvent): ProjectAccountSettingsManager =
    ProjectAccountSettingsManager.getInstance(e.getRequiredData(PlatformDataKeys.PROJECT))

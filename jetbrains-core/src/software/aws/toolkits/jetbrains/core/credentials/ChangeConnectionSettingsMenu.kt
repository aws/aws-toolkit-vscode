// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.actionSystem.ex.ComboBoxAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.psi.util.CachedValueProvider
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsPartition
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager.Companion.selectedPartition
import software.aws.toolkits.jetbrains.core.credentials.ChangeAccountSettingsMode.BOTH
import software.aws.toolkits.jetbrains.core.credentials.ChangeAccountSettingsMode.CREDENTIALS
import software.aws.toolkits.jetbrains.core.credentials.ChangeAccountSettingsMode.REGIONS
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.actions.ComputableActionGroup
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import javax.swing.JComponent

class ChangeAccountSettingsActionGroup(project: Project, private val mode: ChangeAccountSettingsMode) : ComputableActionGroup(), DumbAware {
    private val accountSettingsManager = AwsConnectionManager.getInstance(project)
    private val regionSelector = ChangeRegionActionGroup(
        accountSettingsManager.selectedPartition,
        accountSettingsManager,
        ChangePartitionActionGroup(accountSettingsManager)
    )
    private val credentialSelector = ChangeCredentialsActionGroup()

    override fun createChildrenProvider(actionManager: ActionManager?): CachedValueProvider<Array<AnAction>> = CachedValueProvider {
        val actions = mutableListOf<AnAction>()

        if (mode.showRegions) {
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

        if (mode.showCredentials) {
            val usedCredentials = accountSettingsManager.recentlyUsedCredentials()
            if (usedCredentials.isEmpty()) {
                actions.add(Separator.create(message("settings.credentials")))
                actions.add(credentialSelector)
            } else {
                actions.add(Separator.create(message("settings.credentials.recent")))
                usedCredentials.forEach {
                    actions.add(ChangeCredentialsAction(it))
                }

                val allCredentials = DefaultActionGroup(message("settings.credentials.profile_sub_menu"), true)
                allCredentials.add(credentialSelector)
                allCredentials.add(Separator.create())
                allCredentials.add(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))

                actions.add(allCredentials)
            }
        }

        // Both mode == status bar version
        if (mode == BOTH) {
            actions.add(Separator.create())
            actions.addAll(accountSettingsManager.connectionState.actions)
        }

        CachedValueProvider.Result.create(actions.toTypedArray(), accountSettingsManager)
    }
}

enum class ChangeAccountSettingsMode(
    internal val showRegions: Boolean,
    internal val showCredentials: Boolean
) {
    CREDENTIALS(false, true),
    REGIONS(true, false),
    BOTH(true, true)
}

private class ChangeCredentialsActionGroup : ComputableActionGroup(), DumbAware {
    override fun createChildrenProvider(actionManager: ActionManager?): CachedValueProvider<Array<AnAction>> = CachedValueProvider {
        val credentialManager = CredentialManager.getInstance()

        val actions = mutableListOf<AnAction>()
        credentialManager.getCredentialIdentifiers().forEach {
            actions.add(ChangeCredentialsAction(it))
        }

        CachedValueProvider.Result.create(actions.toTypedArray(), credentialManager)
    }
}

internal class ChangePartitionActionGroup(private val accountSettingsManager: AwsConnectionManager) :
    ComputableActionGroup(message("settings.partitions"), true), DumbAware {
    override fun createChildrenProvider(actionManager: ActionManager?): CachedValueProvider<Array<AnAction>> = CachedValueProvider {
        val selectedPartitionId = accountSettingsManager.selectedPartition?.id
        val actions = AwsRegionProvider.getInstance().partitions().values.filter { it.id != selectedPartitionId }.map { partition ->
            ChangeRegionActionGroup(partition, accountSettingsManager, name = partition.description)
        } as List<AnAction>

        CachedValueProvider.Result.create(actions.toTypedArray(), accountSettingsManager)
    }
}

internal class ChangeRegionActionGroup(
    private val partition: AwsPartition?,
    private val accountSettingsManager: AwsConnectionManager,
    private val partitionSelector: ChangePartitionActionGroup? = null,
    name: String = message("settings.regions.region_sub_menu")
) : ComputableActionGroup(name, true), DumbAware {
    private val regionProvider = AwsRegionProvider.getInstance()

    override fun createChildrenProvider(actionManager: ActionManager?): CachedValueProvider<Array<AnAction>> = CachedValueProvider {
        val (regionMap, partitionGroup) = partition?.let {
            // if a partition has been selected, only show regions in that partition
            // and the partition selector
            regionProvider.regions(partition.id) to partitionSelector
            // otherwise show everything with no partition selector
        } ?: regionProvider.allRegions() to null

        val actions = mutableListOf<AnAction>()

        regionMap.values.groupBy { it.category }.forEach { (category, subRegions) ->
            actions.add(Separator.create(category))
            subRegions.forEach {
                actions.add(ChangeRegionAction(it))
            }
        }

        if (partitionGroup != null && regionProvider.partitions().size > 1) {
            actions.add(Separator.create())
            actions.add(partitionGroup)
        }

        CachedValueProvider.Result.create(actions.toTypedArray(), accountSettingsManager)
    }
}

internal class ChangeRegionAction(private val region: AwsRegion) : ToggleAction(region.displayName), DumbAware {
    override fun isSelected(e: AnActionEvent): Boolean = getAccountSetting(e).selectedRegion == region

    override fun setSelected(e: AnActionEvent, state: Boolean) {
        if (state) {
            val oldRegion = getAccountSetting(e).selectedRegion

            getAccountSetting(e).changeRegion(region)

            if (oldRegion?.partitionId != region.partitionId) {
                AwsTelemetry.setPartition(
                    partitionId = region.partitionId
                )
            }

            AwsTelemetry.setRegion(
                regionId = region.id
            )
        }
    }
}

internal class ChangeCredentialsAction(private val credentialsProvider: CredentialIdentifier) :
    ToggleAction(credentialsProvider.displayName),
    DumbAware {
    override fun isSelected(e: AnActionEvent): Boolean = getAccountSetting(e).selectedCredentialIdentifier == credentialsProvider

    override fun setSelected(e: AnActionEvent, state: Boolean) {
        if (state) {
            getAccountSetting(e).changeCredentialProvider(credentialsProvider)
        }
    }
}

private fun getAccountSetting(e: AnActionEvent): AwsConnectionManager =
    AwsConnectionManager.getInstance(e.getRequiredData(PlatformDataKeys.PROJECT))

class SettingsSelectorComboBoxAction(
    private val project: Project,
    private val mode: ChangeAccountSettingsMode
) : ComboBoxAction(), DumbAware {
    private val accountSettingsManager by lazy {
        AwsConnectionManager.getInstance(project)
    }

    init {
        updatePresentation(templatePresentation)
    }

    override fun createPopupActionGroup(button: JComponent?) = DefaultActionGroup(ChangeAccountSettingsActionGroup(project, mode))

    override fun update(e: AnActionEvent) {
        updatePresentation(e.presentation)
    }

    override fun displayTextInToolbar(): Boolean = true

    private fun updatePresentation(presentation: Presentation) {
        val (short, long) = when (mode) {
            CREDENTIALS -> credentialsText()
            REGIONS -> regionText()
            BOTH -> "${credentialsText()}@${regionText()}" to null
        }
        presentation.text = short
        presentation.description = long
    }

    private fun regionText() = accountSettingsManager.selectedRegion?.let {
        it.id to it.displayName
    } ?: message("settings.regions.none_selected") to null

    private fun credentialsText() = accountSettingsManager.selectedCredentialIdentifier?.let {
        it.shortName to it.displayName
    } ?: message("settings.credentials.none_selected") to null
}

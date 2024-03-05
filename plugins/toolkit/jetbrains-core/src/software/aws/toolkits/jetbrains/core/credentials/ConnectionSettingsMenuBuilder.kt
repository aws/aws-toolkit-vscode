// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.actions.SsoLogoutAction
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.resources.message

class ConnectionSettingsMenuBuilder private constructor() {
    private data class RegionSelectionSettings(val currentSelection: AwsRegion?, val onChange: (AwsRegion) -> Unit)
    private data class ProfileSelectionSettings(val currentSelection: CredentialIdentifier?, val onChange: (CredentialIdentifier) -> Unit)

    private sealed interface IdentitySelectionSettings
    private data class SelectableIdentitySelectionSettings(
        val currentSelection: AwsBearerTokenConnection?,
        val onChange: (AwsBearerTokenConnection) -> Unit
    ) : IdentitySelectionSettings
    private data class ActionsIdentitySelectionSettings(val project: Project?) : IdentitySelectionSettings

    private var regionSelectionSettings: RegionSelectionSettings? = null
    private var profileSelectionSettings: ProfileSelectionSettings? = null
    private var identitySelectionSettings: IdentitySelectionSettings? = null
    private var accountSettingsManager: AwsConnectionManager? = null

    fun withRegions(currentSelection: AwsRegion?, onChange: (AwsRegion) -> Unit): ConnectionSettingsMenuBuilder = apply {
        regionSelectionSettings = RegionSelectionSettings(currentSelection, onChange)
    }

    fun withCredentials(currentSelection: CredentialIdentifier?, onChange: (CredentialIdentifier) -> Unit): ConnectionSettingsMenuBuilder = apply {
        profileSelectionSettings = ProfileSelectionSettings(currentSelection, onChange)
    }

    fun withRecentChoices(project: Project): ConnectionSettingsMenuBuilder = apply {
        accountSettingsManager = AwsConnectionManager.getInstance(project)
    }

    fun withIndividualIdentitySettings(project: Project) {
        identitySelectionSettings = SelectableIdentitySelectionSettings(
            currentSelection = ToolkitConnectionManager.getInstance(project).activeConnection() as? AwsBearerTokenConnection,
            onChange = ToolkitConnectionManager.getInstance(project)::switchConnection
        )
    }

    fun withIndividualIdentityActions(project: Project?) {
        identitySelectionSettings = ActionsIdentitySelectionSettings(project)
    }

    fun build(): DefaultActionGroup {
        val topLevelGroup = DefaultActionGroup()

        identitySelectionSettings?.let { settings ->
            val connections = ToolkitAuthManager.getInstance().listConnections().filterIsInstance<AwsBearerTokenConnection>()
            if (connections.isEmpty()) {
                return@let
            }

            topLevelGroup.add(Separator.create(message("settings.credentials.individual_identity_sub_menu")))
            val actions = when (settings) {
                is SelectableIdentitySelectionSettings -> {
                    connections.map {
                        object : DumbAwareToggleAction<AwsBearerTokenConnection>(
                            title = it.label,
                            value = it,
                            selected = it == settings.currentSelection,
                            onSelect = settings.onChange
                        ) {
                            override fun update(e: AnActionEvent) {
                                super.update(e)
                                if (value.lazyIsUnauthedBearerConnection()) {
                                    e.presentation.icon = AllIcons.General.Warning
                                }
                            }
                        }
                    }
                }

                is ActionsIdentitySelectionSettings -> {
                    connections.map {
                        IndividualIdentityActionGroup(it)
                    }
                }
            }

            topLevelGroup.addAll(actions)

            topLevelGroup.add(Separator.create())
        }

        val profileActions = createProfileActions()
        val regionActions = createRegionActions()

        // no header if only regions
        if (profileActions.isNotEmpty() && regionActions.isNotEmpty()) {
            // both profiles & regions
            topLevelGroup.add(Separator.create(message("settings.credentials.iam_and_regions")))
        } else if (profileActions.isNotEmpty() && regionActions.isEmpty()) {
            // only profiles
            topLevelGroup.add(Separator.create(message("settings.credentials.iam")))
        }

        val regionSettings = regionSelectionSettings
        val recentRegions = accountSettingsManager?.recentlyUsedRegions()
        if (recentRegions?.isNotEmpty() == true && regionSettings != null) {
            recentRegions.forEach {
                topLevelGroup.add(SwitchRegionAction(it, it == regionSettings.currentSelection, regionSettings.onChange))
            }

            val allRegionsGroup = DefaultActionGroup.createPopupGroup { message("settings.regions.region_sub_menu") }
            allRegionsGroup.addAll(regionActions)
            topLevelGroup.add(allRegionsGroup)
        } else {
            topLevelGroup.addAll(regionActions)
        }

        topLevelGroup.add(Separator.create())

        val credentialsSettings = profileSelectionSettings
        val recentCredentials = accountSettingsManager?.recentlyUsedCredentials()
        if (recentCredentials?.isNotEmpty() == true && credentialsSettings != null) {
            recentCredentials.forEach {
                topLevelGroup.add(SwitchCredentialsAction(it, it == credentialsSettings.currentSelection, credentialsSettings.onChange))
            }

            val allCredentialsGroup = DefaultActionGroup.createPopupGroup { message("settings.credentials.profile_sub_menu") }
            allCredentialsGroup.addAll(profileActions)
            topLevelGroup.add(allCredentialsGroup)
        } else {
            topLevelGroup.addAll(profileActions)
        }

        return topLevelGroup
    }

    private fun createRegionActions(): List<AnAction> = buildList {
        val (currentSelection, onChange) = regionSelectionSettings ?: return@buildList

        val regionProvider = AwsRegionProvider.getInstance()

        val primaryRegions = currentSelection?.partitionId?.let {
            regionProvider.regions(it).values
        } ?: regionProvider.allRegions().values

        addAll(createRegionGroupActions(primaryRegions, currentSelection, onChange))

        if (currentSelection != null && regionProvider.partitions().size > 1) {
            val otherPartitionActionGroup = DefaultActionGroup.createPopupGroup { message("settings.partitions") }
            val otherPartitions = regionProvider.partitions().values.filterNot { it.id == currentSelection.partitionId }.sortedBy { it.displayName }
            otherPartitions.forEach {
                val partitionGroup = DefaultActionGroup.createPopupGroup { it.displayName }
                partitionGroup.addAll(createRegionGroupActions(it.regions, currentSelection = null, onChange))

                otherPartitionActionGroup.add(partitionGroup)
            }

            add(Separator.create())
            add(otherPartitionActionGroup)
        }
    }

    private fun createRegionGroupActions(regions: Collection<AwsRegion>, currentSelection: AwsRegion?, onChange: (AwsRegion) -> Unit) = buildList<AnAction> {
        regions.groupBy { it.category }
            .forEach { (category, categoryRegions) ->
                add(Separator.create(category))
                categoryRegions.sortedBy { it.displayName }
                    .forEach { add(SwitchRegionAction(it, it == currentSelection, onChange)) }
            }
    }

    private fun createProfileActions(): List<AnAction> = buildList {
        val (currentSelection, onChange) = profileSelectionSettings ?: return@buildList

        add(Separator.create(message("settings.credentials")))

        val credentialManager = CredentialManager.getInstance()
        credentialManager.getCredentialIdentifiers().forEach {
            add(SwitchCredentialsAction(it, it == currentSelection, onChange))
        }

        add(Separator.create())
        add(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))
    }

    // Helper actions, note: these are public to help make tests easier by leveraging instanceOf checks

    abstract inner class DumbAwareToggleAction<T>(
        title: String,
        val value: T,
        private val selected: Boolean,
        private val onSelect: (T) -> Unit
    ) : ToggleAction(title), DumbAware {
        override fun getActionUpdateThread() = ActionUpdateThread.BGT

        override fun isSelected(e: AnActionEvent): Boolean = selected

        override fun setSelected(e: AnActionEvent, state: Boolean) {
            if (!isSelected(e)) {
                onSelect.invoke(value)
            }
        }
    }

    inner class SwitchRegionAction(
        value: AwsRegion,
        selected: Boolean,
        onSelect: (AwsRegion) -> Unit
    ) : DumbAwareToggleAction<AwsRegion>(value.displayName, value, selected, onSelect)

    inner class SwitchCredentialsAction(
        value: CredentialIdentifier,
        selected: Boolean,
        onSelect: (CredentialIdentifier) -> Unit
    ) : DumbAwareToggleAction<CredentialIdentifier>(value.displayName, value, selected, onSelect)

    inner class IndividualIdentityActionGroup(private val value: AwsBearerTokenConnection) :
        DefaultActionGroup(
            {
                val suffix = if (value.lazyIsUnauthedBearerConnection()) {
                    message("credentials.individual_identity.expired")
                } else {
                    message("credentials.individual_identity.connected")
                }

                "${value.label} $suffix"
            },
            true
        ) {
        init {
            templatePresentation.icon = if (value.lazyIsUnauthedBearerConnection()) AllIcons.General.Warning else null

            addAll(
                object : DumbAwareAction(message("credentials.individual_identity.reconnect")) {
                    override fun actionPerformed(e: AnActionEvent) {
                        reauthConnectionIfNeeded(e.project, value)

                        ToolkitConnectionManager.getInstance(e.project).switchConnection(value)
                    }
                },

                SsoLogoutAction(value)
            )
        }
    }

    companion object {
        fun connectionSettingsMenuBuilder(): ConnectionSettingsMenuBuilder = ConnectionSettingsMenuBuilder()
    }
}

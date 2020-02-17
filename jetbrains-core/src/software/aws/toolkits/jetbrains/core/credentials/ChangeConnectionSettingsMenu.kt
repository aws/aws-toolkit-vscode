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
    private val regionSelector = ChangeRegionActionGroup()
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

// TODO: This should be computable, but region provider is immutable today
private class ChangeRegionActionGroup : DefaultActionGroup(), DumbAware {
    init {
        templatePresentation.text = message("settings.regions.region_sub_menu")

        val regions = AwsRegionProvider.getInstance().regions().values.groupBy { it.category }

        regions.forEach { (category, subRegions) ->
            addSeparator(category)
            subRegions.forEach {
                add(ChangeRegionAction(it))
            }
        }
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

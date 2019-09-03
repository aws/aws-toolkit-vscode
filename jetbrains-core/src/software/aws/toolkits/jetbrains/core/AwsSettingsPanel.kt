// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.WindowManager
import com.intellij.psi.util.CachedValueProvider
import com.intellij.util.Consumer
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.components.telemetry.AnActionWrapper
import software.aws.toolkits.jetbrains.components.telemetry.ComboBoxActionWrapper
import software.aws.toolkits.jetbrains.components.telemetry.ToggleActionWrapper
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager.AccountSettingsChangedNotifier
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.actions.ComputableActionGroup
import software.aws.toolkits.resources.message
import java.awt.Component
import java.awt.event.MouseEvent
import javax.swing.JComponent

class AwsSettingsPanelInstaller : StartupActivity, DumbAware {
    override fun runActivity(project: Project) {
        WindowManager.getInstance().getStatusBar(project).addWidget(AwsSettingsPanel(project), project)
    }
}

private class AwsSettingsPanel(private val project: Project) : StatusBarWidget,
    StatusBarWidget.MultipleTextValuesPresentation,
    AccountSettingsChangedNotifier {
    private val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)
    private val settingsSelector = SettingsSelector(project)
    private lateinit var statusBar: StatusBar

    @Suppress("FunctionName")
    override fun ID(): String = "AwsSettingsPanel"

    override fun getTooltipText() = SettingsSelector.tooltipText

    override fun getSelectedValue(): String {
        val statusLine = try {
            val displayName = accountSettingsManager.activeCredentialProvider.displayName
            "$displayName@${accountSettingsManager.activeRegion.name}"
        } catch (_: CredentialProviderNotFound) {
            // TODO: Need to better handle the case where they have no valid profile selected
            message("settings.credentials.none_selected")
        }

        return "AWS: $statusLine"
    }

    @Suppress("OverridingDeprecatedMember") // No choice, part of interface contract with no default
    override fun getMaxValue(): String {
        TODO("not implemented")
    }

    override fun getPopupStep() = settingsSelector.settingsPopup(statusBar.component)

    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    override fun getPresentation(type: StatusBarWidget.PlatformType) = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        project.messageBus.connect().subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, this)
        updateWidget()
    }

    override fun settingsChanged(event: AccountSettingsChangedNotifier.AccountSettingsEvent) {
        updateWidget()
    }

    private fun updateWidget() {
        statusBar.updateWidget(ID())
    }

    override fun dispose() {
        if (::statusBar.isInitialized) {
            ApplicationManager.getApplication().invokeLater({ statusBar.removeWidget(ID()) }, { project.isDisposed })
        }
    }
}

class SettingsSelectorAction(private val showRegions: Boolean = true) : AnActionWrapper(message("configure.toolkit")), DumbAware {
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val settingsSelector = SettingsSelector(project)
        settingsSelector.settingsPopup(e.dataContext, showRegions = showRegions).showCenteredInCurrentWindow(project)
    }
}

class SettingsSelector(project: Project) {
    private val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)

    fun settingsPopup(contextComponent: Component, showRegions: Boolean = true): ListPopup {
        val dataContext = DataManager.getInstance().getDataContext(contextComponent)
        return settingsPopup(dataContext, showRegions)
    }

    fun settingsPopup(dataContext: DataContext, showRegions: Boolean = true): ListPopup = JBPopupFactory.getInstance().createActionGroupPopup(
        tooltipText,
        ChangeAccountSettingsAction(accountSettingsManager, showRegions).createPopupActionGroup(),
        dataContext,
        JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
        true,
        ActionPlaces.STATUS_BAR_PLACE
    )

    companion object {
        internal val tooltipText = message("settings.title")
    }
}

class ChangeAccountSettingsAction(
    private val accountSettingsManager: ProjectAccountSettingsManager,
    private val showRegions: Boolean
) : ComboBoxActionWrapper(), DumbAware {

    fun createPopupActionGroup(): DefaultActionGroup = createPopupActionGroup(null)

    override fun createPopupActionGroup(button: JComponent?): DefaultActionGroup {
        val group = DefaultActionGroup()

        if (showRegions) {
            val usedRegions = accountSettingsManager.recentlyUsedRegions()
            if (usedRegions.isEmpty()) {
                group.addAll(createShowAllRegions())
            } else {
                group.addSeparator(message("settings.regions.recent"))
                usedRegions.forEach {
                    group.add(ChangeRegionAction(it))
                }
                group.add(createShowAllRegions())
            }
        }

        val usedCredentials = accountSettingsManager.recentlyUsedCredentials()
        if (usedCredentials.isEmpty()) {
            group.addSeparator(message("settings.credentials"))
            group.add(createShowAllCredentials(false))
        } else {
            group.addSeparator(message("settings.credentials.recent"))
            usedCredentials.forEach {
                group.add(ChangeCredentialsAction(it))
            }
            group.add(createShowAllCredentials(true))
        }

        return group
    }

    private fun createShowAllRegions(): ActionGroup {
        val regions = AwsRegionProvider.getInstance().regions().values.groupBy { it.category }
        val showAll = DefaultActionGroup(message("settings.regions.region_sub_menu"), true)

        regions.forEach { (category, subRegions) ->
            showAll.addSeparator(category)
            subRegions.forEach {
                showAll.add(ChangeRegionAction(it))
            }
        }

        return showAll
    }

    private fun createShowAllCredentials(popup: Boolean): ActionGroup = object : ComputableActionGroup(
        message("settings.credentials.profile_sub_menu"),
        popup
    ), DumbAware {
            override fun createChildrenProvider(actionManager: ActionManager?): CachedValueProvider<Array<AnAction>> = CachedValueProvider {
                val credentialManager = CredentialManager.getInstance()

                val actions = mutableListOf<AnAction>()
                credentialManager.getCredentialProviders().forEach {
                    actions.add(ChangeCredentialsAction(it))
                }
                actions.add(Separator.create())
                actions.add(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))

                CachedValueProvider.Result.create(actions.toTypedArray(), credentialManager)
            }
    }

    companion object {
        operator fun invoke(project: Project) = ChangeAccountSettingsAction(ProjectAccountSettingsManager.getInstance(project), true)
    }
}

private class ChangeRegionAction(val region: AwsRegion) : ToggleActionWrapper(region.displayName), DumbAware {

    override fun doIsSelected(e: AnActionEvent): Boolean = getAccountSetting(e).activeRegion == region

    override fun doSetSelected(e: AnActionEvent, state: Boolean) {
        if (state) {
            getAccountSetting(e).changeRegion(region)
        }
    }
}

private class ChangeCredentialsAction(val credentialsProvider: ToolkitCredentialsProvider) : ToggleActionWrapper(credentialsProvider.displayName), DumbAware {

    override fun doIsSelected(e: AnActionEvent): Boolean =
        tryOrNull { getAccountSetting(e).activeCredentialProvider == credentialsProvider } ?: false

    override fun doSetSelected(e: AnActionEvent, state: Boolean) {
        if (state) {
            getAccountSetting(e).changeCredentialProvider(credentialsProvider)
        }
    }
}

private fun getAccountSetting(e: AnActionEvent): ProjectAccountSettingsManager =
    ProjectAccountSettingsManager.getInstance(e.getRequiredData(PlatformDataKeys.PROJECT))
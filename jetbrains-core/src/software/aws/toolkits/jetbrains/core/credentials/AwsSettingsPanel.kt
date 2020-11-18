// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import software.aws.toolkits.jetbrains.core.credentials.ChangeAccountSettingsMode.BOTH
import software.aws.toolkits.jetbrains.core.credentials.SettingsSelector.Companion.tooltipText
import software.aws.toolkits.resources.message
import java.awt.Component
import java.awt.event.MouseEvent

private const val ID = "AwsSettingsPanel"

class AwsSettingsPanelInstaller : StatusBarWidgetFactory {
    override fun getId(): String = ID

    override fun getDisplayName(): String = tooltipText

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget = AwsSettingsPanel(project)

    override fun disposeWidget(widget: StatusBarWidget) {
        Disposer.dispose(widget)
    }

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}

private class AwsSettingsPanel(private val project: Project) :
    StatusBarWidget,
    StatusBarWidget.MultipleTextValuesPresentation,
    ConnectionSettingsStateChangeNotifier {
    private val accountSettingsManager = AwsConnectionManager.getInstance(project)
    private val settingsSelector = SettingsSelector(project)
    private lateinit var statusBar: StatusBar

    @Suppress("FunctionName")
    override fun ID(): String = ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation? = this

    override fun getTooltipText() = "${SettingsSelector.tooltipText} [${accountSettingsManager.connectionState.displayMessage}]"

    override fun getSelectedValue() = "AWS: ${accountSettingsManager.connectionState.shortMessage}"

    override fun getPopupStep() = settingsSelector.settingsPopup(statusBar.component)

    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        project.messageBus.connect(this).subscribe(AwsConnectionManager.CONNECTION_SETTINGS_STATE_CHANGED, this)
        updateWidget()
    }

    override fun settingsStateChanged(newState: ConnectionState) {
        updateWidget()
    }

    private fun updateWidget() {
        statusBar.updateWidget(ID())
    }

    override fun dispose() {}
}

class SettingsSelectorAction(private val mode: ChangeAccountSettingsMode = BOTH) : AnAction(message("configure.toolkit")), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)
        val settingsSelector = SettingsSelector(project)
        settingsSelector.settingsPopup(e.dataContext, mode).showCenteredInCurrentWindow(project)
    }
}

class SettingsSelector(private val project: Project) {
    fun settingsPopup(contextComponent: Component, mode: ChangeAccountSettingsMode = BOTH): ListPopup =
        settingsPopup(DataManager.getInstance().getDataContext(contextComponent), mode)

    fun settingsPopup(dataContext: DataContext, mode: ChangeAccountSettingsMode = BOTH): ListPopup =
        JBPopupFactory.getInstance().createActionGroupPopup(
            tooltipText,
            ChangeAccountSettingsActionGroup(project, mode),
            dataContext,
            JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
            true,
            ActionPlaces.STATUS_BAR_PLACE
        )

    companion object {
        internal val tooltipText = message("settings.title")
    }
}

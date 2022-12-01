// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.ide.DataManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent

private const val WIDGET_ID = "AwsSettingsPanel"

class AwsSettingsPanelInstaller : StatusBarWidgetFactory {
    override fun getId(): String = WIDGET_ID

    override fun getDisplayName(): String = message("settings.title")

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
    ConnectionSettingsStateChangeNotifier,
    ToolkitConnectionManagerListener {
    private val settingsSelector = ProjectLevelSettingSelector(project, ChangeSettingsMode.BOTH)
    private val accountSettingsManager = AwsConnectionManager.getInstance(project)
    private val connectionManager = ToolkitConnectionManager.getInstance(project)
    private lateinit var statusBar: StatusBar

    override fun ID(): String = WIDGET_ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getTooltipText() = "${message("settings.title")} [${accountSettingsManager.connectionState.displayMessage}]"

    override fun getSelectedValue(): String {
        val displayText = when (val connection = connectionManager.activeConnection()) {
            null -> message("settings.credentials.none_selected")
            is AwsConnectionManagerConnection -> accountSettingsManager.connectionState.shortMessage
            else -> connection.label
        }

        return "AWS: $displayText"
    }

    override fun getPopupStep(): ListPopup = settingsSelector.createPopup(DataManager.getInstance().getDataContext(statusBar.component))

    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        project.messageBus.connect(this).subscribe(AwsConnectionManager.CONNECTION_SETTINGS_STATE_CHANGED, this)
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(ToolkitConnectionManagerListener.TOPIC, this)
        updateWidget()
    }

    override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
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

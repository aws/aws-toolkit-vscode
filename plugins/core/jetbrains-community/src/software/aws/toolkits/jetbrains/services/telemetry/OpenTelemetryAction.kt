// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.ui.ConsoleView
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.FrameWrapper
import com.intellij.openapi.util.Disposer
import com.intellij.ui.JBColor
import com.intellij.util.ui.components.BorderLayoutPanel
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.jetbrains.isDeveloperMode
import javax.swing.BorderFactory
import javax.swing.JComponent

class OpenTelemetryAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        TelemetryDialog().show()
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = isDeveloperMode()
    }

    private class TelemetryDialog : FrameWrapper(null), TelemetryListener {
        private val consoleView: ConsoleView by lazy {
            TextConsoleBuilderFactory.getInstance().createBuilder(DefaultProjectFactory.getInstance().defaultProject).apply {
                setViewer(true)
            }.console
        }

        init {
            title = "Telemetry Viewer"
            component = createContent()
        }

        private fun createContent(): JComponent {
            val panel = BorderLayoutPanel()
            val consoleComponent = consoleView.component

            val actionGroup = DefaultActionGroup(*consoleView.createConsoleActions())
            val toolbar = ActionManager.getInstance().createActionToolbar("AWS.TelemetryViewer", actionGroup, false)

            toolbar.setTargetComponent(consoleComponent)

            panel.addToLeft(toolbar.component)
            panel.addToCenter(consoleComponent)

            // Add a border to make things look nicer.
            consoleComponent.border = BorderFactory.createLineBorder(JBColor.GRAY)

            val telemetryService = TelemetryService.getInstance()
            telemetryService.addListener(this)
            Disposer.register(this) { telemetryService.removeListener(this) }
            Disposer.register(this, consoleView)

            return panel
        }

        override fun onTelemetryEvent(event: MetricEvent) {
            consoleView.print(event.toString() + "\n", ConsoleViewContentType.NORMAL_OUTPUT)
        }
    }
}

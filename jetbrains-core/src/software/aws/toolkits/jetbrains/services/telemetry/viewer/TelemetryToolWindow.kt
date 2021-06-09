// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry.viewer

import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryListener
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService

class TelemetryToolWindow(project: Project) : SimpleToolWindowPanel(false, true), Disposable, TelemetryListener {
    private val consoleView = TextConsoleBuilderFactory.getInstance().createBuilder(project).apply {
        setViewer(true)
    }.console

    init {
        Disposer.register(this, consoleView)

        setContent(consoleView.component)

        TelemetryService.getInstance().addListener(this)
    }

    override fun onTelemetryEvent(event: MetricEvent) {
        consoleView.print(event.toString() + "\n", ConsoleViewContentType.NORMAL_OUTPUT)
    }

    override fun dispose() {
        TelemetryService.getInstance().removeListener(this)
    }
}

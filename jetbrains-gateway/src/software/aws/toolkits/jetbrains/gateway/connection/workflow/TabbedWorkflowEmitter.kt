// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow

import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.ui.ConsoleView
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.util.Disposer
import com.intellij.terminal.TerminalExecutionConsole
import com.intellij.util.ui.components.BorderLayoutPanel
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.WorkflowEmitter
import software.aws.toolkits.resources.message
import javax.swing.JTabbedPane

class TabbedWorkflowEmitter(private val tabComponent: JTabbedPane, private val disposable: Disposable) : WorkflowEmitter {
    override fun createStepEmitter(): StepEmitter = NoOpEmitter()

    private fun createTabEmitter(tabName: String, hidden: Boolean): StepEmitter {
        if (hidden) return NoOpEmitter()

        val panel = BorderLayoutPanel()
        runInEdt(ModalityState.any()) {
            tabComponent.addTab(tabName, panel)
            tabComponent.selectedIndex = tabComponent.tabCount - 1
        }

        return TabStepEmitter(panel)
    }

    private inner class NoOpEmitter : StepEmitter {
        override fun createChildEmitter(stepName: String, hidden: Boolean): StepEmitter = createTabEmitter(stepName, hidden)
    }

    private inner class TabStepEmitter(val contentPanel: BorderLayoutPanel) : StepEmitter {
        private var content: ConsoleView? = null

        private fun ensureContent(handler: ProcessHandler?): ConsoleView? {
            if (ApplicationManager.getApplication().isUnitTestMode) return null

            // return existing content if it exists, otherwise create an appropriate one for the context
            content?.let { return it }

            // TextConsoleBuilderFactory is nicer but seems to have issues when drawn while not visible
            return TerminalExecutionConsole(DefaultProjectFactory.getInstance().defaultProject, 132, 24, handler)
                .withConvertLfToCrlfForNonPtyProcess(true)
                .also {
                    content = it
                    Disposer.register(disposable, it)
                    runInEdt(ModalityState.any()) {
                        contentPanel.addToCenter(it.component)
                        contentPanel.revalidate()
                        contentPanel.repaint()
                    }
                }
        }

        override fun createChildEmitter(stepName: String, hidden: Boolean): StepEmitter = createTabEmitter(stepName, hidden)

        override fun attachProcess(handler: ProcessHandler) {
            val content = ensureContent(handler)

            runInEdt(ModalityState.any()) {
                content?.attachToProcess(handler)
            }
        }

        private fun doEmitMessage(message: String, contentType: ConsoleViewContentType, shouldEmitToTerminal: Boolean = false) {
            val content = ensureContent(null)
            if (content is TerminalExecutionConsole && !shouldEmitToTerminal) {
                // terminal console output is automatically handled by the process handler
                return
            }

            runInEdt(ModalityState.any()) {
                content?.print(message, contentType)
            }
        }

        override fun emitMessage(message: String, isError: Boolean) {
            val type = if (isError) {
                ConsoleViewContentType.ERROR_OUTPUT
            } else {
                ConsoleViewContentType.NORMAL_OUTPUT
            }

            doEmitMessage(message, type)
        }

        override fun stepSkipped() {
            doEmitMessage(message("gateway.connection.workflow.step_skipped"), ConsoleViewContentType.SYSTEM_OUTPUT, shouldEmitToTerminal = true)
        }

        override fun stepFinishExceptionally(e: Throwable) {
            val errorOutputType = ConsoleViewContentType.ERROR_OUTPUT
            doEmitMessage(message("gateway.connection.workflow.step_failed"), errorOutputType, shouldEmitToTerminal = true)
            doEmitMessage(e.stackTraceToString(), errorOutputType, shouldEmitToTerminal = true)
        }

        override fun stepFinishSuccessfully() {
            doEmitMessage(message("gateway.connection.workflow.step_successful"), ConsoleViewContentType.SYSTEM_OUTPUT, shouldEmitToTerminal = true)
        }
    }
}

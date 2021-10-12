// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.util.ExceptionUtil

class ConsoleViewWorkflowEmitter private constructor(private val workflowTitle: String) : WorkflowEmitter {
    override fun createStepEmitter(): StepEmitter = ConsoleMessageEmitter(workflowTitle)

    override fun workflowStarted() {
        println("Workflow '$workflowTitle' started")
    }

    override fun workflowCompleted() {
        println("Workflow '$workflowTitle' completed")
    }

    override fun workflowFailed(e: Throwable) {
        println("Workflow '$workflowTitle' failed: ${ExceptionUtil.getThrowableText(e)}")
    }

    companion object {
        fun createEmitter(workflowTitle: String) = ConsoleViewWorkflowEmitter(workflowTitle)
    }
}

class ConsoleMessageEmitter(private val stepName: String) : StepEmitter {
    override fun createChildEmitter(stepName: String, hidden: Boolean): StepEmitter = ConsoleMessageEmitter(stepName)

    override fun startStep() {
        println("[$stepName] [Start Event]")
    }

    override fun finishSuccessfully() {
        println("[$stepName] [Finish Event] Success")
    }

    override fun finishExceptionally(e: Throwable) {
        println("[$stepName] [Finished Exceptionally] ${ExceptionUtil.getNonEmptyMessage(e, e.javaClass.simpleName)}")
    }

    override fun emitMessage(message: String, isError: Boolean) {
        println("[$stepName] $message")
    }
}

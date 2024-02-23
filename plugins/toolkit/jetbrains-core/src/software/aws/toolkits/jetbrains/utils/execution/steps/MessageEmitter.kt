// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.execution.process.ProcessHandler

interface WorkflowEmitter {
    fun createStepEmitter(): StepEmitter
    fun workflowStarted() {}
    fun workflowCompleted() {}
    fun workflowFailed(e: Throwable) {}
}

interface StepEmitter {
    fun createChildEmitter(stepName: String, hidden: Boolean): StepEmitter
    fun stepStarted() {}
    fun stepSkipped() {}
    fun stepFinishSuccessfully() {}
    fun stepFinishExceptionally(e: Throwable) {}
    fun emitMessage(message: String, isError: Boolean) {}
    fun emitMessageLine(message: String, isError: Boolean) = emitMessage("$message\n", isError)
    fun attachProcess(handler: ProcessHandler) {}
}

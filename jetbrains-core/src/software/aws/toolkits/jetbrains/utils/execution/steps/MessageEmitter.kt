// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.build.BuildProgressListener
import com.intellij.build.events.impl.FailureResultImpl
import com.intellij.build.events.impl.FinishEventImpl
import com.intellij.build.events.impl.OutputBuildEventImpl
import com.intellij.build.events.impl.StartEventImpl
import com.intellij.build.events.impl.SuccessResultImpl

class MessageEmitter private constructor(
    private val buildListener: BuildProgressListener,
    private val rootObject: Any,
    private val parentId: String,
    private val stepName: String,
    private val hidden: Boolean,
    private val parent: MessageEmitter?
) {
    fun createChild(stepName: String, hidden: Boolean = false): MessageEmitter {
        val (childParent, childStepName) = if (hidden) {
            parentId to this.stepName
        } else {
            this.stepName to stepName
        }
        return MessageEmitter(buildListener, rootObject, childParent, childStepName, hidden, this)
    }

    fun startStep() {
        if (hidden) return
        buildListener.onEvent(
            rootObject,
            StartEventImpl(
                stepName,
                parentId,
                System.currentTimeMillis(),
                stepName
            )
        )
    }

    fun finishSuccessfully() {
        if (hidden) return
        buildListener.onEvent(
            rootObject,
            FinishEventImpl(
                stepName,
                parentId,
                System.currentTimeMillis(),
                stepName,
                SuccessResultImpl()
            )
        )
    }

    fun finishExceptionally(e: Throwable) {
        emitMessage("$stepName finished exceptionally: $e", true)
        if (hidden) return
        buildListener.onEvent(
            rootObject,
            FinishEventImpl(
                stepName,
                parentId,
                System.currentTimeMillis(),
                stepName,
                FailureResultImpl()
            )
        )
    }

    fun emitMessage(message: String, isError: Boolean) {
        parent?.emitMessage(message, isError)
        if (hidden) return
        buildListener.onEvent(
            rootObject,
            OutputBuildEventImpl(
                stepName,
                message,
                !isError
            )
        )
    }

    companion object {
        fun createRoot(buildListener: BuildProgressListener, rootStepName: String, hidden: Boolean = false): MessageEmitter =
            MessageEmitter(buildListener, rootStepName, rootStepName, rootStepName, hidden, null)
    }
}

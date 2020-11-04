// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.build.BuildProgressListener
import com.intellij.build.events.impl.FailureResultImpl
import com.intellij.build.events.impl.FinishEventImpl
import com.intellij.build.events.impl.OutputBuildEventImpl
import com.intellij.build.events.impl.StartEventImpl
import com.intellij.build.events.impl.SuccessResultImpl
import com.intellij.util.ExceptionUtil

interface MessageEmitter {
    fun createChild(stepName: String, hidden: Boolean = false): MessageEmitter
    fun startStep()
    fun finishSuccessfully()
    fun finishExceptionally(e: Throwable)
    fun emitMessage(message: String, isError: Boolean)
}

class DefaultMessageEmitter private constructor(
    private val buildListener: BuildProgressListener,
    private val rootObject: Any,
    private val parentId: String,
    private val stepName: String,
    private val hidden: Boolean,
    private val parent: MessageEmitter?
) : MessageEmitter {
    override fun createChild(stepName: String, hidden: Boolean): MessageEmitter {
        val (childParent, childStepName) = if (hidden) {
            parentId to this.stepName
        } else {
            this.stepName to stepName
        }
        return DefaultMessageEmitter(buildListener, rootObject, childParent, childStepName, hidden, this)
    }

    override fun startStep() {
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

    override fun finishSuccessfully() {
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

    override fun finishExceptionally(e: Throwable) {
        emitMessage("$stepName finished exceptionally: ${ExceptionUtil.getNonEmptyMessage(e, ExceptionUtil.getThrowableText(e))}", true)
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

    override fun emitMessage(message: String, isError: Boolean) {
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
        // TODO: Decouple step name from the build ID
        fun createRoot(buildListener: BuildProgressListener, rootStepName: String): MessageEmitter =
            DefaultMessageEmitter(buildListener, rootStepName, rootStepName, rootStepName, hidden = false, parent = null)
    }
}

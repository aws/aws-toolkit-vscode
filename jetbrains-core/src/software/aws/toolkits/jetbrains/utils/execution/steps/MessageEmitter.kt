// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.build.BuildProgressListener
import com.intellij.build.events.impl.FailureResultImpl
import com.intellij.build.events.impl.FinishEventImpl
import com.intellij.build.events.impl.OutputBuildEventImpl
import com.intellij.build.events.impl.SkippedResultImpl
import com.intellij.build.events.impl.StartEventImpl
import com.intellij.build.events.impl.SuccessResultImpl
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.util.ExceptionUtil
import com.intellij.util.containers.ContainerUtil
import software.aws.toolkits.resources.message

interface MessageEmitter {
    fun createChild(stepName: String, hidden: Boolean = false): MessageEmitter
    fun startStep()
    fun finishSuccessfully()
    fun finishExceptionally(e: Throwable)
    fun addListener(listener: BuildProgressListener)
    fun emitMessage(message: String, isError: Boolean)
}

class DefaultMessageEmitter private constructor(
    private val buildListeners: MutableList<BuildProgressListener>,
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
        return DefaultMessageEmitter(buildListeners, rootObject, childParent, childStepName, hidden, this)
    }

    override fun startStep() {
        if (hidden) return
        buildListeners.forEach {
            it.onEvent(
                rootObject,
                StartEventImpl(
                    stepName,
                    parentId,
                    System.currentTimeMillis(),
                    stepName
                )
            )
        }
    }

    override fun addListener(listener: BuildProgressListener) {
        buildListeners.add(listener)
    }

    override fun finishSuccessfully() {
        if (hidden) return
        buildListeners.forEach {
            it.onEvent(
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
    }

    override fun finishExceptionally(e: Throwable) {
        if (e is ProcessCanceledException) {
            emitMessage(message("general.step.canceled", stepName), true)
        } else {
            emitMessage(message("general.step.failed", stepName, ExceptionUtil.getNonEmptyMessage(e, ExceptionUtil.getThrowableText(e))), true)
        }
        if (hidden) return
        buildListeners.forEach {
            it.onEvent(
                rootObject,
                FinishEventImpl(
                    stepName,
                    parentId,
                    System.currentTimeMillis(),
                    stepName,
                    if (e is ProcessCanceledException) SkippedResultImpl() else FailureResultImpl()
                )
            )
        }
    }

    override fun emitMessage(message: String, isError: Boolean) {
        parent?.emitMessage(message, isError)
        if (hidden) return
        buildListeners.forEach {
            it.onEvent(
                rootObject,
                OutputBuildEventImpl(
                    stepName,
                    message,
                    !isError
                )
            )
        }
    }

    companion object {
        // TODO: Decouple step name from the build ID
        fun createRoot(buildListeners: List<BuildProgressListener>, rootStepName: String): MessageEmitter = DefaultMessageEmitter(
            ContainerUtil.createLockFreeCopyOnWriteList<BuildProgressListener>().also { it.addAll(buildListeners) },
            rootStepName,
            rootStepName,
            rootStepName,
            hidden = false,
            parent = null
        )

        fun createRoot(buildListener: BuildProgressListener, rootStepName: String): MessageEmitter =
            DefaultMessageEmitter(
                ContainerUtil.createLockFreeCopyOnWriteList<BuildProgressListener>().also { it.add(buildListener) },
                rootStepName,
                rootStepName,
                rootStepName,
                hidden = false,
                parent = null
            )
    }
}

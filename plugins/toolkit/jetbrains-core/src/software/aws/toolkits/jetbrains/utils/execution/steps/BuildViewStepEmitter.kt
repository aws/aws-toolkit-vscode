// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.build.BuildProgressListener
import com.intellij.build.BuildViewManager
import com.intellij.build.DefaultBuildDescriptor
import com.intellij.build.events.impl.FailureResultImpl
import com.intellij.build.events.impl.FinishBuildEventImpl
import com.intellij.build.events.impl.FinishEventImpl
import com.intellij.build.events.impl.OutputBuildEventImpl
import com.intellij.build.events.impl.SkippedResultImpl
import com.intellij.build.events.impl.StartBuildEventImpl
import com.intellij.build.events.impl.StartEventImpl
import com.intellij.build.events.impl.SuccessResultImpl
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.util.ExceptionUtil
import software.aws.toolkits.resources.message

class BuildViewWorkflowEmitter private constructor(
    private val buildListener: BuildProgressListener,
    private val workflowTitle: String,
    private val workflowId: String
) : WorkflowEmitter {
    override fun createStepEmitter(): StepEmitter = BuildViewStepEmitter.createRoot(buildListener, workflowId)

    override fun workflowStarted() {
        val descriptor = DefaultBuildDescriptor(
            workflowId,
            workflowTitle,
            "/unused/working/directory",
            System.currentTimeMillis()
        ).apply {
            isActivateToolWindowWhenAdded = true
            withProcessHandler(processHandler, null)
        }

        buildListener.onEvent(workflowId, StartBuildEventImpl(descriptor, message("general.execution.running")))
    }

    override fun workflowFailed(e: Throwable) {
        val message = if (e is ProcessCanceledException) {
            message("general.execution.canceled")
        } else {
            message("general.execution.failed")
        }

        buildListener.onEvent(
            workflowId,
            FinishBuildEventImpl(
                workflowId,
                null,
                System.currentTimeMillis(),
                message,
                if (e is ProcessCanceledException) SkippedResultImpl() else FailureResultImpl()
            )
        )
    }

    override fun workflowCompleted() {
        buildListener.onEvent(
            workflowId,
            FinishBuildEventImpl(
                workflowId,
                null,
                System.currentTimeMillis(),
                message("general.execution.success"),
                SuccessResultImpl()
            )
        )
    }

    companion object {
        fun createEmitter(buildListener: BuildProgressListener, workflowTitle: String, workflowId: String) =
            BuildViewWorkflowEmitter(buildListener, workflowTitle, workflowId)

        fun createEmitter(project: Project, workflowTitle: String, workflowId: String) =
            BuildViewWorkflowEmitter(project.service<BuildViewManager>(), workflowTitle, workflowId)
    }
}

class BuildViewStepEmitter private constructor(
    private val buildListener: BuildProgressListener,
    private val rootObject: Any,
    private val parentId: String,
    private val stepName: String,
    private val hidden: Boolean,
    private val parent: StepEmitter?
) : StepEmitter {
    override fun createChildEmitter(stepName: String, hidden: Boolean): StepEmitter {
        val (childParent, childStepName) = if (hidden) {
            parentId to this.stepName
        } else {
            this.stepName to stepName
        }
        return BuildViewStepEmitter(buildListener, rootObject, childParent, childStepName, hidden, this)
    }

    override fun stepStarted() {
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

    override fun stepSkipped() {
        if (hidden) return

        buildListener.onEvent(
            rootObject,
            FinishEventImpl(
                stepName,
                parentId,
                System.currentTimeMillis(),
                stepName,
                SkippedResultImpl()
            )
        )
    }

    override fun stepFinishSuccessfully() {
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

    override fun stepFinishExceptionally(e: Throwable) {
        if (e is ProcessCanceledException) {
            emitMessage(message("general.step.canceled", stepName), true)
        } else {
            emitMessage(
                message(
                    "general.step.failed",
                    stepName,
                    ExceptionUtil.getNonEmptyMessage(e, ExceptionUtil.getThrowableText(e))
                ),
                true
            )
        }
        if (hidden) return

        buildListener.onEvent(
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
        fun createRoot(buildListener: BuildProgressListener, rootStepName: String): StepEmitter =
            BuildViewStepEmitter(
                buildListener,
                rootStepName,
                rootStepName,
                rootStepName,
                hidden = false,
                parent = null
            )
    }
}

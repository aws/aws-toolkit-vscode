// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.explorer.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.jetbrains.services.amazonq.isQSupportedInThisVersion
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.CodeModernizerUIConstants
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.CodeWhispererActionNode
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformStartSrcComponents
import software.aws.toolkits.telemetry.UiTelemetry
import java.awt.event.MouseEvent

const val RUN_NODE_INDEX = 5
class CodeModernizerRunModernizeNode(private val nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codemodernizer.explorer.start_migration_job"),
    RUN_NODE_INDEX,
    CodeModernizerManager.getInstance(nodeProject).getRunActionButtonIcon()
) {
    private val codeModernizerManager = CodeModernizerManager.getInstance(project)

    override fun onDoubleClick(event: MouseEvent) {
        if (isRunningOnRemoteBackend() || !isQSupportedInThisVersion()) return
        if (!codeModernizerManager.isModernizationJobActive()) {
            codeModernizerManager.validateAndStart(CodeTransformStartSrcComponents.DevToolsStartButton)
        } else {
            codeModernizerManager.stopModernize()
        }
        UiTelemetry.click(nodeProject, "amazonq_transform")
    }

    override fun update(presentation: PresentationData) {
        super.update(presentation)

        if (isRunningOnRemoteBackend()) {
            presentation.addText(message("codewhisperer.explorer.root_node.unavailable"), SimpleTextAttributes.GRAY_ATTRIBUTES)
        } else if (!isQSupportedInThisVersion()) {
            presentation.addText(message("q.unavailable"), SimpleTextAttributes.GRAY_ATTRIBUTES)
        }

        val transformationStatus = when (CodeModernizerSessionState.getInstance(project).currentJobStatus) {
            TransformationStatus.CREATED -> message("codemodernizer.manager.job_status.created")
            TransformationStatus.ACCEPTED -> message("codemodernizer.manager.job_status.accepted")
            TransformationStatus.REJECTED -> message("codemodernizer.manager.job_status.rejected")
            TransformationStatus.STARTED -> message("codemodernizer.manager.job_status.started")
            TransformationStatus.PREPARING -> message("codemodernizer.manager.job_status.preparing")
            TransformationStatus.PREPARED -> message("codemodernizer.manager.job_status.prepared")
            TransformationStatus.PLANNING -> message("codemodernizer.manager.job_status.planning")
            TransformationStatus.PLANNED -> message("codemodernizer.manager.job_status.planned")
            TransformationStatus.TRANSFORMING -> message("codemodernizer.manager.job_status.transforming")
            TransformationStatus.TRANSFORMED -> message("codemodernizer.manager.job_status.transformed")
            TransformationStatus.FAILED -> message("codemodernizer.manager.job_status.failed")
            TransformationStatus.COMPLETED -> message("codemodernizer.manager.job_status.completed")
            TransformationStatus.STOPPING -> message("codemodernizer.manager.job_status.stopping")
            TransformationStatus.STOPPED -> message("codemodernizer.manager.job_status.stopped")
            TransformationStatus.PARTIALLY_COMPLETED -> message("codemodernizer.manager.job_status.partially_completed")
            else -> return
        }
        presentation.addText(CodeModernizerUIConstants.SINGLE_SPACE_STRING + transformationStatus, SimpleTextAttributes.GRAY_ATTRIBUTES)
    }
}

// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.cloudcontrol.model.Operation
import software.amazon.awssdk.services.cloudcontrol.model.OperationStatus
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.dynamic.explorer.OpenResourceModelSourceAction

class CreateResourceFileStatusHandler(private val project: Project) : DynamicResourceStateMutationHandler {
    private val resourceCreationProgressTracker: MutableMap<String, VirtualFile> = mutableMapOf()

    init {
        project.messageBus.connect(project).subscribe(DynamicResourceUpdateManager.DYNAMIC_RESOURCE_STATE_CHANGED, this)
    }

    fun recordResourceBeingCreated(token: String, file: VirtualFile) {
        resourceCreationProgressTracker[token] = file
    }

    override fun mutationStatusChanged(state: ResourceMutationState) {
        if (state.operation == Operation.CREATE && state.status == OperationStatus.SUCCESS && state.resourceIdentifier != null) {
            runInEdt {
                resourceCreationProgressTracker[state.token]?.let { FileEditorManager.getInstance(project).closeFile(it) }
                resourceCreationProgressTracker.remove(state.token)
            }

            val dynamicResourceIdentifier = DynamicResourceIdentifier(state.connectionSettings, state.resourceType, state.resourceIdentifier)
            val model = OpenViewEditableDynamicResourceVirtualFile.getResourceModel(
                project,
                state.connectionSettings.awsClient(),
                state.resourceType,
                state.resourceIdentifier
            ) ?: return
            val file = ViewEditableDynamicResourceVirtualFile(
                dynamicResourceIdentifier,
                model
            )
            OpenViewEditableDynamicResourceVirtualFile.openFile(project, file, OpenResourceModelSourceAction.READ, state.resourceType)
        }
    }

    @TestOnly
    fun getNumberOfResourcesBeingCreated(): Int = resourceCreationProgressTracker.size

    companion object {
        fun getInstance(project: Project) = project.service<CreateResourceFileStatusHandler>()
    }
}

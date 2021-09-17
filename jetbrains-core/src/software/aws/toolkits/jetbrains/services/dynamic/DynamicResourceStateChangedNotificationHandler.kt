// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.cloudcontrol.model.OperationStatus
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.explorer.ExplorerToolWindow
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.util.concurrent.atomic.AtomicBoolean

class DynamicResourceStateChangedNotificationHandler(private val project: Project) : DynamicResourceStateMutationHandler {
    private val refreshRequired = AtomicBoolean(false)
    override fun mutationStatusChanged(state: ResourceMutationState) {
        if (state.status == OperationStatus.SUCCESS) {
            notifyInfo(
                message(
                    "dynamic_resources.operation_status_notification_title",
                    state.resourceIdentifier ?: "",
                    state.operation.name.toLowerCase()
                ),
                message(
                    "dynamic_resources.operation_status_success",
                    state.resourceIdentifier ?: "",
                    state.operation.name.toLowerCase()
                ),
                project
            )
        } else if (state.status == OperationStatus.FAILED) {
            notifyError(
                message(
                    "dynamic_resources.operation_status_notification_title",
                    state.resourceIdentifier ?: "",
                    state.operation.name.toLowerCase()
                ),
                message(
                    "dynamic_resources.operation_status_failed",
                    state.resourceIdentifier ?: "",
                    state.operation.name.toLowerCase(),
                    state.message ?: ""
                ),
                project
            )
        }
        AwsResourceCache.getInstance().clear(DynamicResources.listResources(state.resourceType), state.connectionSettings)
        refreshRequired.set(true)
    }

    override fun statusCheckComplete() {
        runInEdt {
            if (refreshRequired.getAndSet(false)) {
                ExplorerToolWindow.getInstance(project).invalidateTree()
            }
        }
    }
}

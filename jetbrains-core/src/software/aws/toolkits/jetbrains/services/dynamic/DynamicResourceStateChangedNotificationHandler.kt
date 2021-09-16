// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.cloudformation.model.OperationStatus
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class DynamicResourceStateChangedNotificationHandler(private val project: Project) : DynamicResourceStateMutationHandler {

    override fun resourceStateChanged(
        dynamicResourceIdentifier: DynamicResourceIdentifier,
        dynamicResourceMutationState: DynamicResourceMutationState,
        message: String?
    ) {
        if (dynamicResourceMutationState.operationStatus == OperationStatus.SUCCESS) {
            notifyInfo(
                message(
                    "dynamic_resources.operation_status_notification_title",
                    dynamicResourceIdentifier.resourceIdentifier,
                    dynamicResourceMutationState.operation.name.toLowerCase()
                ),
                message(
                    "dynamic_resources.operation_status_success",
                    dynamicResourceIdentifier.resourceIdentifier,
                    dynamicResourceMutationState.operation.name.toLowerCase()
                ),
                project
            )
        } else if (dynamicResourceMutationState.operationStatus == OperationStatus.FAILED) {
            notifyError(
                message(
                    "dynamic_resources.operation_status_notification_title",
                    dynamicResourceIdentifier.resourceIdentifier,
                    dynamicResourceMutationState.operation.name.toLowerCase()
                ),
                message(
                    "dynamic_resources.operation_status_failed",
                    dynamicResourceIdentifier.resourceIdentifier,
                    dynamicResourceMutationState.operation.name.toLowerCase(),
                    message ?: ""
                ),
                project
            )
        }
    }

    override fun statusCheckComplete() {
        project.refreshAwsTree()
    }
}

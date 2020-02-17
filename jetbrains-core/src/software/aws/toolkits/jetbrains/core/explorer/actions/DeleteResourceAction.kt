// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.utils.Operation
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.warnResourceOperationAgainstCodePipeline
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.ServiceType

abstract class DeleteResourceAction<in T : AwsExplorerResourceNode<*>>(text: String, private val taggingResourceType: TaggingResourceType) :
    SingleResourceNodeAction<T>(text, icon = AllIcons.Actions.Cancel), DumbAware {
    final override fun actionPerformed(selected: T, e: AnActionEvent) {
        warnResourceOperationAgainstCodePipeline(selected.nodeProject, selected.displayName(), selected.resourceArn(), taggingResourceType, Operation.DELETE) {
            val resourceType = selected.resourceType()
            val resourceName = selected.displayName()

            val response = Messages.showInputDialog(selected.project,
                message("delete_resource.message", resourceType, resourceName),
                message("delete_resource.title", resourceType, resourceName),
                Messages.getWarningIcon(),
                null,
                object : InputValidator {
                    override fun checkInput(inputString: String?): Boolean = inputString == resourceName

                    override fun canClose(inputString: String?): Boolean = checkInput(inputString)
                }
            )

            if (response == null) {
                AwsTelemetry.deleteResource(selected.project, ServiceType.from(selected.serviceId), Result.CANCELLED)
            } else {
                ApplicationManager.getApplication().executeOnPooledThread {
                    try {
                        performDelete(selected)
                        notifyInfo(message("delete_resource.deleted", resourceType, resourceName))
                        AwsTelemetry.deleteResource(selected.project, ServiceType.from(selected.serviceId), success = true)
                    } catch (e: Exception) {
                        e.notifyError(message("delete_resource.delete_failed", resourceType, resourceName), selected.project)
                        AwsTelemetry.deleteResource(selected.project, ServiceType.from(selected.serviceId), success = false)
                    }
                }
            }
        }
    }

    abstract fun performDelete(selected: T)
}

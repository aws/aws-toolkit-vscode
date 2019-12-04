// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import software.amazon.awssdk.awscore.exception.AwsServiceException
import software.aws.toolkits.resources.message

/**
 * Used to represent an error loading a node, such as an AccessDenied when loading resources
 */
class AwsExplorerErrorNode(project: Project, exception: Throwable) :
    AwsExplorerNode<Throwable>(project, exception, null) {

    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()

    override fun update(presentation: PresentationData) {
        presentation.apply {
            // If we don't have a message, at least give them the error type
            tooltip = value.message ?: value.javaClass.simpleName

            val exception = value
            val errorDetails = if (exception is AwsServiceException) {
                val awsErrorDetails = exception.awsErrorDetails()
                "${awsErrorDetails.serviceName()}: ${awsErrorDetails.errorCode()}"
            } else {
                message("explorer.error_loading_resources_default_details")
            }

            addText(
                nodeText(errorDetails),
                SimpleTextAttributes.ERROR_ATTRIBUTES
            )
        }
    }

    override fun isAlwaysLeaf() = true

    private companion object {
        fun nodeText(details: String): String = message("explorer.error_loading_resources", details)
    }
}

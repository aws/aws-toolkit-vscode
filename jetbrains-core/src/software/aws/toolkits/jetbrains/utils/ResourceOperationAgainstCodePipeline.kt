// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.showYesNoDialog
import software.amazon.awssdk.services.resourcegroupstaggingapi.ResourceGroupsTaggingApiClient
import software.amazon.awssdk.services.resourcegroupstaggingapi.model.GetResourcesRequest
import software.amazon.awssdk.services.resourcegroupstaggingapi.model.TagFilter
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.resources.message

const val CODEPIPELINE_SYSTEM_TAG_KEY = "aws:codepipeline:pipelineArn"

/**
 * @property tagFilter used by ResourceGroupsTaggingApi to filter response by ResourceType (resourceTypeFilter)
 */
enum class TaggingResourceType(val value: String, val tagFilter: String) {
    LAMBDA_FUNCTION(message("codepipeline.lambda.resource_type"), "lambda:function"),
    CLOUDFORMATION_STACK(message("codepipeline.stack.resource_type"), "cloudformation:stack"),
    S3_BUCKET(message("codepipeline.bucket.resource_type"), "s3");

    override fun toString() = value
}

enum class Operation(val value: String) {
    UPDATE(message("codepipeline.resource.operation.update")),
    DELETE(message("codepipeline.resource.operation.delete")),
    DEPLOY(message("codepipeline.resource.operation.deploy"));

    override fun toString() = value
}

/**
 * Warn user against this operation if the resource is part of an AWS CodePipeline.
 * Run callback only if user chooses to continue with this operation from the warning dialog.
 * (Run network call off UI thread and callback on UI thread)
 */
fun warnResourceOperationAgainstCodePipeline(
    project: Project,
    resourceName: String,
    resourceArn: String,
    resourceType: TaggingResourceType,
    operation: Operation,
    callback: () -> Unit
) {
    ApplicationManager.getApplication().executeOnPooledThread {
        val codePipelineArn = getCodePipelineArnForResource(project, resourceArn, resourceType.tagFilter)

        runInEdt {
            var shouldCallbackRun = true
            if (codePipelineArn != null) {
                val title = message("codepipeline.resource.update.warning.title")
                val message = message("codepipeline.resource.update.warning.message", resourceType, resourceName, codePipelineArn, operation)
                val noText = message("codepipeline.resource.update.warning.no_text")
                val yesText = message("codepipeline.resource.update.warning.yes_text")
                shouldCallbackRun = !showYesNoDialog(title, message, project, noText, yesText, Messages.getWarningIcon())
            }
            if (shouldCallbackRun) {
                callback()
            }
        }
    }
}

fun getCodePipelineArnForResource(project: Project, resourceArn: String, resourceTypeFilter: String): String? {
    val client: ResourceGroupsTaggingApiClient = project.awsClient()

    val tagFilter = TagFilter.builder().key(CODEPIPELINE_SYSTEM_TAG_KEY).build()
    val request = GetResourcesRequest.builder().tagFilters(tagFilter).resourceTypeFilters(resourceTypeFilter).build()

    return tryOrNull {
        client.getResourcesPaginator(request).resourceTagMappingList().filterNotNull()
            .filter { it.resourceARN() == resourceArn }
            .mapNotNull { it.tags().filterNotNull().find { it.key() == CODEPIPELINE_SYSTEM_TAG_KEY }?.value() }
            .firstOrNull()
    }
}

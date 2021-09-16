// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import com.intellij.util.messages.Topic
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.Operation
import software.amazon.awssdk.services.cloudformation.model.OperationStatus
import software.amazon.awssdk.services.cloudformation.model.ProgressEvent
import software.aws.toolkits.jetbrains.core.applicationThreadPoolScope
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.core.credentials.getClient
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.util.concurrent.ConcurrentLinkedQueue

internal class DynamicResourceUpdateManager(private val project: Project) {
    // TODO: Make DynamicResourceUpdateManager an application-level service

    private val pendingMutations = ConcurrentLinkedQueue<ResourceMutationState>()
    private val coroutineScope = project.applicationThreadPoolScope("DynamicResourceUpdateManager")
    private val alarm: Alarm =
        AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, project)

    fun deleteResource(dynamicResourceIdentifier: DynamicResourceIdentifier) {
        coroutineScope.launch {
            try {
                val client = dynamicResourceIdentifier.connectionSettings.getClient<CloudFormationClient>()
                val progress = client.deleteResource {
                    it.typeName(dynamicResourceIdentifier.resourceType)
                    it.identifier(dynamicResourceIdentifier.resourceIdentifier)
                }.progressEvent()
                startCheckingProgress(dynamicResourceIdentifier.connectionSettings, progress)
            } catch (e: Exception) {
                e.notifyError(
                    message(
                        "dynamic_resources.operation_status_notification_title",
                        dynamicResourceIdentifier.resourceIdentifier,
                        message("general.delete").toLowerCase()
                    ),
                    project
                )
            }
        }
    }

    fun updateResource(dynamicResourceIdentifier: DynamicResourceIdentifier) {
        TODO("Not yet implemented")
    }

    fun createResource(connectionSettings: ConnectionSettings, dynamicResourceType: String, desiredState: String) {
        coroutineScope.launch {
            try {
                val client = connectionSettings.getClient<CloudFormationClient>()
                val progress = client.createResource {
                    it.typeName(dynamicResourceType)
                    it.desiredState(desiredState)
                }.progressEvent()
                startCheckingProgress(connectionSettings, progress)
            } catch (e: Exception) {
                e.notifyError(
                    message("dynamic_resources.operation_status_notification_title", dynamicResourceType, message("dynamic_resources.create")),
                    project
                )
            }
        }
    }

    private fun startCheckingProgress(connectionSettings: ConnectionSettings, progress: ProgressEvent) {
        pendingMutations.add(ResourceMutationState.fromEvent(connectionSettings, progress))
        if (pendingMutations.size == 1) {
            alarm.addRequest({ getProgress() }, 0)
        }
    }

    fun getUpdateStatus(dynamicResourceIdentifier: DynamicResourceIdentifier): ResourceMutationState? =
        pendingMutations.find {
            it.connectionSettings == dynamicResourceIdentifier.connectionSettings &&
                it.resourceType == dynamicResourceIdentifier.resourceType &&
                it.resourceIdentifier == dynamicResourceIdentifier.resourceIdentifier
        }

    private fun getProgress() {
        var size = pendingMutations.size

        while (size > 0) {
            val mutation = pendingMutations.remove()
            if (!mutation.status.isTerminal()) {
                val client = mutation.connectionSettings.getClient<CloudFormationClient>()
                val progress = try {
                    client.getResourceRequestStatus { it.requestToken(mutation.token) }
                } catch (e: Exception) {
                    e.notifyError(
                        message(
                            "dynamic_resources.operation_status_notification_title",
                            mutation.resourceIdentifier ?: mutation.resourceType,
                            mutation.operation.name.toLowerCase()
                        ),
                        project
                    )
                    null
                }
                val updatedMutation = when (val event = progress?.progressEvent()) {
                    is ProgressEvent -> mutation.copy(status = event.operationStatus(), resourceIdentifier = event.identifier())
                    else -> mutation
                }
                if (updatedMutation != mutation) {
                    project.messageBus.syncPublisher(DYNAMIC_RESOURCE_STATE_CHANGED).mutationStatusChanged(updatedMutation)
                }
                pendingMutations.add(updatedMutation)
            }
            size--
        }
        project.messageBus.syncPublisher(DYNAMIC_RESOURCE_STATE_CHANGED).statusCheckComplete()

        if (pendingMutations.size != 0) {
            alarm.addRequest({ getProgress() }, DEFAULT_DELAY)
        }
    }

    companion object {
        private const val DEFAULT_DELAY = 500
        val DYNAMIC_RESOURCE_STATE_CHANGED: Topic<DynamicResourceStateMutationHandler> = Topic.create(
            "Resource State Changed",
            DynamicResourceStateMutationHandler::class.java
        )

        fun OperationStatus.isTerminal() = this in setOf(OperationStatus.SUCCESS, OperationStatus.CANCEL_COMPLETE, OperationStatus.FAILED)

        fun getInstance(project: Project): DynamicResourceUpdateManager = project.service()
    }
}

interface DynamicResourceStateMutationHandler {
    fun mutationStatusChanged(state: ResourceMutationState)
    fun statusCheckComplete() {}
}

data class DynamicResourceIdentifier(val connectionSettings: ConnectionSettings, val resourceType: String, val resourceIdentifier: String)

data class ResourceMutationState(
    val connectionSettings: ConnectionSettings,
    val token: String,
    val operation: Operation,
    val resourceType: String,
    val status: OperationStatus,
    val resourceIdentifier: String?,
    val message: String?
) {
    companion object {
        fun fromEvent(connectionSettings: ConnectionSettings, progress: ProgressEvent) =
            ResourceMutationState(
                connectionSettings = connectionSettings,
                token = progress.requestToken(),
                operation = progress.operation(),
                resourceType = progress.typeName(),
                status = progress.operationStatus(),
                resourceIdentifier = progress.identifier(),
                message = progress.statusMessage()
            )
    }
}

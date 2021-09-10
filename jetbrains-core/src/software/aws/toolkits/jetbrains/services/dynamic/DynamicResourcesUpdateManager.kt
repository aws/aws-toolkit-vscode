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
import software.aws.toolkits.telemetry.DynamicresourceTelemetry
import software.aws.toolkits.telemetry.Result
import java.util.concurrent.ConcurrentHashMap

internal class DynamicResourceUpdateManager(private val project: Project) {
    // TODO: Make DynamicResourceUpdateManager an application-level service

    private val resourceStateMonitor = ConcurrentHashMap<DynamicResourceIdentifier, ResourceStateTracker>()
    private val coroutineScope = project.applicationThreadPoolScope("DynamicResourceUpdateManager")
    private val alarm: Alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, project)

    fun deleteResource(dynamicResourceIdentifier: DynamicResourceIdentifier) {
        coroutineScope.launch {
            try {
                val client = dynamicResourceIdentifier.connectionSettings.getClient<CloudFormationClient>()
                val progress = client.deleteResource {
                    it.typeName(dynamicResourceIdentifier.resourceType)
                    it.identifier(dynamicResourceIdentifier.resourceIdentifier)
                }.progressEvent()
                setInitialResourceState(dynamicResourceIdentifier, progress)
            } catch (e: Exception) {
                e.notifyError(
                    message(
                        "dynamic_resources.operation_status_notification_title",
                        dynamicResourceIdentifier.resourceIdentifier,
                        message("general.delete").toLowerCase()
                    ),
                    project
                )
                addDynamicResourcesTelemetry(Operation.DELETE, dynamicResourceIdentifier.resourceType, Result.Failed)
            }
        }
    }

    fun updateResource(dynamicResourceIdentifier: DynamicResourceIdentifier) {
        TODO("Not yet implemented")
    }

    fun createResource(dynamicResourceIdentifier: DynamicResourceIdentifier, desiredState: String) {
        TODO("Not yet implemented")
    }

    fun getUpdateStatus(connectionSettings: ConnectionSettings, resourceType: String, resourceIdentifier: String): DynamicResourceMutationState? =
        resourceStateMonitor[DynamicResourceIdentifier(connectionSettings, resourceType, resourceIdentifier)]?.op

    private fun setInitialResourceState(dynamicResourceIdentifier: DynamicResourceIdentifier, progress: ProgressEvent) {
        val initialState = DynamicResourceMutationState(progress.operation(), progress.operationStatus())
        resourceStateMonitor[dynamicResourceIdentifier] = ResourceStateTracker(progress.requestToken(), initialState)
        project.messageBus.syncPublisher(DYNAMIC_RESOURCE_STATE_CHANGED).statusCheckComplete()
        if (resourceStateMonitor.size == 1) {
            getProgress()
        }
    }

    private fun updateResourceState(
        resourceIdentifier: DynamicResourceIdentifier,
        currentResourceState: ResourceStateTracker,
        newState: DynamicResourceMutationState,
        message: String?
    ) {
        resourceStateMonitor[resourceIdentifier] = currentResourceState.copy(op = newState)
        informResourceStateChangeListener(resourceIdentifier, newState, message)
    }

    private fun informResourceStateChangeListener(
        dynamicResourceIdentifier: DynamicResourceIdentifier,
        newState: DynamicResourceMutationState,
        message: String?
    ) {
        project.messageBus.syncPublisher(DYNAMIC_RESOURCE_STATE_CHANGED)
            .resourceStateChanged(
                dynamicResourceIdentifier,
                newState,
                message
            )
    }

    private fun getProgress() {
        var hasResourceStateChanged = false
        resourceStateMonitor.map { (resourceStateIdentifier, resourceStateTracker) ->

            val client = resourceStateIdentifier.connectionSettings.getClient<CloudFormationClient>()
            val progress = try {
                client.getResourceRequestStatus { it.requestToken(resourceStateTracker.token) }
            } catch (e: Exception) {
                e.notifyError(
                    message(
                        "dynamic_resources.operation_status_notification_title",
                        resourceStateIdentifier.resourceIdentifier,
                        resourceStateTracker.op.operation.name.toLowerCase()
                    ),
                    project
                )
                addDynamicResourcesTelemetry(resourceStateTracker.op.operation, resourceStateIdentifier.resourceType, Result.Failed)
                null
            }
            if (progress != null) {
                val operationStatus = progress.progressEvent().operationStatus()
                val operation = progress.progressEvent().operation()
                val newResourceState = DynamicResourceMutationState(operation, operationStatus)
                if (operationStatus == OperationStatus.IN_PROGRESS && resourceStateTracker.op.operationStatus != newResourceState.operationStatus) {
                    // This condition is required for when the status switches from PENDING to IN_PROGRESS (currently API doesn't surface PENDING status)
                    updateResourceState(resourceStateIdentifier, resourceStateTracker, newResourceState, progress.progressEvent().statusMessage())
                    hasResourceStateChanged = true
                } else if (operationStatus == OperationStatus.SUCCESS || operationStatus == OperationStatus.FAILED) {
                    updateResourceState(resourceStateIdentifier, resourceStateTracker, newResourceState, progress.progressEvent().statusMessage())
                    resourceStateMonitor.remove(resourceStateIdentifier)
                    hasResourceStateChanged = true
                }
            }
            if (hasResourceStateChanged) {
                project.messageBus.syncPublisher(DYNAMIC_RESOURCE_STATE_CHANGED).statusCheckComplete()
            }
            if (!resourceStateMonitor.isEmpty()) {
                alarm.addRequest({ getProgress() }, 500)
            }
        }
    }

    fun addDynamicResourcesTelemetry(
        operation: Operation,
        resourceType: String,
        successState: Result
    ) {
        when (operation) {
            Operation.CREATE -> DynamicresourceTelemetry.createResource(project, successState, resourceType)
            Operation.UPDATE -> DynamicresourceTelemetry.updateResource(project, successState, resourceType)
            Operation.DELETE -> DynamicresourceTelemetry.deleteResource(project, successState, resourceType)
        }
    }

    companion object {
        val DYNAMIC_RESOURCE_STATE_CHANGED: Topic<DynamicResourceStateMutationHandler> = Topic.create(
            "Resource State Changed",
            DynamicResourceStateMutationHandler::class.java
        )

        fun getInstance(project: Project): DynamicResourceUpdateManager = project.service()
    }
}

interface DynamicResourceStateMutationHandler {
    fun resourceStateChanged(
        dynamicResourceIdentifier: DynamicResourceIdentifier,
        dynamicResourceMutationState: DynamicResourceMutationState,
        message: String?
    )

    fun statusCheckComplete()
}

data class DynamicResourceIdentifier(val connectionSettings: ConnectionSettings, val resourceType: String, val resourceIdentifier: String)

data class DynamicResourceMutationState(val operation: Operation, val operationStatus: OperationStatus)

private data class ResourceStateTracker(val token: String, val op: DynamicResourceMutationState)

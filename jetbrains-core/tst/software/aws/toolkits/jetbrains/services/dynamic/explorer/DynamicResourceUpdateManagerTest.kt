// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.cloudcontrol.CloudControlClient
import software.amazon.awssdk.services.cloudcontrol.model.DeleteResourceRequest
import software.amazon.awssdk.services.cloudcontrol.model.DeleteResourceResponse
import software.amazon.awssdk.services.cloudcontrol.model.GetResourceRequestStatusRequest
import software.amazon.awssdk.services.cloudcontrol.model.GetResourceRequestStatusResponse
import software.amazon.awssdk.services.cloudcontrol.model.Operation
import software.amazon.awssdk.services.cloudcontrol.model.OperationStatus
import software.amazon.awssdk.services.cloudcontrol.model.ProgressEvent
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResource
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceIdentifier
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceStateMutationHandler
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager
import software.aws.toolkits.jetbrains.services.dynamic.ResourceMutationState
import software.aws.toolkits.jetbrains.services.dynamic.ResourceType
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class DynamicResourceUpdateManagerTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    private lateinit var cloudFormationClient: CloudControlClient
    private lateinit var dynamicResourceUpdateManager: DynamicResourceUpdateManager
    private lateinit var connectionSettings: ConnectionSettings
    private val resource = DynamicResource(ResourceType("AWS::SampleService::Type", "SampleService", "Type"), "sampleIdentifier")

    @Before
    fun setup() {
        connectionSettings = ConnectionSettings(aToolkitCredentialsProvider(), anAwsRegion())
        cloudFormationClient = mockClientManager.create(connectionSettings.region, connectionSettings.credentials)
    }

    @Test
    fun `Resource State Change Triggers are correctly reflected`() {
        var testOperationState: MutableList<ResourceMutationState> = mutableListOf()
        dynamicResourceUpdateManager = DynamicResourceUpdateManager.getInstance(projectRule.project)

        cloudFormationClient.stub {
            on { deleteResource(any<DeleteResourceRequest>()) } doAnswer {
                DeleteResourceResponse.builder().progressEvent(
                    ProgressEvent.builder()
                        .requestToken("sampleToken")
                        .typeName(resource.type.fullName)
                        .operation(Operation.DELETE)
                        .operationStatus(OperationStatus.IN_PROGRESS)
                        .statusMessage("Message in progress")
                        .build()
                ).build()
            }
            on { getResourceRequestStatus(any<GetResourceRequestStatusRequest>()) } doAnswer {
                GetResourceRequestStatusResponse.builder().progressEvent(
                    ProgressEvent.builder()
                        .requestToken("sampleToken")
                        .operation(Operation.DELETE)
                        .operationStatus(OperationStatus.SUCCESS)
                        .statusMessage("Completed successfully")
                        .build()
                )
                    .build()
            }
        }

        projectRule.project.messageBus.connect(projectRule.project)
            .subscribe(
                DynamicResourceUpdateManager.DYNAMIC_RESOURCE_STATE_CHANGED,
                object : DynamicResourceStateMutationHandler {
                    override fun mutationStatusChanged(state: ResourceMutationState) {
                        testOperationState.add(state)
                    }

                    override fun statusCheckComplete() {}
                }
            )

        dynamicResourceUpdateManager.deleteResource(DynamicResourceIdentifier(connectionSettings, resource.type.fullName, resource.identifier))
        CountDownLatch(1).await(400, TimeUnit.MILLISECONDS)
        assertThat(testOperationState.size).isEqualTo(1)
        assertThat(testOperationState.first().message).isEqualTo("Completed successfully")
        assertThat(testOperationState.first().status).isEqualTo(OperationStatus.SUCCESS)
    }

    @Test
    fun `Resource State Change Triggers are updates status text`() {
        var testOperationStatus: MutableList<OperationStatus> = mutableListOf()
        dynamicResourceUpdateManager = DynamicResourceUpdateManager.getInstance(projectRule.project)

        cloudFormationClient.stub {
            on { deleteResource(any<DeleteResourceRequest>()) } doAnswer {
                DeleteResourceResponse.builder().progressEvent(
                    ProgressEvent.builder()
                        .requestToken("sampleToken")
                        .typeName(resource.type.fullName)
                        .operation(Operation.DELETE)
                        .operationStatus(OperationStatus.IN_PROGRESS)
                        .build()
                ).build()
            }
            on { getResourceRequestStatus(any<GetResourceRequestStatusRequest>()) } doAnswer {
                GetResourceRequestStatusResponse.builder().progressEvent(
                    ProgressEvent.builder()
                        .requestToken("sampleToken")
                        .operation(Operation.DELETE)
                        .operationStatus(OperationStatus.IN_PROGRESS)
                        .build()
                )
                    .build()
            }
        }

        projectRule.project.messageBus.connect(projectRule.project)
            .subscribe(
                DynamicResourceUpdateManager.DYNAMIC_RESOURCE_STATE_CHANGED,
                object : DynamicResourceStateMutationHandler {

                    override fun mutationStatusChanged(state: ResourceMutationState) {
                        testOperationStatus.add(state.status)
                    }

                    override fun statusCheckComplete() {
                        testOperationStatus.add(OperationStatus.SUCCESS)
                    }
                }
            )
        dynamicResourceUpdateManager.deleteResource(DynamicResourceIdentifier(connectionSettings, resource.type.fullName, resource.identifier))
        CountDownLatch(1).await(400, TimeUnit.MILLISECONDS)
        assertThat(testOperationStatus.size).isEqualTo(1)
        assertThat(testOperationStatus.first()).isEqualTo(OperationStatus.SUCCESS)
    }
}

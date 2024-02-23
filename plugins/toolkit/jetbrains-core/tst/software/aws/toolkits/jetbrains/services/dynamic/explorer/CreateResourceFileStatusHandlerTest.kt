// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.cloudcontrol.CloudControlClient
import software.amazon.awssdk.services.cloudcontrol.model.GetResourceRequest
import software.amazon.awssdk.services.cloudcontrol.model.GetResourceResponse
import software.amazon.awssdk.services.cloudcontrol.model.Operation
import software.amazon.awssdk.services.cloudcontrol.model.OperationStatus
import software.amazon.awssdk.services.cloudcontrol.model.ResourceDescription
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.dynamic.CreateDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.CreateResourceFileStatusHandler
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResource
import software.aws.toolkits.jetbrains.services.dynamic.ResourceMutationState
import software.aws.toolkits.jetbrains.services.dynamic.ResourceType
import software.aws.toolkits.jetbrains.services.dynamic.ViewEditableDynamicResourceVirtualFile
import java.time.Instant

class CreateResourceFileStatusHandlerTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    private lateinit var cloudControlClient: CloudControlClient
    private lateinit var createResourceHandler: CreateResourceFileStatusHandler
    private lateinit var connectionSettings: ConnectionSettings
    private lateinit var fileEditorManager: FileEditorManager
    private val resource = DynamicResource(ResourceType("AWS::SampleService::Type", "SampleService", "Type"), "sampleIdentifier")

    @Before
    fun setup() {
        fileEditorManager = FileEditorManager.getInstance(projectRule.project)
        connectionSettings = ConnectionSettings(aToolkitCredentialsProvider(), anAwsRegion())
        cloudControlClient = mockClientManager.create(connectionSettings.region, connectionSettings.credentials)
    }

    @Test
    fun `If resource creation succeeds, an updated view of file opens`() {
        createResourceHandler = CreateResourceFileStatusHandler.getInstance(projectRule.project)

        cloudControlClient.stub {
            on { getResource(any<GetResourceRequest>()) } doAnswer {
                GetResourceResponse.builder().typeName(resource.type.fullName).resourceDescription(
                    ResourceDescription
                        .builder()
                        .identifier(resource.identifier)
                        .properties("{\"LogGroupName\":\"testRes5\",\"Arn\":\"sampleArn:*\"}")
                        .build()
                )
                    .build()
            }
        }
        val sampleFile = CreateDynamicResourceVirtualFile(connectionSettings, resource.type.fullName)
        runInEdtAndWait {
            fileEditorManager.openFile(sampleFile, false)
        }
        createResourceHandler.recordResourceBeingCreated("sampleToken", sampleFile)
        assertThat(fileEditorManager.openFiles.filterIsInstance<CreateDynamicResourceVirtualFile>().size).isEqualTo(1)

        val mutationState = ResourceMutationState(
            connectionSettings,
            "sampleToken",
            Operation.CREATE,
            resource.type.fullName,
            OperationStatus.SUCCESS,
            resource.identifier,
            "",
            Instant.now()
        )
        createResourceHandler.mutationStatusChanged(mutationState)

        assertThat(fileEditorManager.openFiles.filterIsInstance<CreateDynamicResourceVirtualFile>().size).isEqualTo(0)
        assertThat(createResourceHandler.getNumberOfResourcesBeingCreated()).isEqualTo(0)
        assertThat(fileEditorManager.openFiles.filterIsInstance<ViewEditableDynamicResourceVirtualFile>().size).isEqualTo(1)
    }

    @After
    fun closeFile() {
        runInEdtAndWait {
            fileEditorManager.closeFile(FileEditorManager.getInstance(projectRule.project).openFiles.first())
        }
    }
}

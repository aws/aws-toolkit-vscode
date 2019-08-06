// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.ListRolesRequest
import software.amazon.awssdk.services.iam.model.ListRolesResponse
import software.amazon.awssdk.services.iam.model.Role
import software.amazon.awssdk.services.iam.paginators.ListRolesIterable
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.HeadBucketResponse
import software.amazon.awssdk.services.s3.model.ListBucketsResponse
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager

class EditFunctionDialogTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    private val mockSettingsManager by lazy { ProjectAccountSettingsManager.getInstance(projectRule.project) as MockProjectAccountSettingsManager }

    private lateinit var s3Client: S3Client
    private lateinit var iamClient: IamClient

    @Before
    fun setup() {
        s3Client = mockClientManager.create()
        iamClient = mockClientManager.create()
        mockSettingsManager.activeRegion = AwsRegion("us-west-1", "US West 1")
    }

    @Test
    fun newShowsBothConfigurationAndDeploymentSettings() {
        mockBuckets()
        mockRoles()

        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.NEW)
        }

        assertThat(dialog.getViewForTestAssertions().configurationSettings.isVisible).isTrue()
        assertThat(dialog.getViewForTestAssertions().deploySettings.isVisible).isTrue()
    }

    @Test
    fun updateConfigurationShowsOnlyConfigurationSettings() {
        mockBuckets()
        mockRoles()

        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.UPDATE_CONFIGURATION)
        }

        assertThat(dialog.getViewForTestAssertions().configurationSettings.isVisible).isTrue()
        assertThat(dialog.getViewForTestAssertions().deploySettings.isVisible).isFalse()
    }

    @Test
    fun updateCodeShowsOnlyDeploymentSettingsAndHandler() {
        mockBuckets()
        mockRoles()

        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.UPDATE_CODE)
        }

        assertThat(dialog.getViewForTestAssertions().deploySettings.isVisible).isTrue()
        assertThat(dialog.getViewForTestAssertions().handler.isVisible).isTrue()

        assertThat(dialog.getViewForTestAssertions().name.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().description.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().iamRole.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().createRole.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().runtime.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().envVars.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().timeoutSlider.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().memorySlider.isVisible).isFalse()
    }

    private fun mockBuckets() {
        whenever(s3Client.listBuckets()).thenReturn(ListBucketsResponse.builder().buckets(Bucket.builder().name("hello").build()).build())
        val mockSdkResponse = mock<SdkHttpResponse>()
        whenever(mockSdkResponse.headers()).thenReturn(mapOf("x-amz-bucket-region" to listOf("us-west-1")))
        whenever(s3Client.headBucket(HeadBucketRequest.builder().bucket("hello").build())).thenReturn(
            HeadBucketResponse.builder().sdkHttpResponse(mockSdkResponse).build() as HeadBucketResponse
        )
    }

    private fun mockRoles() {
        whenever(iamClient.listRolesPaginator(any<ListRolesRequest>())).thenAnswer { a ->
            ListRolesIterable(
                iamClient,
                a.arguments.first() as ListRolesRequest
            )
        }
        whenever(iamClient.listRoles(any<ListRolesRequest>())).thenReturn(
            ListRolesResponse.builder().roles(
                Role.builder().arn("abc123").assumeRolePolicyDocument(
                    LAMBDA_PRINCIPAL
                ).build()
            ).isTruncated(false).build()
        )
    }
}
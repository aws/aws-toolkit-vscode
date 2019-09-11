// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.whenever
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.resourcegroupstaggingapi.ResourceGroupsTaggingApiClient
import software.amazon.awssdk.services.resourcegroupstaggingapi.model.GetResourcesRequest
import software.amazon.awssdk.services.resourcegroupstaggingapi.model.GetResourcesResponse
import software.amazon.awssdk.services.resourcegroupstaggingapi.model.ResourceTagMapping
import software.amazon.awssdk.services.resourcegroupstaggingapi.model.Tag
import software.amazon.awssdk.services.resourcegroupstaggingapi.paginators.GetResourcesIterable
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ResourceOperationAgainstCodePipelineTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val mockClient by lazy { mockClientManagerRule.create<ResourceGroupsTaggingApiClient>() }

    private val RESOURCE_ARN = "resourceARN"
    private val RESOURCE_TYPE_FILTER = "resourceTypeFilter"
    private val CODEPIPELINE_ARN = "codePipelineArn"

    @Test
    fun getCodePipelineArnForResource_resourceTagMappingNotFound() {
        whenever(mockClient.getResourcesPaginator(any<GetResourcesRequest>()))
            .thenReturn(
                object : GetResourcesIterable(null, null) {
                    override fun iterator() = mutableListOf(
                        GetResourcesResponse.builder().build()
                    ).iterator()
                }
            )

        assertNull(getCodePipelineArnForResource(projectRule.project, RESOURCE_ARN, RESOURCE_TYPE_FILTER))
    }

    @Test
    fun getCodePipelineArnForResource_resourceArnNotFound() {
        whenever(mockClient.getResourcesPaginator(any<GetResourcesRequest>()))
            .thenReturn(
                object : GetResourcesIterable(null, null) {
                    override fun iterator() = mutableListOf(
                        GetResourcesResponse.builder()
                            .resourceTagMappingList(
                                getResourceTagMapping("arn", "key", "value")
                            )
                            .build()
                    ).iterator()
                }
            )

        assertNull(getCodePipelineArnForResource(projectRule.project, RESOURCE_ARN, RESOURCE_TYPE_FILTER))
    }

    @Test
    fun getCodePipelineArnForResource_pipelineTagNotFound() {
        whenever(mockClient.getResourcesPaginator(any<GetResourcesRequest>()))
            .thenReturn(
                object : GetResourcesIterable(null, null) {
                    override fun iterator() = mutableListOf(
                        GetResourcesResponse.builder()
                            .resourceTagMappingList(
                                getResourceTagMapping(RESOURCE_ARN, "key", "value")
                            )
                            .build()
                    ).iterator()
                }
            )

        assertNull(getCodePipelineArnForResource(projectRule.project, RESOURCE_ARN, RESOURCE_TYPE_FILTER))
    }

    @Test
    fun getCodePipelineArnForResource_pipelineTagFound() {
        whenever(mockClient.getResourcesPaginator(any<GetResourcesRequest>()))
            .thenReturn(
                object : GetResourcesIterable(null, null) {
                    override fun iterator() = mutableListOf(
                        GetResourcesResponse.builder()
                            .resourceTagMappingList(
                                getResourceTagMapping(RESOURCE_ARN, CODEPIPELINE_SYSTEM_TAG_KEY, CODEPIPELINE_ARN)
                            )
                            .build()
                    ).iterator()
                }
            )

        assertEquals(CODEPIPELINE_ARN, getCodePipelineArnForResource(projectRule.project, RESOURCE_ARN, RESOURCE_TYPE_FILTER))
    }

    private fun getResourceTagMapping(resourceARN: String, tagKey: String, tagValue: String) = ResourceTagMapping.builder()
        .resourceARN(resourceARN)
        .tags(
            Tag.builder()
                .key(tagKey)
                .value(tagValue)
                .build()
        )
        .build()
}

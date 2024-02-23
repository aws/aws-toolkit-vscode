// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen
// TODO: fixme
//
// import com.intellij.testFramework.ApplicationRule
// import com.intellij.testFramework.RuleChain
// import org.assertj.core.api.Assertions.assertThat
// import org.junit.Ignore
// import org.junit.Rule
// import org.junit.Test
// import org.mockito.kotlin.any
// import org.mockito.kotlin.argumentCaptor
// import org.mockito.kotlin.mock
// import org.mockito.kotlin.times
// import org.mockito.kotlin.verify
// import software.amazon.awssdk.services.mde.MdeClient
// import software.amazon.awssdk.services.mde.model.EnvironmentStatus
// import software.amazon.awssdk.services.mde.model.GetEnvironmentMetadataResponse
// import software.amazon.awssdk.services.mde.model.IdeConfiguration
// import software.amazon.awssdk.services.mde.model.InstanceType
// import software.amazon.awssdk.services.mde.model.StartEnvironmentRequest
// import software.amazon.awssdk.services.mde.model.TagResourceRequest
// import software.amazon.awssdk.services.mde.model.UntagResourceRequest
// import software.aws.toolkits.jetbrains.core.MockClientManagerRule
// import software.aws.toolkits.jetbrains.gateway.GatewayProduct
//
// class ConfigureActionTest {
//    val applicationRule = ApplicationRule()
//    val mockClientManagerRule = MockClientManagerRule()
//
//    @JvmField
//    @Rule
//    val ruleChain = RuleChain(applicationRule, mockClientManagerRule)
//
//    @Test
//    fun `noop if no changes`() {
//        val client = mockClientManagerRule.create<MdeClient>()
//        val initialState = GetEnvironmentMetadataResponse.builder()
//            .id("id")
//            .arn("arn")
//            .status(EnvironmentStatus.RUNNING)
//            .instanceType(InstanceType.DEV_STANDARD1_MICRO)
//            .tags(listOf("3", "2", "1").associateWith { "" })
//            .build()
//        val context = ConfigureAction.ReconfigureEnvironmentSettings(
//            labels = "1,2,3",
//            type = InstanceType.DEV_STANDARD1_MICRO
//        )
//
//        ConfigureAction.reconfigureIdeFromContext(client, initialState, context, mock())
//    }
//
//    @Test
//    fun `untag removed tags`() {
//        val client = mockClientManagerRule.create<MdeClient>()
//        val initialState = GetEnvironmentMetadataResponse.builder()
//            .id("id")
//            .arn("arn")
//            .status(EnvironmentStatus.RUNNING)
//            .instanceType(InstanceType.DEV_STANDARD1_MICRO)
//            .tags(listOf("3", "2", "1").associateWith { "" })
//            .build()
//        val context = ConfigureAction.ReconfigureEnvironmentSettings(
//            labels = "1",
//            type = InstanceType.DEV_STANDARD1_MICRO
//        )
//
//        ConfigureAction.reconfigureIdeFromContext(client, initialState, context, mock())
//
//        argumentCaptor<UntagResourceRequest>().apply {
//            verify(client).untagResource(capture())
//            verify(client, times(0)).tagResource(any<TagResourceRequest>())
//
//            assertThat(firstValue.tagKeys()).containsExactlyInAnyOrder("2", "3")
//        }
//    }
//
//    @Test
//    fun `tag new tags`() {
//        val client = mockClientManagerRule.create<MdeClient>()
//        val initialState = GetEnvironmentMetadataResponse.builder()
//            .id("id")
//            .arn("arn")
//            .status(EnvironmentStatus.RUNNING)
//            .instanceType(InstanceType.DEV_STANDARD1_MICRO)
//            .tags(listOf("3", "2", "1").associateWith { "" })
//            .build()
//        val context = ConfigureAction.ReconfigureEnvironmentSettings(
//            labels = "1,2,3,4,5,6",
//            type = InstanceType.DEV_STANDARD1_MICRO
//        )
//
//        ConfigureAction.reconfigureIdeFromContext(client, initialState, context, mock())
//
//        argumentCaptor<TagResourceRequest>().apply {
//            verify(client).tagResource(capture())
//            verify(client, times(0)).untagResource(any<UntagResourceRequest>())
//
//            assertThat(firstValue.tags().keys).containsExactlyInAnyOrder("4", "5", "6")
//        }
//    }
//
//    @Test
//    @Ignore
//    fun `changes instance type`() {
//        val client = mockClientManagerRule.create<MdeClient>()
//        val initialState = GetEnvironmentMetadataResponse.builder()
//            .id("id")
//            .arn("arn")
//            .status(EnvironmentStatus.RUNNING)
//            .instanceType(InstanceType.DEV_STANDARD1_MICRO)
//            .build()
//        val context = ConfigureAction.ReconfigureEnvironmentSettings(
//            labels = "1,2,3,4,5,6",
//            type = InstanceType.DEV_STANDARD1_LARGE
//        )
//
//        ConfigureAction.reconfigureIdeFromContext(client, initialState, context, mock())
//
//        argumentCaptor<StartEnvironmentRequest>().apply {
//            verify(client).startEnvironment(capture())
//
//            assertThat(firstValue.instanceType()).isEqualTo(InstanceType.DEV_STANDARD1_LARGE)
//        }
//    }
//
//    @Test
//    @Ignore
//    fun `changes IDE`() {
//        val client = mockClientManagerRule.create<MdeClient>()
//        val initialState = GetEnvironmentMetadataResponse.builder()
//            .id("id")
//            .arn("arn")
//            .status(EnvironmentStatus.RUNNING)
//            .instanceType(InstanceType.DEV_STANDARD1_MICRO)
//            .build()
//        val context = ConfigureAction.ReconfigureEnvironmentSettings(
//            labels = "1,2,3,4,5,6",
//            type = InstanceType.DEV_STANDARD1_LARGE,
//            ide = GatewayProduct("ecrImage", "build", "product", "name", emptyList())
//        )
//
//        ConfigureAction.reconfigureIdeFromContext(client, initialState, context, mock())
//
//        argumentCaptor<StartEnvironmentRequest>().apply {
//            verify(client).startEnvironment(capture())
//
//            assertThat(firstValue.ides()).satisfies {
//                assertThat(it.size).isEqualTo(1)
//                assertThat(it.first()).isEqualTo(IdeConfiguration.builder().runtime("ecrImage").build())
//            }
//        }
//    }
// }

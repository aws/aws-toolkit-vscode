// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.id
import software.aws.toolkits.jetbrains.services.dynamic.CloudControlApiResources
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources

class CloudControlApiResourcesTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun `Correct resource name to be displayed is returned depending on the resource identifier name`() {
        val expectedDisplayName = "sampleIdentifier"
        assertThat(CloudControlApiResources.getResourceDisplayName("sampleIdentifier")).isEqualTo(expectedDisplayName)
        assertThat(CloudControlApiResources.getResourceDisplayName("arn:aws:sqs:us-west-2:1234567890:sampleIdentifier")).isEqualTo(expectedDisplayName)
    }

    @Test
    fun `S3 buckets use the S3 bucket list others use cloud API`() {
        val ecs = CloudControlApiResources.listResources("AWS::ECS::Service")
        val s3 = CloudControlApiResources.listResources("AWS::S3::Bucket")

        assertThat(ecs.id).startsWith("cloudcontrolapi.dynamic.resources")
        assertThat(s3.id).isEqualTo(S3Resources.LIST_BUCKETS.id)
    }
}

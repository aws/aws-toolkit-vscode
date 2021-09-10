// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources
import software.aws.toolkits.resources.message

class DynamicResourcesTest {

    @Test
    fun `Correct resource name to be displayed is returned depending on the resource identifier name`() {
        val expectedDisplayName = "sampleIdentifier"
        assertThat(DynamicResources.getResourceDisplayName("sampleIdentifier")).isEqualTo(expectedDisplayName)
        assertThat(DynamicResources.getResourceDisplayName("arn:aws:sqs:us-west-2:1234567890:sampleIdentifier")).isEqualTo(expectedDisplayName)
        assertThat(DynamicResources.getResourceDisplayName("AWS::SampleService::SampleIdentifier", sourceIsCreateResource = true))
            .isEqualTo(message("dynamic_resources.create_resource_file_name", "AWS::SampleService::SampleIdentifier"))
    }
}

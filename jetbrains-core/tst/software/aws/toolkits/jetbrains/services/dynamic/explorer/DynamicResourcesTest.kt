// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources

class DynamicResourcesTest {

    @Test
    fun `Only resources with LIST Permissions are returned`() {
        val resources: String = "{\n" +
            "    \"resourceWithoutListPermission\" : {\n" +
            "        \"operations\" : [ \"CREATE\", \"READ\", \"DELETE\", \"UPDATE\" ]\n" +
            "    },\n" +
            "    \"resourceWithListPermission\" : {\n" +
            "        \"operations\" : [ \"CREATE\", \"READ\", \"UPDATE\", \"DELETE\", \"LIST\" ]\n" +
            "    }}"

        val reader = jacksonObjectMapper()
        val resourceJson = reader.readTree(resources)
        assertThat(DynamicResources.getSupportedTypes(resourceJson)).contains("resourceWithListPermission")
        assertThat(DynamicResources.getSupportedTypes(resourceJson)).doesNotContain("resourceWithoutListPermission")
    }
}

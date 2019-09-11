// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class CloudFormationParametersTest {

    val fooParameter = mockTemplateParameter("Foo", "foo")
    val bazParameter = mockTemplateParameter("Baz", "baz")

    val remoteFooParameter = mockRemoteParameter("Foo", "fooValue")
    val remoteBarParameter = mockRemoteParameter("Bar", "barValue")

    @Test
    fun mergeParameters_emptyRemote() {
        val mergedParameters = listOf(fooParameter, bazParameter)
                .mergeRemoteParameters(listOf())
        assertThat(mergedParameters).hasSize(2)
        assertThat(mergedParameters).anySatisfy {
            it.logicalName == "Foo" && it.defaultValue() == "foo"
        }
        assertThat(mergedParameters).anySatisfy {
            it.logicalName == "Baz" && it.defaultValue() == "baz"
        }
    }

    @Test
    fun mergeParameters_emptyTemplate() {
        val mergedParameters = listOf<Parameter>()
                .mergeRemoteParameters(listOf(remoteFooParameter, remoteBarParameter))
        assertThat(mergedParameters).isEmpty()
    }

    @Test
    fun mergeParameters_withOverlap() {
        val mergedParameters = listOf(fooParameter, bazParameter)
                .mergeRemoteParameters(listOf(remoteFooParameter, remoteBarParameter))
        assertThat(mergedParameters).hasSize(2)
        assertThat(mergedParameters).anySatisfy {
            it.logicalName == "Foo" && it.defaultValue() == "fooValue"
        }
        assertThat(mergedParameters).anySatisfy {
            it.logicalName == "Baz" && it.defaultValue() == "baz"
        }
    }

    private fun mockTemplateParameter(logicalName: String, defaultValue: String): Parameter {
        val mockParameter = mock<Parameter>()
        whenever(mockParameter.logicalName).thenReturn(logicalName)
        whenever(mockParameter.defaultValue()).thenReturn(defaultValue)
        return mockParameter
    }

    private fun mockRemoteParameter(key: String, value: String): software.amazon.awssdk.services.cloudformation.model.Parameter =
        software.amazon.awssdk.services.cloudformation.model.Parameter.builder()
            .parameterKey(key)
            .parameterValue(value)
            .build()
}

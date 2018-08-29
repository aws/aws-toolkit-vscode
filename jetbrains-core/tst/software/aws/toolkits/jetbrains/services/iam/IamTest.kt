// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.stubbing.Answer
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.ListRolesRequest
import software.amazon.awssdk.services.iam.model.ListRolesResponse
import software.amazon.awssdk.services.iam.model.Role
import software.amazon.awssdk.services.iam.paginators.ListRolesIterable
import software.aws.toolkits.jetbrains.utils.DelegateSdkConsumers
import java.util.stream.Collectors
import java.util.stream.IntStream

class IamTest {

    @Test
    fun filteringRoles() {
        val iamClient = mock<IamClient>(defaultAnswer = DelegateSdkConsumers()) {
            on { listRolesPaginator(any<ListRolesRequest>()) } doReturn ListRolesIterable(
                it,
                ListRolesRequest.builder().build()
            )

            on { listRoles(any<ListRolesRequest>()) } doAnswer listRoleResponseGenerator(10, 50)
        }

        assertThat(iamClient.listRolesFilter { false }.toList()).isEmpty()

        verify(iamClient, times(5)).listRoles(any<ListRolesRequest>())
    }

    @Test
    fun filterRolesShortCircuits() {
        val iamClient = mock<IamClient>(defaultAnswer = DelegateSdkConsumers()) {
            on { listRolesPaginator(any<ListRolesRequest>()) } doReturn ListRolesIterable(
                it,
                ListRolesRequest.builder().build()
            )

            on { listRoles(any<ListRolesRequest>()) } doAnswer listRoleResponseGenerator(10, 50)
        }

        val listRolesFilter = iamClient.listRolesFilter { it.roleName().endsWith("33") }.firstOrNull()
        assertThat(listRolesFilter).isNotNull

        verify(iamClient, times(4)).listRoles(any<ListRolesRequest>())
    }

    private fun listRoleResponseGenerator(interval: Int, max: Int): Answer<ListRolesResponse> {
        var start = 0

        return Answer { _ ->
            val stop = start + interval

            val roles = IntStream.range(start, stop).mapToObj { num ->
                Role.builder()
                    .arn("RoleArn$num}")
                    .roleName("RoleName$num")
                    .build()
            }.collect(Collectors.toList<Role>())

            start = stop

            return@Answer ListRolesResponse.builder()
                .marker(roles.last().roleName())
                .roles(roles)
                .isTruncated(stop < max)
                .build()
        }
    }
}
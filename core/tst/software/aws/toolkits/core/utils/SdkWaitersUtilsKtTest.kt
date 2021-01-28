// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import software.amazon.awssdk.core.internal.waiters.DefaultWaiterResponse
import java.net.MalformedURLException

class SdkWaitersUtilsKtTest {
    @Test
    fun `waiter response throws exception on error`() {
        assertThatThrownBy {
            DefaultWaiterResponse.builder<String>().exception(MalformedURLException()).attemptsExecuted(1).build().unwrapResponse()
        }.isInstanceOf(MalformedURLException::class.java)
    }

    @Test
    fun `waiter response can return the response`() {
        assertThat(DefaultWaiterResponse.builder<String>().response("Foo").attemptsExecuted(1).build().unwrapResponse()).isEqualTo("Foo")
    }
}

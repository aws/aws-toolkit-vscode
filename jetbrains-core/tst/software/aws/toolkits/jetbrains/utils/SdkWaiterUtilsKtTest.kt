// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import software.amazon.awssdk.core.internal.waiters.DefaultWaiterResponse

class SdkWaiterUtilsKtTest {
    @Test
    fun `waiter response throws exception on error`() {
        assertThatThrownBy {
            DefaultWaiterResponse.builder<String>().exception(IllegalStateException()).attemptsExecuted(1).build().response()
        }.isInstanceOf<IllegalStateException>()
    }

    @Test
    fun `waiter response can return the response`() {
        assertThat(DefaultWaiterResponse.builder<String>().response("Foo").attemptsExecuted(1).build().response()).isEqualTo("Foo")
    }
}

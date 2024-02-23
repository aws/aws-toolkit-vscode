// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class IamRoleTest {
    @Test
    fun testNameIsExtracted() {
        val arn = "arn:aws:iam::123456789012:role/HelloWorldRole"
        val role = IamRole(arn)
        assertThat(role.arn).isEqualTo(arn)
        assertThat(role.name).isEqualTo("HelloWorldRole")
    }

    @Test
    fun testArnIsUsedWhenInvalidFormat() {
        val arn = "role/HelloWorldRole"
        val role = IamRole(arn)
        assertThat(role.arn).isEqualTo(arn)
        assertThat(role.name).isNull()
    }
}

// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted.editor

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class GettingStartedVirtualFileTest {
    @Test
    fun `different GettingStartedVirtualFile instances have the same hashCode`() {
        assertThat(GettingStartedVirtualFile().hashCode()).isEqualTo(GettingStartedVirtualFile().hashCode())
    }

    @Test
    fun `different GettingStartedVirtualFile instances are equal`() {
        assertThat(GettingStartedVirtualFile()).isEqualTo(GettingStartedVirtualFile())
    }

    @Test
    fun `null is not equal to GettingStartedVirtualFile instance`() {
        assertThat(GettingStartedVirtualFile()).isNotEqualTo(null)
    }
}

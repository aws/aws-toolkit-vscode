// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import org.assertj.core.api.Assertions.assertThat
import kotlin.test.Test

class SourceOfEntryTest {
    @Test
    fun `Camel case is returned if string contains an underscore`() {
        assertThat(SourceOfEntry.RESOURCE_EXPLORER.toString()).isEqualTo("resourceExplorer")
    }

    @Test
    fun `Camel case is not returned if string doesn't contain an underscore`() {
        assertThat(SourceOfEntry.EXPLORER.toString()).isEqualTo("explorer")
    }
}

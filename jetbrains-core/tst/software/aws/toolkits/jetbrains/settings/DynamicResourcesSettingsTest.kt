// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.deserializeState
import software.aws.toolkits.jetbrains.utils.serializeState

class DynamicResourcesSettingsTest {
    @Test
    fun `can round trip settings`() {
        val sut = DefaultDynamicResourcesSettings()

        sut.selected = setOf("a", "b", "c")

        val serialized = serializeState("settings", sut)
        val newSut = DefaultDynamicResourcesSettings()
        deserializeState(serialized, newSut)
        assertThat(newSut.selected).isEqualTo(sut.selected)
    }
}

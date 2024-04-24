// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.junit5.TestApplication
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

@TestApplication
class PluginLoadTest {
    @Test
    fun `split plugin can load with older plugin without crashing IDE`() {
        assertThat(ApplicationManager.getApplication()).isNotNull()
    }
}

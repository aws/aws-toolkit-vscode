// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class BannedImportsRuleTest {
    private val rule = BannedImportsRule()

    @Test
    fun `Importing Assert fails`() {
        assertThat(rule.lint("import org.assertj.core.api.Assertions"))
            .singleElement()
            .matches { it.id == "BannedImports" && it.message == "Import the assertion you want to use directly instead of importing the top level Assertions" }
    }

    @Test
    fun `Importing Hamcrest fails`() {
        assertThat(rule.lint("import org.hamcrest.AnyClass"))
            .singleElement()
            .matches { it.id == "BannedImports" && it.message == "Use AssertJ instead of Hamcrest assertions" }
    }

    @Test
    fun `Importing Gson fails`() {
        assertThat(rule.lint("import com.google.gson.Gson"))
            .singleElement()
            .matches { it.id == "BannedImports" && it.message == "Use jacksonObjectMapper() insted of Gson" }
    }

    @Test
    fun `Importing Kotlin test assert fails`() {
        assertThat(rule.lint("import kotlin.test.assertTrue"))
            .singleElement()
            .matches { it.id == "BannedImports" && it.message == "Use AssertJ instead of Kotlin test assertions" }
        assertThat(rule.lint("import kotlin.test.assertFalse"))
            .singleElement()
            .matches { it.id == "BannedImports" && it.message == "Use AssertJ instead of Kotlin test assertions" }
    }

    @Test
    fun `Importing kotlin test notNull succeeds`() {
        assertThat(rule.lint("import kotlin.test.assertNotNull")).isEmpty()
    }

    @Test
    fun `Importing Assert assertThat succeeds`() {
        assertThat(rule.lint("import org.assertj.core.api.Assertions.assertThat")).isEmpty()
    }

    @Test
    fun `Importing Dispatchers fails`() {
        assertThat(rule.lint("import kotlinx.coroutines.Dispatchers"))
            .singleElement()
            .matches { it.id == "BannedImports" && it.message == "Use contexts from contexts.kt instead of Dispatchers" }
    }

    @Test
    fun `Importing Dispatchers statically fails`() {
        assertThat(rule.lint("import kotlinx.coroutines.Dispatchers.IO"))
            .singleElement()
            .matches { it.id == "BannedImports" && it.message == "Use contexts from contexts.kt instead of Dispatchers" }
    }
}

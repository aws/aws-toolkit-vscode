// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.json.JsonLanguage
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.intellij.lang.annotations.Language
import org.junit.Rule
import org.junit.Test

class TextUtilsTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun textGetsFormatted() {
        @Language("JSON")
        val actual = """
            {
              "hello":
                      "world"}
        """.trimIndent()

        @Language("JSON")
        val expected = """
            {
              "hello": "world"
            }
        """.trimIndent()

        lateinit var formatted: String
        runInEdtAndWait {
            formatted = formatText(projectRule.project, JsonLanguage.INSTANCE, actual)
        }
        assertThat(formatted).isEqualTo(expected)
    }

    @Test
    fun canConvertToTitleHumanReadable() {
        assertThat("CREATE_COMPLETE".toHumanReadable()).isEqualTo("Create Complete")
        assertThat("UPDATE_IN_PROGRESS".toHumanReadable()).isEqualTo("Update In Progress")
    }
}

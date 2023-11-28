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
        val actual =
            """
            {
              "hello":
                      "world"}
            """.trimIndent()

        @Language("JSON")
        val expected =
            """
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

    @Test
    fun canConvertMarkdownToHTML() {
        @Language("md")
        val input = """
            # heading 1
            ## heading 2
            
           ```js 
           console.log("hello world");
           ```
        """.trimIndent()

        @Language("html")
        val expected = """
            <h1>heading 1</h1>
            <h2>heading 2</h2>
            <div class="code-block"><pre><code class="language-js">console.log(&quot;hello world&quot;);
            </code></pre></div>
            
        """.trimIndent()

        val actual = convertMarkdownToHTML(input)
        assertThat(actual).isEqualTo(expected)
    }

    @Test
    fun canRenderDiffsWithCustomRenderer() {
        @Language("md")
        val input = """
           ```diff
             line 1
           - line 2
           + line 3
             line 4
           ```
        """.trimIndent()

        @Language("html")
        val expected = """
            <div class="code-block"><div><pre>  line 1</pre></div><div class="deletion"><pre>- line 2</pre></div><div class="addition"><pre>+ line 3</pre></div><div><pre>  line 4</pre></div><div><pre></pre></div></div>
            
        """.trimIndent()

        val actual = convertMarkdownToHTML(input)
        assertThat(actual).isEqualTo(expected)
    }

    @Test
    fun canApplyPatchSuccessfully() {
        val inputPatch = "@@ -1,3 +1,3 @@\n first line\n-second line\n+third line\n forth line"
        val inputFilePath = "dummy.py"
        val fileContent = "first line\nsecond line\nforth line"
        val actual = applyPatch(inputPatch, fileContent, inputFilePath)
        val expected = "first line\nthird line\nforth line"
        assertThat(actual).isEqualTo(expected)
    }

    @Test
    fun canReturnNullWhenApplyPatchFails() {
        val inputPatch = "@@ -1,3 +1,3 @@\n first line\n-second line\n+third line\n forth line"
        val inputFilePath = "dummy.py"
        val fileContent = "first line\nThree line\nforth line"
        val actual = applyPatch(inputPatch, fileContent, inputFilePath)
        val expected = null
        assertThat(actual).isEqualTo(expected)
    }

    @Test
    fun shouldHaveZeroHunkSizeForIncorrectPatchGenerated() {
        val inputPatch = " first line\n-second line\n+third line\n forth line"
        val inputFilePath = "dummy.py"
        val actual = generateUnifiedPatch(inputPatch, inputFilePath)
        assertThat(actual.hunks.size).isEqualTo(0)
    }

    @Test
    fun shouldHaveHunksForCorrectPatchGenerated() {
        val inputPatch = "@@ -1,3 +1,3 @@\n first line\n-second line\n+third line\n forth line"
        val inputFilePath = "dummy.py"
        val actual = generateUnifiedPatch(inputPatch, inputFilePath)
        assertThat(actual.hunks.size).isEqualTo(1)
        val hunk = actual.hunks[0]
        assertThat(hunk.startLineAfter).isEqualTo(0)
        assertThat(hunk.startLineBefore).isEqualTo(0)
        assertThat(hunk.endLineAfter).isEqualTo(3)
        assertThat(hunk.endLineBefore).isEqualTo(3)
        val inputPatchLines = inputPatch.split("\n")
        hunk.lines.forEachIndexed { index, patchLine -> assertThat(inputPatchLines[index + 1].substring(1)).isEqualTo(patchLine.text) }
    }
}

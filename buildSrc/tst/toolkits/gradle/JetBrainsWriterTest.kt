// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDate

class JetBrainsWriterTest {

    @Rule
    @JvmField
    val folder = TemporaryFolder()

    @Test
    fun basicWrite() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file)

        sut.write(ReleaseEntry(LocalDate.of(2017, 2, 1), "2.0.0-preview-3", listOf(Entry(ChangeType.FEATURE, "Third feature"))))
        sut.write(
            ReleaseEntry(
                LocalDate.of(2017, 1, 3),
                "2.0.0-preview-2",
                listOf(Entry(ChangeType.FEATURE, "Another feature"), Entry(ChangeType.BUGFIX, "Some bugfix"))
            )
        )
        sut.flush()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <p>2.0.0-preview-3:<br/>
            <ul>
              <li><strong>(Feature)</strong> Third feature<br/></li>
            </ul></p>
            <p>2.0.0-preview-2:<br/>
            <ul>
              <li><strong>(Feature)</strong> Another feature<br/></li>
              <li><strong>(Bug Fix)</strong> Some bugfix<br/></li>
            </ul></p>
        """.trimIndent().wrappedInCData()
        )
    }

    @Test
    fun canHandleMultiLine() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file)

        sut.write(
            ReleaseEntry(
                LocalDate.of(2017, 2, 1),
                "2.0.0-preview-3",
                listOf(Entry(ChangeType.FEATURE, "A feature what includes\nmultiple lines of text where\nwe need to ensure it works"))
            )
        )
        sut.flush()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <p>2.0.0-preview-3:<br/>
            <ul>
              <li><strong>(Feature)</strong> A feature what includes<br/>
                multiple lines of text where<br/>
                we need to ensure it works<br/></li>
            </ul></p>
        """.trimIndent().wrappedInCData()
        )
    }

    @Test
    fun canHandleMarkdown() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file)

        sut.write(
            ReleaseEntry(
                LocalDate.of(2017, 2, 1), "2.0.0-preview-3", listOf(
                    Entry(ChangeType.FEATURE, "A feature with some *code* sample \n\n```java\nhello();\n```"),
                    Entry(ChangeType.FEATURE, "A feature with [links](http://linkme.com)")
                )
            )
        )
        sut.flush()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <p>2.0.0-preview-3:<br/>
            <ul>
              <li><strong>(Feature)</strong> A feature with some <em>code</em> sample<br/><pre><code class="language-java">hello();</code></pre></li>
              <li><strong>(Feature)</strong> A feature with <a href="http://linkme.com">links</a><br/></li>
            </ul></p>
        """.trimIndent().wrappedInCData()
        )
    }

    @Test
    fun canHandleReplaceGithubIssueLinks() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file, issueUrl = "http://github.com/org/repo/issues/")

        sut.write(
            ReleaseEntry(
                LocalDate.of(2017, 2, 1), "2.0.0-preview-3", listOf(
                    Entry(ChangeType.FEATURE, "A feature with some an issue link #45 but not regular #hash or #24# #12")
                )
            )
        )
        sut.flush()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <p>2.0.0-preview-3:<br/>
            <ul>
              <li><strong>(Feature)</strong> A feature with some an issue link <a href="http://github.com/org/repo/issues/45">#45</a> but not regular #hash or #24# <a href="http://github.com/org/repo/issues/12">#12</a><br/></li>
            </ul></p>
        """.trimIndent().wrappedInCData()
        )
    }

    private fun String.wrappedInCData() = """
        <idea-plugin>
            <change-notes>
            <![CDATA[
                $this
            ]]>
            </change-notes>
        </idea-plugin>
    """.trimIndent()
}
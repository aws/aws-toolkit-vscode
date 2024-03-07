// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.gradle.changelog.ChangeLogGenerator.Companion.renderEntry
import java.time.LocalDate

class JetBrainsWriterTest {

    @Rule
    @JvmField
    val folder = TemporaryFolder()

    @Test
    fun basicWrite() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file)

        sut.writeEntry(
            renderEntry(
                ReleaseEntry(
                    LocalDate.of(2017, 2, 1),
                    "2.0.0-preview-3",
                    listOf(Entry(ChangeType.FEATURE, "Third feature"))
                )
            )
        )
        sut.writeEntry(
            renderEntry(
                ReleaseEntry(
                    LocalDate.of(2017, 1, 3),
                    "2.0.0-preview-2",
                    listOf(
                        Entry(ChangeType.FEATURE, "Another feature"),
                        Entry(ChangeType.BUGFIX, "Some bugfix")
                    )
                )
            )
        )
        sut.close()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <h3><em>2.0.0-preview-3</em> (2017-02-01)</h3>
            <ul>
              <li><strong>(Feature)</strong> Third feature</li>
            </ul>
            <h3><em>2.0.0-preview-2</em> (2017-01-03)</h3>
            <ul>
              <li><strong>(Feature)</strong> Another feature</li>
              <li><strong>(Bug Fix)</strong> Some bugfix</li>
            </ul>
            """.trimIndent().wrappedInCData()
        )
    }

    @Test
    fun canHandleMultiLine() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file)

        sut.writeEntry(
            renderEntry(
                ReleaseEntry(
                    LocalDate.of(2017, 2, 1),
                    "2.0.0-preview-3",
                    listOf(
                        Entry(
                            ChangeType.FEATURE,
                            "A feature what includes\nmultiple lines of text where\nwe need to ensure it works"
                        ),
                        Entry(
                            ChangeType.DEPRECATION,
                            "Extra blank lines \n\n\n causes Markdown to space our lists so strip them out"
                        )
                    )
                )
            )
        )
        sut.close()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <h3><em>2.0.0-preview-3</em> (2017-02-01)</h3>
            <ul>
              <li><strong>(Feature)</strong> A feature what includes<br/>multiple lines of text where<br/>we need to ensure it works</li>
              <li><strong>(Deprecation)</strong> Extra blank lines<br/>causes Markdown to space our lists so strip them out</li>
            </ul>
            """.trimIndent().wrappedInCData()
        )
    }

    @Test
    fun canHandleMarkdown() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file)

        sut.writeEntry(
            renderEntry(
                ReleaseEntry(
                    LocalDate.of(2017, 2, 1),
                    "2.0.0-preview-3",
                    listOf(
                        Entry(
                            ChangeType.FEATURE,
                            "A feature with some *code* sample\n```java\nhello();\n```"
                        ),
                        Entry(
                            ChangeType.FEATURE,
                            "A feature with [links](http://linkme.com)"
                        )
                    )
                )
            )
        )
        sut.close()
        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <h3><em>2.0.0-preview-3</em> (2017-02-01)</h3>
            <ul>
              <li><strong>(Feature)</strong> A feature with some <em>code</em> sample<pre><code class="language-java">hello();</code></pre></li>
              <li><strong>(Feature)</strong> A feature with <a href="http://linkme.com">links</a></li>
            </ul>
            """.trimIndent().wrappedInCData()
        )
    }

    @Test
    fun canHandleReplaceGithubIssueLinks() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file, repoUrl = "http://github.com/org/repo/issues/")

        sut.writeEntry(
            renderEntry(
                ReleaseEntry(
                    LocalDate.of(2017, 2, 1),
                    "2.0.0-preview-3",
                    listOf(
                        Entry(
                            ChangeType.FEATURE,
                            "A feature with some an issue link #45 or (#12) but not regular #hash"
                        )
                    )
                )
            )
        )
        sut.close()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <h3><em>2.0.0-preview-3</em> (2017-02-01)</h3>
            <ul>
              <li><strong>(Feature)</strong> A feature with some an issue link <a href="http://github.com/org/repo/issues/45">#45</a> or (<a href="http://github.com/org/repo/issues/12">#12</a>) but not regular #hash</li>
            </ul>
            """.trimIndent().wrappedInCData()
        )
    }

    @Test
    fun `handles large changelog`() {
        val file = folder.newFile()
        val sut = JetBrainsWriter(file, "https://github.com/org/repo")

        repeat(1000) {
            sut.writeEntry(
                renderEntry(
                    ReleaseEntry(
                        LocalDate.of(2017 + it, 2, 1),
                        "2.0.0-preview-$it",
                        listOf(Entry(ChangeType.FEATURE, "Feature $it"))
                    )
                )
            )
        }

        sut.close()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace(
            """
            <h3><em>2.0.0-preview-0</em> (2017-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 0</li>
            </ul>
            <h3><em>2.0.0-preview-1</em> (2018-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 1</li>
            </ul>
            <h3><em>2.0.0-preview-2</em> (2019-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 2</li>
            </ul>
            <h3><em>2.0.0-preview-3</em> (2020-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 3</li>
            </ul>
            <h3><em>2.0.0-preview-4</em> (2021-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 4</li>
            </ul>
            <h3><em>2.0.0-preview-5</em> (2022-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 5</li>
            </ul>
            <h3><em>2.0.0-preview-6</em> (2023-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 6</li>
            </ul>
            <h3><em>2.0.0-preview-7</em> (2024-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 7</li>
            </ul>
            <h3><em>2.0.0-preview-8</em> (2025-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 8</li>
            </ul>
            <h3><em>2.0.0-preview-9</em> (2026-02-01)</h3>
            <ul>
            <li><strong>(Feature)</strong> Feature 9</li>
            </ul>
            <hr />
            <p>Full plugin changelog available on <a href="https://github.com/org/repo/blob/main/CHANGELOG.md">GitHub</a></p>
            """.trimIndent().wrappedInCData()
        )
    }

    private fun String.wrappedInCData() =
        """
        <idea-plugin>
            <change-notes>
            <![CDATA[
                $this
            ]]>
            </change-notes>
        </idea-plugin>
        """.trimIndent()
}

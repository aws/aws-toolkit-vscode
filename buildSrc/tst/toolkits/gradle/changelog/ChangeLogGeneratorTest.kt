// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.inOrder
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.intellij.lang.annotations.Language
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.ArgumentMatchers.anyString
import toolkits.gradle.changelog.ChangeLogGenerator.Companion.renderEntry
import toolkits.gradle.changelog.ChangeType.BUGFIX
import toolkits.gradle.changelog.ChangeType.FEATURE
import java.nio.file.Path
import java.time.LocalDate

class ChangeLogGeneratorTest {
    @Rule
    @JvmField
    val folder = TemporaryFolder()

    @Test
    fun entriesAreReverseOrderedByDate() {
        val first = createFile(
            """
                {
                  "date": "2017-01-01",
                  "version": "2.0.0-preview-1",
                  "entries": [
                    {
                      "type": "feature",
                      "description": "Some feature"
                    }
                  ]
                }
            """
        )

        val second = createFile(
            """
                {
                  "date": "2017-01-03",
                  "version": "2.0.0-preview-2",
                  "entries": [
                    {
                      "type": "bugfix",
                      "description": "Some bugfix"
                    },
                    {
                      "type": "feature",
                      "description": "Another feature"
                    }
                  ]
                }
            """
        )

        val third = createFile(
            """
                {
                  "date": "2017-02-01",
                  "version": "2.0.0-preview-3",
                  "entries": [
                    {
                      "type": "feature",
                      "description": "Third feature"
                    }
                  ]
                }
            """
        )

        val writer = mock<ChangeLogWriter>()
        val sut = ChangeLogGenerator(listOf(writer))
        sut.addReleasedChanges(listOf(first, third, second))
        sut.close()

        writer.inOrder {
            verify().writeLine(
                renderEntry(
                    ReleaseEntry(
                        LocalDate.of(2017, 2, 1),
                        "2.0.0-preview-3",
                        listOf(Entry(FEATURE, "Third feature"))
                    )
                )
            )
            verify().writeLine(
                renderEntry(
                    ReleaseEntry(
                        LocalDate.of(2017, 1, 3),
                        "2.0.0-preview-2",
                        listOf(
                            Entry(BUGFIX, "Some bugfix"),
                            Entry(FEATURE, "Another feature")
                        )
                    )
                )
            )
            verify().writeLine(
                renderEntry(
                    ReleaseEntry(
                        LocalDate.of(2017, 1, 1),
                        "2.0.0-preview-1",
                        listOf(Entry(FEATURE, "Some feature"))
                    )
                )
            )
            verify().close()
        }
    }

    @Test(expected = RuntimeException::class)
    fun versionNumbersMustBeUnique() {
        val first = createFile(
            """
                {
                  "date": "2017-01-01",
                  "version": "2.0.0-preview-1",
                  "entries": [
                    {
                      "type": "feature",
                      "description": "Some feature"
                    }
                  ]
                }
            """
        )

        val second = createFile(
            """
                {
                  "date": "2017-01-03",
                  "version": "2.0.0-preview-1",
                  "entries": [
                    {
                      "type": "bugfix",
                      "description": "Some bugfix"
                    }
                  ]
                }
            """
        )

        val sut = ChangeLogGenerator(mock())
        sut.addReleasedChanges(listOf(first, second))
    }

    @Test
    fun canWriteToMultipleWriters() {
        val entry = createFile(
            """
                {
                  "date": "2017-01-01",
                  "version": "2.0.0-preview-1",
                  "entries": [
                    {
                      "type": "feature",
                      "description": "Some feature"
                    }
                  ]
                }
            """
        )

        val firstWriter = mock<ChangeLogWriter>()
        val secondWriter = mock<ChangeLogWriter>()
        val sut = ChangeLogGenerator(listOf(firstWriter, secondWriter))
        sut.addReleasedChanges(listOf(entry))
        sut.close()

        verify(firstWriter).writeLine(anyString())
        verify(firstWriter).close()
        verify(secondWriter).writeLine(anyString())
        verify(secondWriter).close()
    }

    @Test
    fun basicWrite() {
        val writer = mock<ChangeLogWriter>()
        val sut = ChangeLogGenerator(listOf(writer))

        val first = createFile(
            """
                {
                  "date": "2017-02-01",
                  "version": "2.0.0-preview-3",
                  "entries": [
                    {
                      "type": "feature",
                      "description": "Third feature"
                    }
                  ]
                }
            """
        )

        val second = createFile(
            """
                {
                  "date": "2017-01-03",
                  "version": "2.0.0-preview-2",
                  "entries": [
                    {
                      "type": "feature",
                      "description": "Another feature"
                    },
                    {
                      "type": "bugfix",
                      "description": "Some bugfix"
                    }
                  ]
                }
            """
        )

        sut.addReleasedChanges(listOf(first, second))
        sut.close()

        argumentCaptor<String>().apply {
            verify(writer, times(2)).writeLine(capture())

            assertThat(firstValue.trim()).isEqualTo(
                """
                # _2.0.0-preview-3_ (2017-02-01)
                - **(Feature)** Third feature
                """.trimIndent()
            )

            assertThat(secondValue.trim()).isEqualTo(
                """
                # _2.0.0-preview-2_ (2017-01-03)
                - **(Feature)** Another feature
                - **(Bug Fix)** Some bugfix
                """.trimIndent()
            )
        }
    }

    @Test
    fun canHandleMarkdown() {
        val writer = mock<ChangeLogWriter>()
        val sut = ChangeLogGenerator(listOf(writer))

        val first = createFile(
            """
                {
                  "date": "2017-02-01",
                  "version": "2.0.0-preview-3",
                  "entries": [
                    {
                      "type": "feature",
                      "description": "A feature with some *code* sample\n```java\nhello();\n```"
                    },
                    {
                      "type": "feature",
                      "description": "A feature with [links](http://linkme.com)"
                    }
                  ]
                }
            """
        )

        sut.addReleasedChanges(listOf(first))
        sut.close()

        argumentCaptor<String>().apply {
            verify(writer).writeLine(capture())

            assertThat(firstValue.trim()).isEqualTo(
                """
                # _2.0.0-preview-3_ (2017-02-01)
                - **(Feature)** A feature with some *code* sample
                  ```java
                  hello();
                  ```
                - **(Feature)** A feature with [links](http://linkme.com)
                """.trimIndent()
            )
        }
    }

    @Test
    fun canHandleMultiLine() {
        val writer = mock<ChangeLogWriter>()
        val sut = ChangeLogGenerator(listOf(writer))

        val first = createFile(
            """
                {
                  "date": "2017-02-01",
                  "version": "2.0.0-preview-3",
                  "entries": [
                    {
                      "type": "feature",
                      "description": "A feature what includes\nmultiple lines of text where\nwe need to ensure it works"
                    },
                    {
                      "type": "deprecation",
                      "description": "Extra blank lines \n\n\n causes Markdown to space our lists so strip them out"
                    }
                  ]
                }
            """
        )

        sut.addReleasedChanges(listOf(first))
        sut.close()

        argumentCaptor<String>().apply {
            verify(writer).writeLine(capture())

            assertThat(firstValue.trim()).isEqualTo(
                """
                # _2.0.0-preview-3_ (2017-02-01)
                - **(Feature)** A feature what includes
                  multiple lines of text where
                  we need to ensure it works
                - **(Deprecation)** Extra blank lines
                  causes Markdown to space our lists so strip them out
                """.trimIndent()
            )
        }
    }

    private fun createFile(@Language("JSON") input: String): Path = folder.newFile().apply {
        writeText(input.trimIndent())
    }.toPath()
}

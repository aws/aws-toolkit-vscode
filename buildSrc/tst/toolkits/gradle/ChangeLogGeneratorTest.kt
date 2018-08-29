// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle

import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.inOrder
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.intellij.lang.annotations.Language
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import toolkits.gradle.ChangeType.BUGFIX
import toolkits.gradle.ChangeType.FEATURE
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
        val sut = ChangeLogGenerator(writer)
        sut.generate(listOf(first, third, second))
        sut.flush()

        writer.inOrder {
            verify().write(ReleaseEntry(LocalDate.of(2017, 2, 1), "2.0.0-preview-3", listOf(Entry(FEATURE, "Third feature"))))
            verify().write(ReleaseEntry(LocalDate.of(2017, 1, 3), "2.0.0-preview-2", listOf(Entry(BUGFIX, "Some bugfix"), Entry(FEATURE, "Another feature"))))
            verify().write(ReleaseEntry(LocalDate.of(2017, 1, 1), "2.0.0-preview-1", listOf(Entry(FEATURE, "Some feature"))))
            verify().flush()
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
        sut.generate(listOf(first, second))
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
        val sut = ChangeLogGenerator(firstWriter, secondWriter)
        sut.generate(listOf(entry))
        sut.flush()

        verify(firstWriter).write(any())
        verify(firstWriter).flush()
        verify(secondWriter).write(any())
        verify(secondWriter).flush()
    }

    private fun createFile(@Language("JSON") input: String): Path {
        return folder.newFile().apply {
            writeText(input.trimIndent())
        }.toPath()
    }
}
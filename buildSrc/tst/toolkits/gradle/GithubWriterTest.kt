// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDate

class GithubWriterTest {

    @Rule
    @JvmField
    val folder = TemporaryFolder()

    @Test
    fun basicWrite() {
        val file = folder.newFile()
        val sut = GithubWriter(file.toPath())

        sut.write(ReleaseEntry(LocalDate.of(2017, 2, 1), "2.0.0-preview-3", listOf(Entry(ChangeType.FEATURE, "Third feature"))))
        sut.write(ReleaseEntry(LocalDate.of(2017, 1, 3), "2.0.0-preview-2", listOf(Entry(ChangeType.FEATURE, "Another feature"), Entry(ChangeType.BUGFIX, "Some bugfix"))))
        sut.flush()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace("""
            # _2.0.0-preview-3_ (2017-02-01)
              - **(Feature)** Third feature

            # _2.0.0-preview-2_ (2017-01-03)
              - **(Feature)** Another feature
              - **(Bug Fix)** Some bugfix
        """.trimIndent())
    }

    @Test
    fun canHandleMultiLine() {
        val file = folder.newFile()
        val sut = GithubWriter(file.toPath())

        sut.write(ReleaseEntry(LocalDate.of(2017, 2, 1), "2.0.0-preview-3", listOf(Entry(ChangeType.FEATURE, "A feature what includes\nmultiple lines of text where\nwe need to ensure it works"))))
        sut.flush()

        assertThat(file.readText().trim()).isEqualToIgnoringWhitespace("""
            # _2.0.0-preview-3_ (2017-02-01)
              - **(Feature)** A feature what includes
                multiple lines of text where
                we need to ensure it works
        """.trimIndent())
    }
}
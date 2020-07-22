// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import toolkits.gradle.changelog.ChangeLogGenerator.Companion.renderEntry
import java.time.LocalDate

class GithubWriterTest {

    @Rule
    @JvmField
    val folder = TemporaryFolder()

    @Test
    fun basicWrite() {
        val file = folder.newFile()
        val sut = GithubWriter(file.toPath(), null)

        sut.writeLine(
            renderEntry(
                ReleaseEntry(
                    LocalDate.of(2017, 2, 1),
                    "2.0.0-preview-3",
                    listOf(Entry(ChangeType.FEATURE, "Third feature"))
                )
            )
        )
        sut.writeLine(
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

        assertThat(file.readText().trim()).isEqualToNormalizingNewlines(
            """
            # _2.0.0-preview-3_ (2017-02-01)
            - **(Feature)** Third feature

            # _2.0.0-preview-2_ (2017-01-03)
            - **(Feature)** Another feature
            - **(Bug Fix)** Some bugfix
            """.trimIndent()
        )
    }

    @Test
    fun canHandleReplaceGithubIssueLinks() {
        val file = folder.newFile()
        val sut = GithubWriter(file.toPath(), issueUrl = "http://github.com/org/repo/issues/")

        sut.writeLine(
            renderEntry(
                ReleaseEntry(
                    LocalDate.of(2017, 2, 1), "2.0.0-preview-3", listOf(
                        Entry(
                            ChangeType.FEATURE,
                            "A feature with some an issue link #45 or (#12) but not regular #hash"
                        )
                    )
                )
            )
        )
        sut.close()

        assertThat(file.readText().trim()).isEqualToNormalizingNewlines(
            """
            # _2.0.0-preview-3_ (2017-02-01)
            - **(Feature)** A feature with some an issue link [#45](http://github.com/org/repo/issues/45) or ([#12](http://github.com/org/repo/issues/12)) but not regular #hash
            """.trimIndent()
        )
    }
}

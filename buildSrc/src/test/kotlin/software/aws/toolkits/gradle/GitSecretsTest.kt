// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle

import org.assertj.core.api.Assertions.assertThat
import org.eclipse.jgit.api.Git
import org.eclipse.jgit.storage.file.FileRepositoryBuilder
import org.gradle.testfixtures.ProjectBuilder
import org.gradle.testkit.runner.GradleRunner
import org.gradle.testkit.runner.TaskOutcome
import org.gradle.testkit.runner.UnexpectedBuildFailure
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import java.io.File
import kotlin.io.path.writeText

class GitSecretsTest {
    @Test
    fun `plugin can be applied`() {
        val project = ProjectBuilder.builder().build()
        project.getPluginManager().apply("toolkit-git-secrets")
    }

    @Test
    fun `passes when no secrets`(@TempDir tempDir: File) {
        tempDir.mkdirs()
        val repo = FileRepositoryBuilder()
            .setWorkTree(tempDir)
            .build()
        repo.create()

        tempDir
            .resolve("build.gradle.kts")
            .writeText(
                """
                plugins {
                    id("toolkit-git-secrets")
                }
                """.trimIndent()
            )

        Git.wrap(repo).add().addFilepattern(".").call()

        val result = GradleRunner.create()
            .withProjectDir(tempDir)
            .withArguments("gitSecrets")
            .withPluginClasspath()
            .build()

        assertThat(result.task(":gitSecrets")?.outcome).isEqualTo(TaskOutcome.SUCCESS)
    }

    @Test
    fun `fails when contains secrets`(@TempDir tempDir: File) {
        tempDir.mkdirs()
        val repo = FileRepositoryBuilder()
            .setWorkTree(tempDir)
            .build()
        repo.create()

        tempDir
            .resolve("build.gradle.kts")
            .apply {
                writeText(
                    """
                    plugins {
                        id("toolkit-git-secrets")
                    }
                    """.trimIndent()
                )

                appendText(
                    buildString {
                        appendLine()
                        // split to avoid tripping git-secrets
                        append("// AKI")
                        append("AXXXXXXXXXXXXXXXX")
                    }
                )

                Git.wrap(repo).add().addFilepattern(".").call()
            }

        val failure = assertThrows<UnexpectedBuildFailure> {
            GradleRunner.create()
                .withProjectDir(tempDir)
                .withArguments("gitSecrets")
                .withPluginClasspath()
                .build()
        }
        assertThat(failure.message).contains("Matched one or more prohibited patterns")
    }
}

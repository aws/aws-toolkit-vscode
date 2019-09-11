// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import org.assertj.core.api.Assertions.assertThat
import org.eclipse.jgit.api.Git
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class GitStagerTest {
    @Rule
    @JvmField
    val folder = TemporaryFolder()

    lateinit var baseDirectory: File

    lateinit var sut: GitStager

    @Before
    fun initGitRepo() {
        baseDirectory = folder.newFolder()
        Git.init().setDirectory(baseDirectory).call()
        sut = GitStager(baseDirectory)
    }

    @Test
    fun canStageSingleFile() {
        val file = File(baseDirectory, "newFile").apply { createNewFile() }

        sut.stage(file)

        assertThat(Git.open(baseDirectory).status().call().added).contains(file.name)
    }

    @Test(expected = RuntimeException::class)
    fun canNotStageFilesOutsideOfBase() {
        val file = folder.newFile()

        sut.stage(file)
    }

    @Test
    fun canStageSingleFileInSubdirectories() {
        val file = File(File(baseDirectory, "folder").apply { mkdir() }, "file").apply { createNewFile() }

        sut.stage(file)

        assertThat(Git.open(baseDirectory).status().call().added).contains(file.relativizedPath)
    }

    @Test
    fun canStageAFolder() {
        val folder = File(baseDirectory, "folder").apply { mkdir() }
        val firstFile = File(folder, "first").apply { createNewFile() }
        val secondFile = File(folder, "second").apply { createNewFile() }

        sut.stage(folder)

        assertThat(Git.open(baseDirectory).status().call().added).contains(firstFile.relativizedPath, secondFile.relativizedPath)
    }

    @Test
    fun stagingIncludesRemovals() {
        val folder = File(baseDirectory, "folder").apply { mkdir() }
        val firstFile = File(folder, "first").apply { createNewFile() }
        Git.open(baseDirectory).apply {
            add().addFilepattern(folder.name).call()
            commit().setMessage("First commit").setAuthor("Bob", "bob@smith.com").call()
        }

        firstFile.delete()

        sut.stage(folder)

        assertThat(Git.open(baseDirectory).status().call().removed).contains(firstFile.relativizedPath)
    }

    @Test
    fun nullWhenNotGit() {
        assertThat(GitStager.create(folder.newFolder())).isNull()
    }

    private val File.relativizedPath: String get() = this.relativeTo(baseDirectory).path.replace('\\', '/')
}

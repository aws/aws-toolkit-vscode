// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import org.eclipse.jgit.api.Git
import java.io.File

class GitStager(private val rootDirectory: File) {
    private val git = Git.open(rootDirectory)

    fun stage(file: File) {
        if (!file.toPath().toAbsolutePath().startsWith(rootDirectory.toPath())) {
            throw RuntimeException("Can't stage files/folder ($file) outside of root $rootDirectory")
        }

        val relative = rootDirectory.toPath().toAbsolutePath().relativize(file.toPath().toAbsolutePath()).toFile().path.replace('\\', '/')
        git.add().addFilepattern(relative).setUpdate(true).call()
        git.add().addFilepattern(relative).call()
    }

    companion object {
        fun create(rootDirectory: File): GitStager? = try {
            GitStager(rootDirectory)
        } catch (_: Exception) {
            null
        }
    }
}

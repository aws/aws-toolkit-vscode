// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog.tasks

import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.FileTree
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.Internal
import toolkits.gradle.changelog.GitStager

abstract class ChangeLogTask : DefaultTask() {
    @Internal
    protected val git = GitStager.create(project.rootDir)

    @InputDirectory
    val changesDirectory: DirectoryProperty = project.objects.directoryProperty().convention(project.rootProject.layout.projectDirectory.dir(".changes"))

    @InputFiles
    val nextReleaseDirectory: DirectoryProperty = project.objects.directoryProperty().convention(changesDirectory.dir("next-release"))

    protected fun DirectoryProperty.jsonFiles(): FileTree = this.asFileTree.matching {
        it.include("*.json")
    }
}

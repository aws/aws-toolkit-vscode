// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog.tasks

import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.FileTree
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.Internal
import software.aws.toolkits.gradle.changelog.GitStager

abstract class ChangeLogTask : DefaultTask() {
    @Internal
    protected val git = GitStager.create(project.rootDir)

    @InputDirectory
    val changesDirectory: DirectoryProperty = project.objects.directoryProperty().convention(project.rootProject.layout.projectDirectory.dir(".changes"))

    @InputFiles
    val nextReleaseDirectory: DirectoryProperty = project.objects.directoryProperty().convention(changesDirectory.dir("next-release"))

    init {
        group = "changelog"
    }

    protected fun DirectoryProperty.jsonFiles(): FileTree = this.asFileTree.matching {
        include("*.json")
    }
}

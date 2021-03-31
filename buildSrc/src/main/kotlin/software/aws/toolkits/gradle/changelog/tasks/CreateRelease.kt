// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog.tasks

import org.gradle.api.file.ProjectLayout
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.provider.Provider
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction
import software.aws.toolkits.gradle.changelog.ChangeLogGenerator
import software.aws.toolkits.gradle.changelog.GithubWriter
import software.aws.toolkits.gradle.changelog.ReleaseCreator
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

open class CreateRelease @Inject constructor(projectLayout: ProjectLayout) : ChangeLogTask() {
    @Input
    val releaseDate: Property<String> = project.objects.property(String::class.java).convention(DateTimeFormatter.ISO_DATE.format(LocalDate.now()))

    @Input
    val releaseVersion: Property<String> = project.objects.property(String::class.java).convention(
        project.provider {
            (project.version as String).substringBeforeLast('-')
        }
    )

    @Input
    @Optional
    val issuesUrl: Provider<String?> = project.objects.property(String::class.java).convention("https://github.com/aws/aws-toolkit-jetbrains/issues")

    @OutputFile
    val releaseFile: RegularFileProperty = project.objects.fileProperty().convention(changesDirectory.file(releaseVersion.map { "$it.json" }))

    @OutputFile
    val changeLogFile: RegularFileProperty = project.objects.fileProperty().convention(projectLayout.buildDirectory.file("releaseChangeLog.md"))

    @TaskAction
    fun create() {
        val releaseDate = DateTimeFormatter.ISO_DATE.parse(releaseDate.get()).let {
            LocalDate.from(it)
        }

        val releaseEntries = nextReleaseDirectory.jsonFiles()

        val creator = ReleaseCreator(releaseEntries.files, releaseFile.get().asFile, logger)
        creator.create(releaseVersion.get(), releaseDate)
        if (git != null) {
            git.stage(releaseFile.get().asFile.absoluteFile)
            git.stage(nextReleaseDirectory.get().asFile.absoluteFile)
        }

        val generator = ChangeLogGenerator(listOf(GithubWriter(changeLogFile.get().asFile.toPath(), issuesUrl.get())), logger)
        generator.use {
            generator.addReleasedChanges(listOf(releaseFile.get().asFile.toPath()))
        }
    }
}

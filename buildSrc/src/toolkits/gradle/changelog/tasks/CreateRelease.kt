// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog.tasks

import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction
import toolkits.gradle.changelog.ReleaseCreator
import java.time.LocalDate
import java.time.format.DateTimeFormatter

open class CreateRelease : ChangeLogTask() {
    @Input
    val releaseDate: Property<String> = project.objects.property(String::class.java).convention(DateTimeFormatter.ISO_DATE.format(LocalDate.now()))

    @Input
    val releaseVersion: Property<String> = project.objects.property(String::class.java).convention(project.provider {
        (project.version as String).substringBeforeLast('-')
    })

    @OutputFile
    val releaseFile: RegularFileProperty = project.objects.fileProperty().convention(changesDirectory.file(releaseVersion.map { "$it.json" }))

    @TaskAction
    fun create() {
        val releaseDate = DateTimeFormatter.ISO_DATE.parse(releaseDate.get()).let {
            LocalDate.from(it)
        }

        val releaseEntries = nextReleaseDirectory.jsonFiles()

        val creator = ReleaseCreator(releaseEntries.files, releaseFile.get().asFile)
        creator.create(releaseVersion.get(), releaseDate)
        if (git != null) {
            git.stage(releaseFile.get().asFile.absoluteFile)
            git.stage(nextReleaseDirectory.get().asFile.absoluteFile)
        }
    }
}

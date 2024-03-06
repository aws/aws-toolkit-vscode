// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog.tasks

import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.provider.Provider
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction
import software.aws.toolkits.gradle.changelog.ChangeLogGenerator
import software.aws.toolkits.gradle.changelog.ChangeLogWriter
import software.aws.toolkits.gradle.changelog.GithubWriter
import software.aws.toolkits.gradle.changelog.JetBrainsWriter

abstract class GenerateChangeLog(private val shouldStage: Boolean) : ChangeLogTask() {
    @Input
    @Optional
    val repoUrl: Provider<String?> = project.objects.property(String::class.java).convention("https://github.com/aws/aws-toolkit-jetbrains")

    @Input
    val includeUnreleased: Property<Boolean> = project.objects.property(Boolean::class.java).convention(false)

    @OutputFile
    val changeLogFile: RegularFileProperty = project.objects.fileProperty()

    @TaskAction
    fun generate() {
        val writer = createWriter()
        logger.info("Generating Changelog with $writer")
        val generator = ChangeLogGenerator(listOf(writer), logger)
        if (includeUnreleased.get()) {
            val unreleasedEntries = nextReleaseDirectory.jsonFiles().files

            logger.info("Including ${unreleasedEntries.size} unreleased changes")
            if (unreleasedEntries.isNotEmpty()) {
                generator.addUnreleasedChanges(unreleasedEntries.map { it.toPath() })
            }
        } else {
            logger.info("Skipping unreleased changes")
        }

        generator.addReleasedChanges(changesDirectory.jsonFiles().map { it.toPath() })
        generator.close()

        if (shouldStage) {
            git?.stage(changeLogFile.get().asFile)
        }
    }

    protected abstract fun createWriter(): ChangeLogWriter
}

open class GeneratePluginChangeLog : GenerateChangeLog(false) {
    override fun createWriter(): ChangeLogWriter = JetBrainsWriter(changeLogFile.get().asFile, repoUrl.get())
}

open class GenerateGithubChangeLog : GenerateChangeLog(true) {
    override fun createWriter(): ChangeLogWriter = GithubWriter(changeLogFile.get().asFile.toPath(), repoUrl.get())
}

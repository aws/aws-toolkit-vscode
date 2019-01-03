// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

@file:Suppress("MemberVisibilityCanBePrivate")

import ChangeLogPlugin.Companion.NAME
import org.gradle.api.DefaultTask
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction
import toolkits.gradle.ChangeLogGenerator
import toolkits.gradle.ChangeLogWriter
import toolkits.gradle.ChangeType
import toolkits.gradle.Entry
import toolkits.gradle.GitStager
import toolkits.gradle.GithubWriter
import toolkits.gradle.JetBrainsWriter
import toolkits.gradle.MAPPER
import toolkits.gradle.ReleaseCreator
import java.io.Console
import java.io.File
import java.io.FileFilter
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

class ChangeLogPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        project.extensions.create(NAME, ChangeLogPluginExtension::class.java, project)

        project.tasks.create("generateChangeLog", GenerateChangeLog::class.java) {
            it.description = "Generates CHANGELOG file from release entries"
        }

        project.tasks.create("createRelease", CreateRelease::class.java).apply {
            description = "Generates a release entry from unreleased changelog entries"
        }

        project.tasks.create("newChange", NewChange::class.java).apply {
            description = "Creates a new change entry for inclusion in the Change Log"
        }

        project.tasks.create("newFeature", NewChange::class.java).apply {
            description = "Creates a new feature change entry for inclusion in the Change Log"
            defaultChangeType = ChangeType.FEATURE
        }

        project.tasks.create("newBugFix", NewChange::class.java).apply {
            description = "Creates a new bug-fix change entry for inclusion in the Change Log"
            defaultChangeType = ChangeType.BUGFIX
        }
    }

    internal companion object {
        const val NAME = "changeLog"
    }
}

open class ChangeLogPluginExtension(project: Project) {
    var changesDirectory: File = project.rootProject.file(".changes")
    var nextReleaseDirectory: File = changesDirectory.resolve("next-release")
}

abstract class ChangeLogTask : DefaultTask() {
    protected val git = GitStager.create(project.rootDir)

    @InputDirectory
    var changesDirectory: File = configuration().changesDirectory

    @InputDirectory
    var nextReleaseDirectory: File = configuration().nextReleaseDirectory

    private fun configuration(): ChangeLogPluginExtension = project.rootProject.extensions.findByName(NAME) as ChangeLogPluginExtension
}

open class NewChange : ChangeLogTask() {
    internal var defaultChangeType: ChangeType? = null

    @TaskAction
    fun create() {
        val changeType = if (project.hasProperty("changeType")) {
            (project.property("changeType") as? String?)?.toUpperCase()?.let { ChangeType.valueOf(it) }
        } else defaultChangeType
        val description = if (project.hasProperty("description")) {
            project.property("description") as? String?
        } else null

        val console = System.console()
        val file = when {
            changeType != null && description != null -> createChange(changeType, description)
            console != null -> promptForChange(console, changeType)
            changeType != null -> throw RuntimeException("Cannot determine description - try running with --no-daemon")
            else -> throw RuntimeException("Cannot determine changeType and description - try running with --no-daemon")
        }
        git?.stage(file)
    }

    private fun promptForChange(console: Console, existingChangeType: ChangeType?): File {
        val changeType = existingChangeType ?: promptForChangeType(console)

        val description = console.readLine("> Please enter a change description: ")

        return createChange(changeType, description)
    }

    private fun promptForChangeType(console: Console): ChangeType = console.readLine(
        "\n\n%s\n> Please enter change type (1): ",
        ChangeType.values().mapIndexed { index, changeType -> "${index + 1}. ${changeType.sectionTitle}" }.joinToString("\n")
    ).let {
        if (it.isNotBlank()) {
            ChangeType.values()[it.toInt() - 1]
        } else {
            ChangeType.FEATURE
        }
    }

    private fun createChange(changeType: ChangeType, description: String) = newFile(changeType).apply {
        MAPPER.writerWithDefaultPrettyPrinter().writeValue(this, Entry(changeType, description))
    }

    private fun newFile(changeType: ChangeType): File =
        File(nextReleaseDirectory, "${changeType.name.toLowerCase()}-${UUID.randomUUID()}.json").apply {
            parentFile?.mkdirs()
            createNewFile()
        }
}

open class CreateRelease : ChangeLogTask() {
    @Input
    var releaseDate: String = DateTimeFormatter.ISO_DATE.format(LocalDate.now())

    @Input
    var releaseVersion: String = project.version as String

    @OutputFile
    fun releaseEntry(): File = File(changesDirectory, "$releaseVersion.json")

    @TaskAction
    fun create() {
        val releaseDate = DateTimeFormatter.ISO_DATE.parse(releaseDate).let { LocalDate.from(it) }
        val creator = ReleaseCreator(nextReleaseEntries(), releaseEntry())
        creator.create(releaseVersion, releaseDate)
        if (git != null) {
            git.stage(releaseEntry())
            git.stage(nextReleaseDirectory)
        }
    }

    private fun nextReleaseEntries(): List<File> = nextReleaseDirectory.jsonFiles()
}

open class GenerateChangeLog : ChangeLogTask() {
    @Input
    var includeUnreleased = project.hasProperty("includeUnreleased")

    @Input
    var generateGithub = true

    @Input
    var generateJetbrains = true

    @Input
    @Optional
    var issuesUrl: String? = null

    @OutputFile
    @Optional
    var jetbrainsChangeNotesFile: File? = File("${project.buildDir}/resources/META-INF/change-notes.xml")
        get() = if (generateJetbrains) field else null

    @OutputFile
    @Optional
    var githubChangeLogFile: File? = File(project.relativePath("CHANGELOG.md"))
        get() = if (generateGithub) field else null

    @TaskAction
    fun generate() {
        val writers = createWriters()
        val writer = ChangeLogGenerator(*writers)
        logger.info("Generating Changelog of types: ${writers.toList()}")
        val unreleasedEntries = unreleasedEntries()
        if (includeUnreleased) {
            logger.info("Including ${unreleasedEntries.size} unreleased changes")
            if (unreleasedEntries.isNotEmpty()) {
                writer.unreleased(unreleasedEntries.map { it.toPath() })
            }
        } else {
            logger.info("Skipping unreleased changes")
        }

        writer.generate(releaseEntries().map { it.toPath() })
        writer.flush()

        githubChangeLogFile?.let {
            git?.stage(it)
        }
    }

    private fun createWriters(): Array<out ChangeLogWriter> {
        val writers = mutableListOf<ChangeLogWriter>()
        githubChangeLogFile?.let {
            val changeLog = it.apply { createNewFile() }.toPath()
            writers.add(GithubWriter(changeLog))
        }
        jetbrainsChangeNotesFile?.let {
            it.parentFile.mkdirs()
            writers.add(JetBrainsWriter(it, issuesUrl))
        }
        return writers.toTypedArray()
    }

    private fun unreleasedEntries(): List<File> = if (includeUnreleased) nextReleaseDirectory.jsonFiles() else emptyList()

    private fun releaseEntries(): List<File> = changesDirectory.jsonFiles()
}

internal fun File.jsonFiles(): List<File> = if (this.exists()) {
    this.listFiles(FileFilter { it.isFile && it.name.endsWith(".json") }).toList()
} else {
    emptyList()
}
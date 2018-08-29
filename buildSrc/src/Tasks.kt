// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

@file:Suppress("MemberVisibilityCanBePrivate")

import ChangeLogPlugin.Companion.NAME
import org.gradle.api.DefaultTask
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFiles
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
        project.extensions.create(NAME, ChangeLogPluginExtension::class.java)

        project.tasks.create("generateChangeLog", GenerateChangeLog::class.java).apply {
            description = "Generates CHANGELOG file from release entries"
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

open class ChangeLogPluginExtension {
    var changesDirectory: File? = null
    var nextReleaseDirectory: File? = null
    var releaseVersion: String? = null
    var releaseDate: String? = null
}

abstract class ChangeLogTask : DefaultTask() {
    protected val git = GitStager.create(project.rootDir)

    var changesDirectory = configuration()?.changesDirectory ?: File(project.relativePath(".changes"))
    var nextReleaseDirectory: File = configuration()?.nextReleaseDirectory ?: File(changesDirectory, "next-release")
    var releaseVersion: String = configuration()?.releaseVersion ?: project.version as String
    var releaseDate: String? = configuration()?.releaseDate

    @Input
    protected fun configuration(): ChangeLogPluginExtension? = project.extensions.findByName(NAME) as? ChangeLogPluginExtension?
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

    private fun promptForChangeType(console: Console): ChangeType {
        return console.readLine(
            "\n\n%s\n> Please enter change type (1): ",
            ChangeType.values().mapIndexed { index, changeType -> "${index + 1}. ${changeType.sectionTitle}" }.joinToString("\n")
        ).let {
            if (it.isNotBlank()) {
                ChangeType.values()[it.toInt() - 1]
            } else {
                ChangeType.FEATURE
            }
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

    @InputFiles
    fun nextReleaseEntries(): List<File> = nextReleaseDirectory.jsonFiles()

    @OutputFile
    fun releaseEntry(): File = File(changesDirectory, "$releaseVersion.json")

    @TaskAction
    fun create() {
        val releaseDate = releaseDate?.let { DateTimeFormatter.ISO_DATE.parse(it).let { LocalDate.from(it) } } ?: LocalDate.now()
        val creator = ReleaseCreator(nextReleaseEntries(), releaseEntry())
        creator.create(releaseVersion, releaseDate)
        if (git != null) {
            git.stage(releaseEntry())
            git.stage(nextReleaseDirectory)
        }
    }
}

open class GenerateChangeLog : ChangeLogTask() {

    var includeUnreleased = project.hasProperty("includeUnreleased")
    var generateGithub = true
    var githubChangeLogFile: File = File(project.relativePath("CHANGELOG.md"))
    var generateJetbrains = true
    var issuesUrl: String? = null
    var jetbrainsChangeNotesFile = File("${project.buildDir}/resources/META-INF/change-notes.xml")

    @InputFiles
    fun unreleasedEntries(): List<File> = if (includeUnreleased) nextReleaseDirectory.jsonFiles() else emptyList()

    @InputFiles
    fun releaseEntries(): List<File> = changesDirectory.jsonFiles()

    @OutputFile
    fun githubChangeLogFile(): File? = if (generateGithub) githubChangeLogFile else null

    @OutputFile
    fun jetbrainsChangeNotesFile(): File? = if (generateJetbrains) {
        jetbrainsChangeNotesFile
    } else {
        null
    }

    @TaskAction
    fun generate() {
        val writer = ChangeLogGenerator(*createWriters())
        if (includeUnreleased && unreleasedEntries().isNotEmpty()) {
            writer.unreleased(unreleasedEntries().map { it.toPath() })
        }
        writer.generate(releaseEntries().map { it.toPath() })
        writer.flush()
        val githubFile = githubChangeLogFile()
        if (githubFile != null) {
            git?.stage(githubFile)
        }
    }

    private fun createWriters(): Array<out ChangeLogWriter> {
        val writers = mutableListOf<ChangeLogWriter>()
        val githubFile = githubChangeLogFile()
        if (githubFile != null) {
            val changeLog = githubFile.apply { createNewFile() }.toPath()
            writers.add(GithubWriter(changeLog))
        }
        val changeNotesFile = jetbrainsChangeNotesFile()
        if (changeNotesFile != null) {
            changeNotesFile.parentFile.mkdirs()
            changeNotesFile.createNewFile()
            writers.add(JetBrainsWriter(changeNotesFile, issuesUrl))
        }
        return writers.toTypedArray()
    }
}

internal fun File.jsonFiles(): List<File> = if (this.exists()) {
    this.listFiles(FileFilter { it.isFile && it.name.endsWith(".json") }).toList()
} else {
    emptyList()
}
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
import toolkits.gradle.ChangeType
import toolkits.gradle.Entry
import toolkits.gradle.GitStager
import toolkits.gradle.GithubWriter
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

        project.tasks.create("generateChangeLog", GenerateGitHubChangeLog::class.java).apply {
            description = "Generates GitHub CHANGELOG file from release entries"
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
    var changesDirectory: File = File(project.relativePath(".changes"))
    var githubChangeLogFile: File = File(project.relativePath("CHANGELOG.md"))
    var nextReleaseDirectory: File = File(changesDirectory, "next-release")
    var releaseVersion: String = project.version as String
    var releaseDate: String? = null
}

abstract class ChangeLogTask : DefaultTask() {
    protected val git = GitStager.create(project.rootDir)

    @Input
    protected fun configuration(): ChangeLogPluginExtension = project.extensions.findByName(NAME) as ChangeLogPluginExtension
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
        File(configuration().nextReleaseDirectory, "${changeType.name.toLowerCase()}-${UUID.randomUUID()}.json").apply {
            parentFile?.mkdirs()
            createNewFile()
        }
}

open class CreateRelease : ChangeLogTask() {

    @InputFiles
    fun nextReleaseEntries(): List<File> = configuration().nextReleaseDirectory.jsonFiles()

    @OutputFile
    fun releaseEntry(): File = File(configuration().changesDirectory, "${configuration().releaseVersion}.json")

    @TaskAction
    fun create() {
        val releaseDate = configuration().releaseDate?.let { DateTimeFormatter.ISO_DATE.parse(it).let { LocalDate.from(it) } } ?: LocalDate.now()
        val creator = ReleaseCreator(nextReleaseEntries(), releaseEntry())
        creator.create(configuration().releaseVersion, releaseDate)
        if (git != null) {
            git.stage(releaseEntry())
            git.stage(configuration().nextReleaseDirectory)
        }
    }
}

open class GenerateGitHubChangeLog : ChangeLogTask() {

    var includeUnreleased = true

    @InputFiles
    fun nextReleaseEntries(): List<File> = if (includeUnreleased) configuration().nextReleaseDirectory.jsonFiles() else emptyList()

    @InputFiles
    fun releaseEntries(): List<File> = configuration().changesDirectory.jsonFiles()

    @OutputFile
    fun githubChangeLogFile(): File = configuration().githubChangeLogFile

    @TaskAction
    fun generate() {
        val changeLog = githubChangeLogFile().apply { createNewFile() }.toPath()
        val writer = ChangeLogGenerator(GithubWriter(changeLog))
        if (includeUnreleased) {
            writer.unreleased(nextReleaseEntries().map { it.toPath() })
        }
        writer.generate(releaseEntries().map { it.toPath() })
        writer.flush()
        git?.stage(githubChangeLogFile())
    }
}

internal fun File.jsonFiles(): List<File> = if (this.exists()) {
    this.listFiles(FileFilter { it.isFile && it.name.endsWith(".json") }).toList()
} else {
    emptyList()
}
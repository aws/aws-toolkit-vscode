package toolkits.gradle

import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.SerializerProvider
import com.fasterxml.jackson.databind.annotation.JsonSerialize
import com.fasterxml.jackson.databind.ser.std.StdSerializer
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import java.io.BufferedWriter
import java.io.File
import java.nio.file.Path
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.streams.toList

val MAPPER: ObjectMapper = jacksonObjectMapper().registerModule(JavaTimeModule()).enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS)
    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

interface ChangeLogWriter {
    fun write(entry: ReleaseEntry)
    fun flush()
}

class GithubWriter(file: Path) : ChangeLogWriter {

    private val writer = file.toFile().bufferedWriter()

    override fun write(entry: ReleaseEntry) {
        writer.writeLine("# _${entry.version}_ (${DateTimeFormatter.ISO_DATE.format(entry.date)})")

        val entries = entry.entries.groupBy { it.type }

        ChangeType.values().forEach { type ->
            entries[type]?.run { writer.writeSection(type.sectionTitle, this.map { it.description }) }
        }
        writer.newLine()
    }

    override fun flush() {
        writer.flush()
        writer.close()
    }

    private companion object {
        fun BufferedWriter.writeLine(text: String) {
            write(text)
            newLine()
        }

        fun BufferedWriter.writeSection(section: String, entries: List<String>) {
            entries.forEach {
                val lines = it.lines()
                writeLine("  - **($section)** ${lines.first().trim()}")
                lines.takeLast(lines.size - 1).map { "    ${it.trim()}" }.forEach { writeLine(it) }
            }
        }
    }
}

class ChangeLogGenerator(private vararg val writers: ChangeLogWriter) {

    fun unreleased(unreleasedFiles: List<Path>) {
        val entries = unreleasedFiles.parallelStream().map { readFile<Entry>(it.toFile()) }.toList().filterNotNull()
        val unreleasedEntry = ReleaseEntry(LocalDate.now(), "Pending Release", entries)
        writers.forEach { writer -> writer.write(unreleasedEntry) }
    }

    fun generate(changelogFiles: List<Path>) {
        val verifier = EnsureVersionUnique()
        changelogFiles.parallelStream().map { readFile<ReleaseEntry>(it.toFile()) }.toList()
            .onEach { verifier.verify(it.version) }
            .sortedByDescending { it.date }
            .forEach { writers.forEach { writer -> writer.write(it) } }
    }

    fun flush() {
        writers.forEach { it.flush() }
    }

    private class EnsureVersionUnique {
        val versions = mutableSetOf<String>()

        fun verify(version: String) {
            if (!versions.add(version)) {
                throw RuntimeException("Duplicate version $version found")
            }
        }
    }
}

class ReleaseCreator(private val unreleasedFiles: List<File>, private val nextReleaseFile: File) {
    init {
        if (nextReleaseFile.exists()) {
            throw RuntimeException("Release file $nextReleaseFile already exists!")
        }
        if (unreleasedFiles.isEmpty()) {
            throw RuntimeException("No unreleased changes!")
        }
    }

    fun create(version: String, date: LocalDate = LocalDate.now()) {
        val entries = unreleasedFiles.map { readFile<Entry>(it) }
        val release = ReleaseEntry(date, version, entries)

        MAPPER.writerWithDefaultPrettyPrinter().writeValue(nextReleaseFile, release)
        unreleasedFiles.forEach { it.delete() }
    }
}

private inline fun <reified T : Any> readFile(f: File): T {
    try {
        return MAPPER.readValue(f)
    } catch (e: Exception) {
        throw RuntimeException("Exception reading ${T::class.java} from $f", e)
    }
}

@JsonSerialize(using = ChangeType.Serializer::class)
enum class ChangeType(val sectionTitle: String) {
    FEATURE("Feature"), BUGFIX("Bug Fix"), DEPRECATION("Deprecation"), REMOVAL("Removal");

    class Serializer : StdSerializer<ChangeType>(ChangeType::class.java) {
        override fun serialize(value: ChangeType, gen: JsonGenerator?, provider: SerializerProvider?) {
            gen?.writeString(value.name.toLowerCase())
        }
    }
}

data class Entry(val type: ChangeType, val description: String)

data class ReleaseEntry(
    val date: LocalDate,
    val version: String,
    val entries: List<Entry>
)
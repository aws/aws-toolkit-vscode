// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

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
import org.gradle.api.logging.Logging
import java.io.File
import java.nio.file.Path
import java.time.LocalDate
import kotlin.streams.toList

val MAPPER: ObjectMapper = jacksonObjectMapper().registerModule(JavaTimeModule()).enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS)
    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

interface ChangeLogWriter {
    fun write(entry: ReleaseEntry)
    fun flush()
}

class ChangeLogGenerator(private vararg val writers: ChangeLogWriter) {

    fun unreleased(unreleasedFiles: List<Path>) {
        val entries = unreleasedFiles.parallelStream().map { readFile<Entry>(it.toFile()) }.toList().filterNotNull()
        val unreleasedEntry = ReleaseEntry(LocalDate.now(), "Pending Release", entries)
        LOGGER.info("Adding unreleased entry: $unreleasedEntry")
        writers.forEach { writer -> writer.write(unreleasedEntry) }
    }

    fun generate(changelogFiles: List<Path>) {
        val verifier = EnsureVersionUnique()
        LOGGER.info("Including release change logs: $changelogFiles")
        changelogFiles.parallelStream().map { readFile<ReleaseEntry>(it.toFile()) }.toList()
            .onEach { verifier.verify(it.version) }
            .sortedByDescending { it.date }
            .forEach {
                LOGGER.info("Adding release entry: $it")
                writers.forEach { writer -> writer.write(it) }
            }
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

    companion object {
        private val LOGGER = Logging.getLogger(ChangeLogGenerator::class.java)
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
        val entriesByType = unreleasedFiles.map { readFile<Entry>(it) }.groupBy { it.type }
        val entries = ChangeType.values().flatMap { entriesByType.getOrDefault(it, emptyList()) }
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
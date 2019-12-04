// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import org.gradle.api.logging.Logging
import java.nio.file.Path
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.streams.toList

/* ktlint-disable custom-ktlint-rules:log-not-lazy */
/**
 * Generates a combined change log file based in Markdown syntax
 */
class ChangeLogGenerator(private val writers: List<ChangeLogWriter>) {
    fun addUnreleasedChanges(unreleasedFiles: List<Path>) {
        val entries = unreleasedFiles.parallelStream()
            .map { readFile<Entry>(it.toFile()) }
            .toList().filterNotNull()
        val unreleasedEntry = ReleaseEntry(LocalDate.now(), "Pending Release", entries)
        LOGGER.info("Adding unreleased entry: $unreleasedEntry")
        generateEntry(unreleasedEntry)
    }

    fun addReleasedChanges(changelogFiles: List<Path>) {
        val versions = mutableSetOf<String>()

        LOGGER.info("Including release change logs: $changelogFiles")
        changelogFiles.parallelStream()
            .map { readFile<ReleaseEntry>(it.toFile()) }
            .toList()
            .onEach {
                val version = it.version
                if (!versions.add(version)) {
                    throw RuntimeException("Duplicate version $version found")
                }
            }
            .sortedByDescending { it.date }
            .forEach {
                LOGGER.info("Adding release entry: $it")
                generateEntry(it)
            }
    }

    private fun generateEntry(entry: ReleaseEntry) {
        val renderedEntry = renderEntry(entry)
        writers.forEach { writer ->
            writer.writeLine(renderedEntry)
        }
    }

    fun close() {
        writers.forEach { it.close() }
    }

    companion object {
        private val LOGGER = Logging.getLogger(ChangeLogGenerator::class.java)

        fun renderEntry(releaseEntry: ReleaseEntry): String {
            val renderedEntry = StringBuilder()

            renderedEntry.append("# _${releaseEntry.version}_ (${DateTimeFormatter.ISO_DATE.format(releaseEntry.date)})")
                .append('\n')
            releaseEntry.entries.forEach { entry ->
                val lines = entry.description.lines()

                // Note: 2 spaces are on end for hard breaks in Markdown
                renderedEntry.append("- **(${entry.type.sectionTitle})** ${lines.first().trim()}\n")
                for (it in lines.takeLast(lines.size - 1)) {
                    val line = it.trim()
                    if (line.isEmpty()) {
                        continue
                    }

                    renderedEntry.append("  $line").append('\n')
                }
            }

            renderedEntry.append('\n')

            return renderedEntry.toString()
        }
    }
}

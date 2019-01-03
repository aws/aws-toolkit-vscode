// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle

import java.io.BufferedWriter
import java.nio.file.Path
import java.time.format.DateTimeFormatter

class GithubWriter(private val file: Path) : ChangeLogWriter {

    private val writer = file.toFile().bufferedWriter()

    override fun write(entry: ReleaseEntry) {
        writer.writeLine("# _${entry.version}_ (${DateTimeFormatter.ISO_DATE.format(entry.date)})")
        entry.entries.forEach { writer.writeEntry(it) }
        writer.newLine()
    }

    override fun flush() {
        writer.flush()
        writer.close()
    }

    override fun toString(): String = "GithubWriter(file=$file)"

    private companion object {
        fun BufferedWriter.writeLine(text: String) {
            write(text)
            newLine()
        }

        fun BufferedWriter.writeEntry(entry: Entry) {
            val lines = entry.description.lines()
            writeLine("  - **(${entry.type.sectionTitle})** ${lines.first().trim()}")
            lines.takeLast(lines.size - 1).map { "    ${it.trim()}" }.forEach { writeLine(it) }
        }
    }
}
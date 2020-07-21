// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import java.io.File
import java.time.LocalDate

class ReleaseCreator(private val unreleasedFiles: Collection<File>, private val nextReleaseFile: File) {
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

// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog

import org.gradle.api.logging.Logger
import java.io.File
import java.time.LocalDate

class ReleaseCreator(private val unreleasedFiles: Collection<File>, private val nextReleaseFile: File, logger: Logger) {
    init {
        if (nextReleaseFile.exists()) {
            throw RuntimeException("Release file $nextReleaseFile already exists!")
        }
        if (unreleasedFiles.isEmpty()) {
            logger.warn("Release created without any unreleased change files, this will yield an empty changelog")
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

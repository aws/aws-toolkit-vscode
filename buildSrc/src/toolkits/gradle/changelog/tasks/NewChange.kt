// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog.tasks

import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.TaskAction
import toolkits.gradle.changelog.ChangeType
import toolkits.gradle.changelog.Entry
import toolkits.gradle.changelog.MAPPER
import java.io.File
import java.util.Scanner
import java.util.UUID

open class NewChange : ChangeLogTask() {
    @get:Internal
    internal var defaultChangeType: ChangeType? = null

    @TaskAction
    fun create() {
        val changeType = if (project.hasProperty("changeType")) {
            (project.property("changeType") as? String?)?.toUpperCase()?.let { ChangeType.valueOf(it) }
        } else defaultChangeType
        val description = if (project.hasProperty("description")) {
            project.property("description") as? String?
        } else null

        val input = Scanner(System.`in`)
        val file = when {
            changeType != null && description != null -> createChange(changeType, description)
            else -> promptForChange(input, changeType)
        }
        git?.stage(file)
    }

    private fun promptForChange(input: Scanner, existingChangeType: ChangeType?): File {
        val changeType = existingChangeType ?: promptForChangeType(input)

        logger.lifecycle("> Please enter a change description: ")
        val description = input.nextLine()

        return createChange(changeType, description)
    }

    private fun promptForChangeType(input: Scanner): ChangeType {
        val changeList = ChangeType.values()
            .mapIndexed { index, changeType -> "${index + 1}. ${changeType.sectionTitle}" }
            .joinToString("\n")
        val newFeatureIndex = ChangeType.FEATURE.ordinal + 1
        logger.lifecycle("\n$changeList\n> Please enter change type ($newFeatureIndex): ")

        return input.nextLine().let {
            if (it.isNotBlank()) {
                ChangeType.values()[it.toInt() - 1]
            } else {
                ChangeType.FEATURE
            }
        }
    }

    private fun createChange(changeType: ChangeType, description: String) = newFile(changeType).apply {
        MAPPER.writerWithDefaultPrettyPrinter().writeValue(this,
            Entry(changeType, description)
        )
    }

    private fun newFile(changeType: ChangeType) = nextReleaseDirectory.file("${changeType.name.toLowerCase()}-${UUID.randomUUID()}.json").get().asFile.apply {
            parentFile?.mkdirs()
            createNewFile()
        }
}

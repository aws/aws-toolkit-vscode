// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle

import org.gradle.api.Project
import java.io.File
import java.io.FileFilter

/**
 * Determines the sub-folders under a project that should be included based on ideVersion
 *
 * [project] the project to use as a directory base
 * [type] is the type of the source folder (e.g. 'src', 'tst', 'resources')
 * [ideProfile] is the IDE [Profile] currently configured in the project
 */
fun findFolders(project: Project, type: String, ideProfile: Profile): Set<File> = project.projectDir.listFiles(
    FileFilter {
        it.isDirectory && includeFolder(type, ideProfile.shortName, it.name)
    }
)?.map { File(it.name) }?.toSet() ?: setOf()

/**
 * Determines if a folder should be included based on the ideVersion being targeted
 * [type] is the type of the source folder (e.g. 'src', 'tst', 'resources')
 * [ideVersion] is the 3 digit numerical version of the JetBrains SDK (e.g. 192, 201 etc)
 * [folderName] is the folder name to match on, relative to the project directory (e.g. 'tst-201')
 *
 * Examples:
 * Given [includeFolder] is called with a [type] of "tst" and an [ideVersion] of "201"
 *
 * Then following will match:
 *  - tst
 *  - tst-201
 *  - tst-201+
 *  - tst-192+
 *  - tst-201-202
 *
 * The following with *not* match:
 *  - tst-resources
 *  - tst-resources-201
 *  - tst-192
 *  - tst-202
 *  - tst-202+
 */
internal fun includeFolder(type: String, ideVersion: String, folderName: String): Boolean {
    val ideVersionAsInt = ideVersion.toInt()
    // Check version range first
    "$type-(\\d{3})-(\\d{3})".toRegex().matchEntire(folderName)?.destructured?.let { (minVersion, maxVersion) ->
        return ideVersionAsInt in minVersion.toInt()..maxVersion.toInt()
    }
    // Then check singular versions/min+
    val (_, version, plus) = "$type(-(\\d{3}))?(\\+)?".toRegex().matchEntire(folderName)?.destructured ?: return false
    return when {
        version.isBlank() -> true
        plus.isBlank() -> version.toInt() == ideVersionAsInt
        else -> version.toInt() <= ideVersionAsInt
    }
}

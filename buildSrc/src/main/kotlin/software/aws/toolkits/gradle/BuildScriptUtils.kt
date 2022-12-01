// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle

import org.eclipse.jgit.api.Git
import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.api.provider.Provider
import software.aws.toolkits.gradle.intellij.IdeVersions
import java.io.IOException

/**
 * Only run the given block if this build is running within a CI system (e.g. GitHub actions, CodeBuild etc)
 */
fun Project.ciOnly(block: () -> Unit) {
    if (isCi()) {
        block()
    }
}

fun Project.isCi() : Boolean = providers.environmentVariable("CI").isPresent

fun Project.jvmTarget(): Provider<JavaVersion> {
    val name = IdeVersions.ideProfile(providers).map { it.name }
    return name.map {
        when (it) {
            "2021.3", "2022.1", "2022.2" -> JavaVersion.VERSION_11
            else -> JavaVersion.VERSION_17
        }
    }
}

val kotlinTarget = "1.5"

fun Project.buildMetadata() =
    try {
        val git = Git.open(rootDir)
        val currentShortHash = git.repository.findRef("HEAD").objectId.abbreviate(7).name()
        val isDirty = git.status().call().hasUncommittedChanges()

        buildString {
            append(currentShortHash)

            if (isDirty) {
                append(".modified")
            }
        }
    } catch(e: IOException) {
        logger.warn("Could not determine current commit", e)

        "unknownCommit"
    }

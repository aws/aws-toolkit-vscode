// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle

import org.eclipse.jgit.api.Git
import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.api.provider.Provider
import software.aws.toolkits.gradle.intellij.IdeVersions
import java.io.IOException
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion as KotlinVersionEnum

/**
 * Only run the given block if this build is running within a CI system (e.g. GitHub actions, CodeBuild etc)
 */
fun Project.ciOnly(block: () -> Unit) {
    if (isCi()) {
        block()
    }
}

fun Project.isCi() : Boolean = providers.environmentVariable("CI").isPresent

fun Project.jvmTarget(): Provider<JavaVersion> = withCurrentProfileName {
    JavaVersion.VERSION_17
}

// https://plugins.jetbrains.com/docs/intellij/using-kotlin.html#other-bundled-kotlin-libraries
fun Project.kotlinTarget(): Provider<String> = withCurrentProfileName {
    when (it) {
        "2022.3" -> KotlinVersionEnum.KOTLIN_1_7
        "2023.1", "2023.2" -> KotlinVersionEnum.KOTLIN_1_8
        "2023.3", "2024.1" -> KotlinVersionEnum.KOTLIN_1_9
        else -> error("not set")
    }.version
}

fun<T : Any> Project.withCurrentProfileName(consumer: (String) -> T): Provider<T> {
    val name = IdeVersions.ideProfile(providers).map { it.name }
    return name.map {
        consumer(it)
    }
}

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

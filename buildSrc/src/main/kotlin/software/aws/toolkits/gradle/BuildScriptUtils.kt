// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle

import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.api.provider.Provider
import software.aws.toolkits.gradle.intellij.IdeVersions

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

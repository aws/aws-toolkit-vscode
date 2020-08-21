// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle

import org.gradle.api.GradleException
import org.gradle.api.Project
import org.gradle.api.Task
import org.gradle.api.UnknownDomainObjectException
import org.gradle.api.tasks.SourceSet
import org.gradle.api.tasks.SourceSetContainer
import org.jetbrains.intellij.IntelliJPluginExtension

inline fun <reified T : Task> Project.removeTask() {
    // For some reason in buildSrc, we can't use the <> version
    tasks.withType(T::class.java) {
        enabled = false
    }
}

/* When we dynamically apply(plugin = "org.jetbrains.intellij"), we do not get the nice extension functions
 * pulled into scope. This function hides that fact, and gives a better error message when it fails.
 */
fun Project.intellij(block: IntelliJPluginExtension.() -> Unit) {
    val intellij = try {
        project.extensions.getByType(IntelliJPluginExtension::class.java)
    } catch (e: Exception) {
        throw GradleException("Unable to get extension intellij, did you apply(plugin = \"org.jetbrains.intellij\")?", e)
    }
    intellij.block()
}

fun SourceSetContainer.getOrCreate(sourceSet: String, block: SourceSet.() -> Unit) {
    try {
        getByName(sourceSet).block()
    } catch (e: UnknownDomainObjectException) {
        create(sourceSet).block()
    }
}

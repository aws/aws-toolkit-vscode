// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.resources

import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.file.ConfigurableFileCollection
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction
import org.gradle.language.base.plugins.LifecycleBasePlugin.VERIFICATION_GROUP
import java.time.Instant

open class ValidateMessages : DefaultTask() {
    private companion object {
        const val COPYRIGHT_HEADER_LINES = 2
    }
    @InputFiles
    val paths: ConfigurableFileCollection = project.objects.fileCollection()

    @OutputFile
    val output: RegularFileProperty = project.objects.fileProperty().convention {
        project.buildDir.resolve("validateMessages")
    }

    init {
        group = VERIFICATION_GROUP
    }

    @TaskAction
    fun validateMessage() {
        var hasError = false
        paths
            .map { it.absolutePath to it.readLines() }
            .forEach { (filePath, fileLines) ->
                fileLines
                    // filter out blank lines and comments
                    .filter { it.isNotBlank() && it.trim().firstOrNull() != '#' }
                    .mapIndexed { lineNumber, it ->
                        if (it.contains("=")) {
                            it
                        } else {
                            logger.error(""""$filePath:${lineNumber + COPYRIGHT_HEADER_LINES} contains invalid message missing a '=': "$it"""")
                            hasError = true
                            null
                        }
                    }
                    .filterNotNull()
                    .map { it.split("=").first() }
                    .reduceIndexed { lineNumber, item1, item2 ->
                        if (item1 > item2) {
                            logger.error("""$filePath:${lineNumber + COPYRIGHT_HEADER_LINES} is not sorted:"$item1" > "$item2"""")
                            hasError = true
                        }

                        item2
                    }
                if (hasError) {
                    throw GradleException("$filePath has one or more out of order items!")
                }
            }

        // Write the current time to the file so it will be cacheable (gradle can only use files to determine up to date checks)
        output.asFile.get().writeText(Instant.now().toString())
    }
}

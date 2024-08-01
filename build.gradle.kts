// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import org.jetbrains.gradle.ext.ProjectSettings
import org.jetbrains.gradle.ext.TaskTriggersConfig
import software.aws.toolkits.gradle.changelog.tasks.GenerateGithubChangeLog

plugins {
    id("base")
    id("toolkit-changelog")
    id("toolkit-git-secrets")
    id("toolkit-jacoco-report")
    id("org.jetbrains.gradle.plugin.idea-ext")
}

allprojects {
    configurations.configureEach {
        resolutionStrategy {
            // need to figure out how to fail only on non-platform dependencies
//            failOnNonReproducibleResolution()
        }
    }
}

val generateChangeLog = tasks.register<GenerateGithubChangeLog>("generateChangeLog") {
    mustRunAfter(tasks.createRelease)
    changeLogFile.set(project.file("CHANGELOG.md"))
}

tasks.createRelease.configure {
    releaseVersion.set(providers.gradleProperty("toolkitVersion"))
}

dependencies {
    aggregateCoverage(project(":plugin-toolkit:intellij-standalone"))
    aggregateCoverage(project(":plugin-core"))
    aggregateCoverage(project(":plugin-amazonq"))

    project.findProject(":plugin-toolkit:jetbrains-gateway")?.let {
        aggregateCoverage(it)
    }

    aggregateCoverage(project(":ui-tests"))
}

tasks.register("runIde") {
    doFirst {
        throw GradleException("Use project specific runIde command, i.e. :plugin-toolkit:intellij-standalone:runIde")
    }
}

if (idea.project != null) { // may be null during script compilation
    idea {
        project {
            settings {
                taskTriggers {
                    afterSync(":plugin-core:sdk-codegen:generateSdks")
                    afterSync(":plugin-core:jetbrains-community:generateTelemetry")
                }
            }
        }
    }
}

fun org.gradle.plugins.ide.idea.model.IdeaProject.settings(configuration: ProjectSettings.() -> Unit) = (this as ExtensionAware).configure(configuration)
fun ProjectSettings.taskTriggers(action: TaskTriggersConfig.() -> Unit, ) = (this as ExtensionAware).extensions.configure("taskTriggers", action)

// is there a better way to do this?
// coverageReport has implicit dependency on 'test' outputs since the task outputs the test.exec file
tasks.coverageReport {
    mustRunAfter(rootProject.subprojects.map { it.tasks.withType<AbstractTestTask>() })
}

allprojects {
    tasks.configureEach {
        if (this is JavaForkOptions) {
            jvmArgs("-XX:ErrorFile=${rootProject.file("build/reports").absolutePath}/hs_err_pid%p.log")
            if (System.getProperty("os.name").contains("Windows")) {
                jvmArgs("-XX:OnError=powershell.exe ${rootProject.file("dump.ps1")}")
            } else {
                jvmArgs("-XX:OnError=ps auxww")
            }
        }
    }
}

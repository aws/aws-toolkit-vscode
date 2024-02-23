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
    repositories {
        val codeArtifactUrl: Provider<String> = providers.environmentVariable("CODEARTIFACT_URL")
        val codeArtifactToken: Provider<String> = providers.environmentVariable("CODEARTIFACT_AUTH_TOKEN")
        if (codeArtifactUrl.isPresent && codeArtifactToken.isPresent) {
            maven {
                url = uri(codeArtifactUrl.get())
                credentials {
                    username = "aws"
                    password = codeArtifactToken.get()
                }
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }

    configurations.all {
        resolutionStrategy {
            failOnDynamicVersions()
            failOnChangingVersions()
        }
    }
}

val generateChangeLog = tasks.register<GenerateGithubChangeLog>("generateChangeLog") {
    changeLogFile.set(project.file("CHANGELOG.md"))
}

tasks.createRelease.configure {
    mustRunAfter(generateChangeLog)

    releaseVersion.set(providers.gradleProperty("toolkitVersion"))
}

dependencies {
    aggregateCoverage(project(":plugin-toolkit:intellij"))

    project.findProject(":plugin-toolkit:jetbrains-gateway")?.let {
        aggregateCoverage(it)
    }

    aggregateCoverage(project(":ui-tests"))
}

tasks.register("runIde") {
    doFirst {
        throw GradleException("Use project specific runIde command, i.e. :plugin-toolkit:jetbrains-core:runIde, :plugin-toolkit:intellij:runIde")
    }
}

if (idea.project != null) { // may be null during script compilation
    idea {
        project {
            settings {
                taskTriggers {
                    afterSync(":plugin-core:sdk-codegen:generateSdks")
                    afterSync(":plugin-toolkit:jetbrains-core:generateTelemetry")
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

// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
val codeArtifactMavenRepo = fun RepositoryHandler.(): MavenArtifactRepository? {
    val codeArtifactUrl: Provider<String> = providers.environmentVariable("CODEARTIFACT_URL")
    val codeArtifactToken: Provider<String> = providers.environmentVariable("CODEARTIFACT_AUTH_TOKEN")
    return if (codeArtifactUrl.isPresent && codeArtifactToken.isPresent) {
        maven {
            url = uri(codeArtifactUrl.get())
            credentials {
                username = "aws"
                password = codeArtifactToken.get()
            }
        }
    } else {
        null
    }
}.also {
    pluginManagement {
        repositories {
            it()
            gradlePluginPortal()
        }
    }
}

dependencyResolutionManagement {
    versionCatalogs {
        create("libs") {
            from(files("../gradle/libs.versions.toml"))

            apply(from = "../kotlinResolution.settings.gradle.kts")
        }
    }

    repositories {
        codeArtifactMavenRepo()
        mavenCentral()
        gradlePluginPortal()
        maven {
            url = uri("https://oss.sonatype.org/content/repositories/snapshots/")
            content {
                // only allowed to pull snapshots of gradle-intellij-plugin from here
                includeModule("org.jetbrains.intellij", "org.jetbrains.intellij.gradle.plugin")
                includeModule("org.jetbrains.intellij.plugins", "gradle-intellij-plugin")
            }
        }
    }
}

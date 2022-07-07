// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
pluginManagement {
    repositories {
        val codeArtifactMavenRepo: ((RepositoryHandler) -> Unit)? by extra
        codeArtifactMavenRepo?.invoke(this)
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    versionCatalogs {
        create("libs") {
            from(files("../gradle/libs.versions.toml"))
        }
    }

    repositories {
        val codeArtifactMavenRepo: ((RepositoryHandler) -> Unit)? by extra
        codeArtifactMavenRepo?.invoke(this)
        mavenCentral()
        gradlePluginPortal()
        maven {
            url = uri("https://oss.sonatype.org/content/repositories/snapshots/")
            content {
                // only allowed to pull snapshots of gradle-intellij-plugin from here
                includeModule("org.jetbrains.intellij", "org.jetbrains.intellij.gradle.plugin")
            }
        }
    }
}

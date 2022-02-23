// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
val codeArtifactUrl: Provider<String> = providers.environmentVariable("CODEARTIFACT_URL").forUseAtConfigurationTime()
val codeArtifactToken: Provider<String> = providers.environmentVariable("CODEARTIFACT_AUTH_TOKEN").forUseAtConfigurationTime()

dependencyResolutionManagement {
    versionCatalogs {
        // TODO: Using "libs" seems to confuse Intellij?
        create("deps") {
            from(files("../gradle/libs.versions.toml"))
        }
    }

    repositories {
        if (codeArtifactUrl.isPresent && codeArtifactToken.isPresent) {
            println("Using CodeArtifact proxy: ${codeArtifactUrl.get()}")
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
        maven {
            url = uri("https://oss.sonatype.org/content/repositories/snapshots/")
            content {
                // only allowed to pull snapshots of gradle-intellij-plugin from here
                includeModule("org.jetbrains.intellij.plugins", "gradle-intellij-plugin")
            }
            mavenContent {
                snapshotsOnly()
            }
        }
    }
}

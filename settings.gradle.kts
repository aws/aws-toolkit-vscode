// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import kotlin.collections.ArrayDeque
import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

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

plugins {
    id("com.github.burrunan.s3-build-cache") version "1.5"
    id("com.gradle.develocity") version "3.17.6"
    id("org.jetbrains.intellij.platform.settings") version "2.0.0"
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        codeArtifactMavenRepo()
        mavenCentral()

        intellijPlatform {
            defaultRepositories()
            jetbrainsRuntime()
        }
    }
}

buildscript {
    // match with version catalog, s3-build-cache has silent classpath conflict with codegen task
    // also since this is a settings plugin, we can't use a version catalog
    dependencies {
        classpath(platform("software.amazon.awssdk:bom:2.26.25"))
    }
}

val regionEnv: Provider<String> = providers.environmentVariable("AWS_REGION")
val bucketEnv: Provider<String> = providers.environmentVariable("S3_BUILD_CACHE_BUCKET")
val prefixEnv: Provider<String> = providers.environmentVariable("S3_BUILD_CACHE_PREFIX")
if (regionEnv.isPresent && bucketEnv.isPresent && prefixEnv.isPresent) {
    // TODO: can we serve a remote cache out of CloudFront instead? https://docs.gradle.org/8.1/userguide/build_cache.html#sec:build_cache_configure_remote
    buildCache {
        local {
            isEnabled = false
        }

        remote<com.github.burrunan.s3cache.AwsS3BuildCache> {
            region = regionEnv.get()
            bucket = bucketEnv.get()
            prefix = prefixEnv.get()
            isPush = true
            lookupDefaultAwsCredentials = true
        }
    }
}

develocity {
    buildScan {
        // only publish with `--scan` argument
        publishing.onlyIf { false }

        if (System.getenv("CI") == "true") {
            termsOfUseUrl = "https://gradle.com/help/legal-terms-of-use"
            termsOfUseAgree = "yes"
        }

        obfuscation {
            username { "<username>" }
            hostname { "<hostname>" }
            ipAddresses { it.map { "0.0.0.0" } }
        }
    }
}
apply(from = "kotlinResolution.settings.gradle.kts")

rootProject.name = "aws-toolkit-jetbrains"

include("detekt-rules")
include("ui-tests")
include("sandbox-all")
when (providers.gradleProperty("ideProfileName").get()) {
    "2023.3", "2024.1" -> include("tmp-all")
}

/*
plugins/
    core/                       :plugin-core
        community/              :plugin-core:community
        ultimate/               :plugin-core:ultimate
        ...
    toolkit/                    :plugin-toolkit
        resources/              :plugin-toolkit:resources
        ...
    amazonq/                    :plugin-amazonq
        codewhisperer/          :plugin-amazonq:codewhisperer
            community/          :plugin-amazonq:codewhisperer:ultimate
            ultimate/           :plugin-amazonq:codewhisperer:community
        codemodernizer/         ...
            community/          ...
            ultimate/
        featuredev/
            community/
            ultimate/
        mynah-ui/               :plugin-amazonq:mynah-ui
 */
file("plugins").listFiles()?.forEach root@ {
    if (!it.isDirectory) return@root

    val pluginRoot = "plugin-${it.name}"
    include(":$pluginRoot")
    project(":$pluginRoot").projectDir = it

    val path = ArrayDeque<String>()
    it.walk().maxDepth(3)
        .onEnter {
            // dont bother traversing a directory if it does not declare a subproject
            if (!it.resolve("build.gradle.kts").isFile) {
                return@onEnter false
            }

            if (path.isEmpty()) {
                path.addLast("plugin-${it.name}")
            } else {
                path.addLast(it.name)
            }
            return@onEnter true
        }
        .onLeave {
            path.removeLastOrNull()
        }
        .filter { it.isDirectory && it.resolve("build.gradle.kts").isFile }
        .iterator()
        .forEach {
            if (it.name == "jetbrains-gateway") {
                when (providers.gradleProperty("ideProfileName").get()) {
                    // buildSrc is evaluated after settings so we can't key off of IdeVersions.kt
                    "2023.3", "2024.1" -> {
                        return@forEach
                    }
                }
            }

            val projectName = path.joinToString(separator = ":", prefix = ":")
            include(projectName)
            project(projectName).projectDir = it
        }
}

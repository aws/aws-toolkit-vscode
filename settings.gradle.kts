// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import kotlin.collections.ArrayDeque

pluginManagement {
    repositories {
        val codeArtifactUrl: Provider<String> = providers.environmentVariable("CODEARTIFACT_URL")
        val codeArtifactToken: Provider<String> = providers.environmentVariable("CODEARTIFACT_AUTH_TOKEN")
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
        gradlePluginPortal()
    }
}

buildscript {
    // match with version catalog, s3-build-cache has silent classpath conflict with codegen task
    // also since this is a settings plugin, we can't use a version catalog
    // TODO: can we serve a remote cache out of CloudFront instead? https://docs.gradle.org/8.1/userguide/build_cache.html#sec:build_cache_configure_remote
    dependencies {
        classpath(platform("software.amazon.awssdk:bom:2.20.111"))
    }
}

val regionEnv: Provider<String> = providers.environmentVariable("AWS_REGION")
val bucketEnv: Provider<String> = providers.environmentVariable("S3_BUILD_CACHE_BUCKET")
val prefixEnv: Provider<String> = providers.environmentVariable("S3_BUILD_CACHE_PREFIX")
if (regionEnv.isPresent && bucketEnv.isPresent && prefixEnv.isPresent) {
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

plugins {
    id("com.gradle.enterprise").version("3.15.1")
    id("com.github.burrunan.s3-build-cache").version("1.5")
}

gradleEnterprise {
    buildScan {
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
                    "2023.2", "2023.3" -> {
                        return@forEach
                    }
                }
            }

            val projectName = path.joinToString(separator = ":", prefix = ":")
            include(projectName)
            project(projectName).projectDir = it
        }
}

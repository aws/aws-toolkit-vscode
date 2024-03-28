// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.sdk.GenerateSdk
import software.aws.toolkits.gradle.sdk.GenerateSdkExtension
import software.aws.toolkits.gradle.jvmTarget

val sdkGenerator = project.extensions.create<GenerateSdkExtension>("sdkGenerator")

plugins {
    java
    id("org.jetbrains.gradle.plugin.idea-ext")
}

sourceSets {
    main {
        resources {
            setSrcDirs(listOf(sdkGenerator.c2jFolder))
        }

        java {
            setSrcDirs(listOf(sdkGenerator.srcDir()))
        }
    }

    test {
        java {
            setSrcDirs(emptyList<String>())
        }
    }
}

java {
    val target = project.jvmTarget().get()
    sourceCompatibility = target
    targetCompatibility = target
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}

val generateTask = tasks.register<GenerateSdk>("generateSdks")
tasks.named("compileJava") {
    dependsOn(generateTask)
}

idea {
    module {
        afterEvaluate {
            generatedSourceDirs = sourceDirs
        }
    }
}

// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.sdk.GenerateSdk
import software.aws.toolkits.gradle.sdk.GenerateSdkExtension

val sdkGenerator = project.extensions.create<GenerateSdkExtension>("sdkGenerator")

plugins {
    java
}

sourceSets {
    main {
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
    sourceCompatibility = software.aws.toolkits.gradle.jvmTarget
    targetCompatibility = software.aws.toolkits.gradle.jvmTarget
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}

val generateTask = tasks.register<GenerateSdk>("generateSdks")
tasks.named("compileJava") {
    dependsOn(generateTask)
}

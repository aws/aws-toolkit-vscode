// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.sdk.GenerateSdk

val awsSdkVersion: String by project

dependencies {
    implementation("software.amazon.awssdk:services:$awsSdkVersion")
    implementation("software.amazon.awssdk:aws-json-protocol:$awsSdkVersion")
    runtimeOnly("software.amazon.awssdk:core:$awsSdkVersion")
}

val generatedSources = "$buildDir/generated-src"

sourceSets {
    main {
        java.srcDir(generatedSources)
    }
}

idea {
    module {
        generatedSourceDirs.add(file(generatedSources))
    }
}

tasks.register<GenerateSdk>("generateTelemetryClient") {
    c2jFolder = file("telemetryC2J")
    outputDir = file(generatedSources)
}

tasks["compileJava"].dependsOn(tasks.named("generateTelemetryClient"))

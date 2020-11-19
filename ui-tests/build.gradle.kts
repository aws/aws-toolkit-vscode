// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import java.net.URI

val remoteRobotPort: String by project
val junit5Version: String by project
val remoteRobotVersion: String by project
val uiTestFixturesVersion: String by project
val awsSdkVersion: String by project
val coroutinesVersion: String by project

repositories {
    maven { url = URI("https://jetbrains.bintray.com/intellij-third-party-dependencies") }
}

plugins {
    jacoco
}

dependencies {
    testImplementation(gradleApi())
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")
    testImplementation("org.junit.jupiter:junit-jupiter-api:$junit5Version")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")
    testImplementation("com.intellij.remoterobot:remote-robot:$remoteRobotVersion")
    testImplementation("com.intellij.remoterobot:remote-fixtures:$uiTestFixturesVersion")
    testImplementation("software.amazon.awssdk:cloudformation:$awsSdkVersion")
    testImplementation("software.amazon.awssdk:cloudwatchlogs:$awsSdkVersion")
    testImplementation("software.amazon.awssdk:s3:$awsSdkVersion")
    testImplementation("software.amazon.awssdk:sns:$awsSdkVersion")
    testImplementation("software.amazon.awssdk:sqs:$awsSdkVersion")

    testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:$junit5Version")
}

// don't run gui tests as part of check
tasks.test {
    enabled = false
}

tasks.register<Test>("uiTestCore") {
    // we don't want to cache the results of this.
    outputs.upToDateWhen { false }

    systemProperty("robot-server.port", remoteRobotPort)
    systemProperty("junit.jupiter.extensions.autodetection.enabled", true)
    systemProperty("testDataPath", project.rootDir.toPath().resolve("testdata").toString())

    systemProperty("GRADLE_PROJECT", "jetbrains-core")
    useJUnitPlatform {
        includeTags("core")
    }
}

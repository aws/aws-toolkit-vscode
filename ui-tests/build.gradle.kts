// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.jacoco.RemoteCoverage.Companion.enableRemoteCoverage

val remoteRobotPort: String by project
val ideProfileName: String by project

repositories {
    maven { url = uri("https://cache-redirector.jetbrains.com/intellij-dependencies") }
}

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
}

dependencies {
    testImplementation(gradleApi())
    testImplementation(project(":plugin-toolkit:core"))
    testImplementation(project(path = ":plugin-toolkit:core", configuration = "testArtifacts"))
    testImplementation(project(":plugin-toolkit:resources"))
    testImplementation(libs.kotlin.coroutines)
    testImplementation(libs.junit5.jupiterApi)
    testImplementation(libs.intellijRemoteFixtures)
    testImplementation(libs.intellijRemoteRobot)
    testImplementation(libs.aws.cloudformation)
    testImplementation(libs.aws.cloudwatchlogs)
    testImplementation(libs.aws.dynamodb)
    testImplementation(libs.aws.s3)
    testImplementation(libs.aws.sns)
    testImplementation(libs.aws.sqs)
    testImplementation(libs.commons.io)
    // match version declared by intellijRemoteRobot
    testImplementation("com.squareup.okhttp3:okhttp:4.12.0")

    testRuntimeOnly(libs.junit5.jupiterEngine)
}

// don't run gui tests as part of check
tasks.test {
    enabled = false
}

tasks.register<Test>("uiTestCore") {
    dependsOn(":sandbox-all:prepareUiTestingSandbox")
    inputs.files(":sandbox-all:prepareUiTestingSandbox")

    systemProperty("ide.experimental.ui", false)
    systemProperty("org.gradle.project.ideProfileName", ideProfileName)
    systemProperty("robot-server.port", remoteRobotPort)
    systemProperty("junit.jupiter.extensions.autodetection.enabled", true)

    systemProperty("testDataPath", project.rootDir.resolve("testdata").toString())
    systemProperty("testReportPath", project.buildDir.resolve("reports").resolve("tests").resolve("testRecordings").toString())

    systemProperty("GRADLE_PROJECT", "sandbox-all")
    useJUnitPlatform {
        includeTags("core")
    }

    // We disable coverage for the JVM running our UI tests, we are running a TCP server that the sandbox IDE dumps to when it exits
    // This is transparent to coverageReport creation since the coverage gets associated with this tasks jacoco output
    configure<JacocoTaskExtension> {
        isEnabled = false
    }

    ciOnly {
        enableRemoteCoverage(this)
    }

    // TODO: can these be scoped down
    jvmArgs(
        "--add-opens=java.base/java.lang=ALL-UNNAMED",
        "--add-opens=java.base/java.util=ALL-UNNAMED"
    )
}

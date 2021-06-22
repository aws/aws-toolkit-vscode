import software.aws.toolkits.gradle.jacoco.RemoteCoverage.Companion.enableRemoteCoverage

// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

val remoteRobotPort: String by project
val junit5Version: String by project
val remoteRobotVersion: String by project
val awsSdkVersion: String by project
val coroutinesVersion: String by project
val apacheCommonsVersion: String by project

repositories {
    maven { url = uri("https://cache-redirector.jetbrains.com/intellij-dependencies") }
}

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-detekt")
    id("toolkit-testing")
}

dependencies {
    testImplementation(gradleApi())
    testImplementation(project(":core"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")
    testImplementation(project(":resources"))
    testImplementation("org.junit.jupiter:junit-jupiter-api:$junit5Version")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")
    testImplementation("com.intellij.remoterobot:remote-robot:$remoteRobotVersion")
    testImplementation("com.intellij.remoterobot:remote-fixtures:$remoteRobotVersion")
//    testImplementation("software.amazon.awssdk:cloudformation:$awsSdkVersion")
    testImplementation("software.amazon.awssdk:cloudwatchlogs:$awsSdkVersion")
    testImplementation("software.amazon.awssdk:s3:$awsSdkVersion")
    testImplementation("software.amazon.awssdk:sns:$awsSdkVersion")
    testImplementation("software.amazon.awssdk:sqs:$awsSdkVersion")

    testImplementation("commons-io:commons-io:$apacheCommonsVersion")
    testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:$junit5Version")
}

// don't run gui tests as part of check
tasks.test {
    enabled = false
}

tasks.register<Test>("uiTestCore") {
    dependsOn(":jetbrains-core:buildPlugin")
    inputs.files(":jetbrains-core:buildPlugin")

    systemProperty("robot-server.port", remoteRobotPort)
    systemProperty("junit.jupiter.extensions.autodetection.enabled", true)

    systemProperty("testDataPath", project.rootDir.resolve("testdata").toString())
    systemProperty("testReportPath", project.buildDir.resolve("reports").resolve("tests").resolve("testRecordings").toString())

    systemProperty("GRADLE_PROJECT", "jetbrains-core")
    useJUnitPlatform {
        includeTags("core")
    }

    // We disable coverage for the JVM running our UI tests, we are running a TCP server that the sandbox IDE dumps to when it exits
    // This is transparent to coverageReport creation since the coverage gets associated with this tasks jacoco output
    configure<JacocoTaskExtension> {
        isEnabled = false
    }

    enableRemoteCoverage(this)
}

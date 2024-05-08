// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.gradle.kotlin.dsl.kotlin
import org.gradle.kotlin.dsl.withType
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import software.aws.toolkits.gradle.jvmTarget
import software.aws.toolkits.gradle.kotlinTarget

plugins {
    id("java")
    kotlin("jvm")
}

val javaVersion = project.jvmTarget().get()
java {
    sourceCompatibility = javaVersion
    targetCompatibility = javaVersion
}

tasks.withType<KotlinCompile>().all {
    kotlinOptions {
        jvmTarget = javaVersion.majorVersion
        apiVersion = project.kotlinTarget().get()
        languageVersion = project.kotlinTarget().get()
        freeCompilerArgs = listOf("-Xjvm-default=all")
    }
}

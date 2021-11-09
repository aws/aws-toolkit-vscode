// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import io.gitlab.arturbosch.detekt.Detekt
import io.gitlab.arturbosch.detekt.DetektCreateBaselineTask
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

val kotlinVersion: String by project
val coroutinesVersion: String by project

plugins {
    id("java")
    kotlin("jvm")
    id("toolkit-detekt")
}

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlinVersion")
    implementation("org.jetbrains.kotlin:kotlin-reflect:$kotlinVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")

    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:$kotlinVersion")
}

sourceSets {
    main {
        java {
            setSrcDirs(listOf("src"))
        }
        resources {
            setSrcDirs(listOf("resources"))
        }
    }

    test {
        java {
            setSrcDirs(listOf("tst"))
        }
        resources {
            setSrcDirs(listOf("tst-resources"))
        }
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

tasks.withType<KotlinCompile>().all {
    kotlinOptions.jvmTarget = "11"
    kotlinOptions.apiVersion = "1.4"
}

tasks.withType<Detekt>().configureEach {
    jvmTarget = "11"
    dependsOn(":detekt-rules:assemble")
    exclude("build/**")
    exclude("**/*.Generated.kt")
    exclude("**/TelemetryDefinitions.kt")
}

tasks.withType<DetektCreateBaselineTask>().configureEach {
    jvmTarget = "11"
    dependsOn(":detekt-rules:assemble")
    exclude("build/**")
    exclude("**/*.Generated.kt")
    exclude("**/TelemetryDefinitions.kt")
}

project.afterEvaluate {
    tasks.check {
        dependsOn(tasks.detekt, tasks.named("detektMain"), tasks.named("detektTest"))

        tasks.findByName("detektIntegrationTest")?.let {
            dependsOn(it)
        }
    }
}
